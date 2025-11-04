import "./src/core/config.js";
import { logger } from "./src/core/logger.js";
import { startTelegramSource } from "./src/sources/telegram.js";

logger.info("Starting Telegram demo...");

const stopTelegram = startTelegramSource();

if (!stopTelegram) {
  logger.error("Failed to start Telegram source. Check your TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}

let stopped = false;
function stopAll(code = 0) {
  if (stopped) return;
  stopped = true;
  try {
    stopTelegram?.();
  } catch (err) {
    logger.error(`Error stopping Telegram: ${err.message}`);
  }
  process.exit(code);
}

process.on("SIGINT", () => {
  logger.info("Shutting down gracefully...");
  stopAll(0);
});

process.on("SIGTERM", () => stopAll(0));

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err?.stack || err}`);
  stopAll(1);
});

logger.info("Telegram bot is running. Press Ctrl+C to stop.");



