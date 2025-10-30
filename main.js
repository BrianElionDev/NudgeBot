import "dotenv/config";
import { logger } from "./src/core/logger.js";
import { startDemoSource } from "./src/sources/demo.js";

logger.info("NudgeBot (demo) starting...");

// Start demo source and keep process alive
const stopDemo = startDemoSource(Number(process.env.DEMO_INTERVAL_MS || 8000));

let stopped = false;
function stopAll(code = 0) {
  if (stopped) return;
  stopped = true;
  try {
    stopDemo?.();
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
