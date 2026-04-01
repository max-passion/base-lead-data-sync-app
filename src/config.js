const fs = require("fs");
const path = require("path");

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function resolvePath(baseDir, targetPath) {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Expected a non-empty path string.");
  }

  return path.isAbsolute(targetPath)
    ? path.normalize(targetPath)
    : path.resolve(baseDir, targetPath);
}

function validateTarget(target, index) {
  if (!target || typeof target !== "object") {
    throw new Error(`Target at index ${index} must be an object.`);
  }

  if (!target.name || !target.host || !target.remoteDir) {
    throw new Error(
      `Target at index ${index} must include name, host, and remoteDir.`
    );
  }
}

function loadConfig(configPath) {
  const resolvedConfigPath = path.resolve(configPath || "sync.config.json");
  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(
      `Config file not found at ${resolvedConfigPath}. Copy sync.config.example.json to sync.config.json first.`
    );
  }

  const raw = fs.readFileSync(resolvedConfigPath, "utf8");
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in config file: ${error.message}`);
  }

  const configDir = path.dirname(resolvedConfigPath);
  const config = {
    local: {
      sourceDir: resolvePath(configDir, parsed.local?.sourceDir),
      processedDir: resolvePath(configDir, parsed.local?.processedDir),
      failedDir: resolvePath(configDir, parsed.local?.failedDir)
    },
    runtime: {
      pollIntervalMs: parsed.runtime?.pollIntervalMs ?? 10000,
      stabilityWindowMs: parsed.runtime?.stabilityWindowMs ?? 5000,
      strictEvenDistribution: parsed.runtime?.strictEvenDistribution !== false,
      dryRun: parsed.runtime?.dryRun === true,
      maxFilesPerBatch: parsed.runtime?.maxFilesPerBatch ?? 100
    },
    ssh: {
      username: parsed.ssh?.username,
      privateKeyPath: resolvePath(configDir, parsed.ssh?.privateKeyPath),
      port: parsed.ssh?.port ?? 22,
      connectTimeoutMs: parsed.ssh?.connectTimeoutMs ?? 15000
    },
    targets: parsed.targets
  };

  if (!isPositiveInteger(config.runtime.pollIntervalMs)) {
    throw new Error("runtime.pollIntervalMs must be a positive integer.");
  }

  if (!isPositiveInteger(config.runtime.stabilityWindowMs)) {
    throw new Error("runtime.stabilityWindowMs must be a positive integer.");
  }

  if (!isPositiveInteger(config.runtime.maxFilesPerBatch)) {
    throw new Error("runtime.maxFilesPerBatch must be a positive integer.");
  }

  if (!config.ssh.username || typeof config.ssh.username !== "string") {
    throw new Error("ssh.username is required.");
  }

  if (!isPositiveInteger(config.ssh.port)) {
    throw new Error("ssh.port must be a positive integer.");
  }

  if (!isPositiveInteger(config.ssh.connectTimeoutMs)) {
    throw new Error("ssh.connectTimeoutMs must be a positive integer.");
  }

  if (!fs.existsSync(config.ssh.privateKeyPath)) {
    throw new Error(`SSH private key not found: ${config.ssh.privateKeyPath}`);
  }

  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error("targets must contain at least one VPS target.");
  }

  config.targets.forEach(validateTarget);

  return config;
}

module.exports = {
  loadConfig
};
