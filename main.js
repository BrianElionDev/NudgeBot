import "dotenv/config";
import { logger } from "./src/core/logger.js";
import { StartWebsocket } from "./src/sources/discord.js";

logger.info("NudgeBot starting...");

const stopWebsocket = StartWebsocket();

let stopped = false;
function stopAll(code = 0) {
  if (stopped) return;
  stopped = true;
  try {
    stopWebsocket?.();
  } catch {}
  process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
process.on("beforeExit", () => stopAll(0));
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err?.stack || err}`);
  stopAll(1);
});
