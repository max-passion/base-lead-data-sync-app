const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { planDistribution } = require("./distributor");

class SyncService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.isRunningCycle = false;
    this.intervalHandle = null;
  }

  async start() {
    await this.ensureDirectories();
    this.logger.info("Sync service started.", {
      sourceDir: this.config.local.sourceDir,
      targetCount: this.config.targets.length,
      strictEvenDistribution: this.config.runtime.strictEvenDistribution,
      dryRun: this.config.runtime.dryRun
    });

    await this.runCycle();
    this.intervalHandle = setInterval(
      () => this.runCycle(),
      this.config.runtime.pollIntervalMs
    );
  }

  async stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async ensureDirectories() {
    await fs.mkdir(this.config.local.sourceDir, { recursive: true });
    await fs.mkdir(this.config.local.processedDir, { recursive: true });
    await fs.mkdir(this.config.local.failedDir, { recursive: true });
  }

  async runCycle() {
    if (this.isRunningCycle) {
      this.logger.warn("Skipping cycle because a previous cycle is still running.");
      return;
    }

    this.isRunningCycle = true;
    try {
      const files = await this.getReadyFiles();
      if (files.length === 0) {
        return;
      }

      const { assignments, deferredFiles } = planDistribution(
        files,
        this.config.targets,
        {
          strictEvenDistribution: this.config.runtime.strictEvenDistribution,
          maxFilesPerBatch: this.config.runtime.maxFilesPerBatch
        }
      );

      if (assignments.length === 0) {
        this.logger.info("Files are waiting for a full equal batch.", {
          readyFiles: files.length,
          deferredFiles: deferredFiles.length,
          targetCount: this.config.targets.length
        });
        return;
      }

      if (deferredFiles.length > 0) {
        this.logger.info("Some files were deferred to preserve even distribution.", {
          deferredFiles: deferredFiles.map((file) => path.basename(file.path))
        });
      }

      this.logger.info("Processing upload batch.", {
        files: assignments.length,
        targets: this.config.targets.length
      });

      for (const assignment of assignments) {
        await this.processAssignment(assignment);
      }
    } catch (error) {
      this.logger.error("Sync cycle failed.", { error: error.message });
    } finally {
      this.isRunningCycle = false;
    }
  }

  async getReadyFiles() {
    const directoryEntries = await fs.readdir(this.config.local.sourceDir, {
      withFileTypes: true
    });
    const now = Date.now();
    const files = [];

    for (const entry of directoryEntries) {
      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(this.config.local.sourceDir, entry.name);
      const stats = await fs.stat(filePath);
      if (now - stats.mtimeMs < this.config.runtime.stabilityWindowMs) {
        continue;
      }

      files.push({
        name: entry.name,
        path: filePath,
        mtimeMs: stats.mtimeMs,
        size: stats.size
      });
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async processAssignment({ file, target }) {
    const remoteFileName = this.buildRemoteFileName(file.name);
    const remotePath = `${target.remoteDir.replace(/\/+$/, "")}/${remoteFileName}`;

    if (this.config.runtime.dryRun) {
      this.logger.info("Dry run upload.", {
        file: file.name,
        target: target.name,
        host: target.host,
        remotePath
      });
      await this.moveLocalFile(file.path, this.config.local.processedDir);
      return;
    }

    try {
      await this.ensureRemoteDirectory(target);
      await this.uploadFile(file.path, target, remotePath);
      await this.moveLocalFile(file.path, this.config.local.processedDir);
      this.logger.info("Uploaded file successfully.", {
        file: file.name,
        target: target.name,
        host: target.host,
        remotePath
      });
    } catch (error) {
      await this.moveLocalFile(file.path, this.config.local.failedDir);
      this.logger.error("File upload failed.", {
        file: file.name,
        target: target.name,
        host: target.host,
        error: error.message
      });
    }
  }

  buildRemoteFileName(fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    return `${baseName}-${timestamp}${extension}`;
  }

  async moveLocalFile(sourcePath, destinationDir) {
    const targetPath = await this.buildUniqueLocalPath(destinationDir, path.basename(sourcePath));
    await fs.rename(sourcePath, targetPath);
    return targetPath;
  }

  async buildUniqueLocalPath(destinationDir, fileName) {
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    let candidate = path.join(destinationDir, fileName);
    let counter = 1;

    while (await this.exists(candidate)) {
      candidate = path.join(destinationDir, `${baseName}-${counter}${extension}`);
      counter += 1;
    }

    return candidate;
  }

  async exists(targetPath) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  ensureRemoteDirectory(target) {
    return this.runCommand("ssh", [
      "-i",
      this.config.ssh.privateKeyPath,
      "-p",
      String(this.config.ssh.port),
      "-o",
      `ConnectTimeout=${Math.ceil(this.config.ssh.connectTimeoutMs / 1000)}`,
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${this.config.ssh.username}@${target.host}`,
      `mkdir -p '${target.remoteDir.replace(/'/g, "'\\''")}'`
    ]);
  }

  uploadFile(localPath, target, remotePath) {
    return this.runCommand("scp", [
      "-i",
      this.config.ssh.privateKeyPath,
      "-P",
      String(this.config.ssh.port),
      "-o",
      `ConnectTimeout=${Math.ceil(this.config.ssh.connectTimeoutMs / 1000)}`,
      "-o",
      "StrictHostKeyChecking=accept-new",
      localPath,
      `${this.config.ssh.username}@${target.host}:${remotePath}`
    ]);
  }

  runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            stderr.trim() || `${command} exited with code ${code}`
          )
        );
      });
    });
  }
}

module.exports = {
  SyncService
};
