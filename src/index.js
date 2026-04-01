const { loadConfig } = require("./config");
const logger = require("./logger");
const { SyncService } = require("./syncService");

async function main() {
  const configPath = process.argv[2] || "sync.config.json";
  const config = loadConfig(configPath);
  const service = new SyncService(config, logger);

  process.on("SIGINT", async () => {
    logger.info("Received SIGINT. Stopping service.");
    await service.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM. Stopping service.");
    await service.stop();
    process.exit(0);
  });

  await service.start();
}

main().catch((error) => {
  logger.error("Application failed to start.", { error: error.message });
  process.exit(1);
});
