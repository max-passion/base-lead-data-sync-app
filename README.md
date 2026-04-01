# Base Folder to Ubuntu VPS Sync App

This app watches a local folder on your Windows computer and uploads files to one or more Ubuntu VPS folders over SSH.

If you configure multiple VPS targets, the app distributes files evenly:

- `1` VPS: every ready file can be uploaded immediately.
- `2+` VPS with `strictEvenDistribution: true`: files are uploaded only in full equal batches so each VPS gets the same count.
- Example: with 3 VPS targets, 7 ready files means 6 files are uploaded now and 1 stays queued until more files arrive.

After a successful upload, the file is moved out of the source folder:

- success -> `processedDir`
- failure -> `failedDir`

## What You Need To Provide

Before running the app, you need:

1. The local source folder path on this computer.
2. A local processed folder path.
3. A local failed folder path.
4. Each Ubuntu VPS IP address.
5. The SSH username for the VPS, such as `ubuntu`.
6. The SSH private key path on this computer.
7. The target folder path on each VPS.

## Setup

1. Copy `sync.config.example.json` to `sync.config.json`.
2. Fill in your real folder paths, VPS IPs, SSH username, private key path, and remote directories.
3. You can use `~\\.ssh\\...` for the private key path, and the app will expand `~` to your Windows home folder.
4. Make sure OpenSSH is available on this Windows machine:
   - `ssh`
   - `scp`
5. Make sure the SSH key can log in to each VPS without interactive prompts.
6. Run the app:

```powershell
npm start
```

## Behavior Notes

- The app uses polling, so it keeps checking the source folder for new files.
- A file is considered ready only after it has not changed for the configured `stabilityWindowMs`.
- The app creates the remote directory with `mkdir -p` before uploading.
- Uploaded files receive a timestamp suffix on the VPS to prevent remote name collisions.
- The app does not delete failed files; it moves them to `failedDir`.
- Set `dryRun` to `true` if you want to simulate uploads. In the current implementation, dry-run files are still moved into `processedDir`, so use copied test files when trying it.

## Config Reference

### `local`

- `sourceDir`: folder to watch for new files
- `processedDir`: where successful files are moved locally
- `failedDir`: where failed files are moved locally

### `runtime`

- `pollIntervalMs`: how often the folder is scanned
- `stabilityWindowMs`: minimum age since last modification before a file is considered safe to upload
- `strictEvenDistribution`: when `true`, only uploads full equal batches across all VPS targets
- `dryRun`: if `true`, logs planned actions without calling SSH/SCP
- `maxFilesPerBatch`: upper limit on files handled per cycle

### `ssh`

- `username`: SSH username
- `privateKeyPath`: path to the SSH private key on Windows
- `port`: SSH port
- `connectTimeoutMs`: SSH connect timeout

### `targets`

- `name`: label for logs
- `host`: VPS IP or hostname
- `remoteDir`: destination directory on the VPS

## Important Assumptions

- Files are assigned evenly in alphabetical order.
- With multiple VPS targets and strict even mode enabled, leftover files wait in the source folder until a full equal batch is available.
- The app uses `ssh` and `scp`, so key-based auth is strongly recommended.

## Run Tests

```powershell
npm test
```
