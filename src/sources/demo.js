import { pushNotification } from "../core/notifier.js";
import { logger } from "../core/logger.js";

const demoMessages = [
  {
    user: "Alice",
    channel: "general",
    text: "Hey there! This is a demo message.",
  },
  {
    user: "Bob",
    channel: "random",
    text: "Reminder: drink water and take a break.",
  },
  {
    user: "Charlie",
    channel: "alerts",
    text: "Build finished successfully ✅",
  },
  {
    user: "Dana",
    channel: "dm",
    text: "Ping! Are you available for a quick chat?",
  },
];

export function startDemoSource(
  intervalMs = Number(process.env.DEMO_INTERVAL_MS || 8000)
) {
  const maxMessages = Number(process.env.DEMO_MAX_MESSAGES || 5);
  logger.info(
    `Starting demo source. Interval: ${intervalMs}ms, Max: ${maxMessages}`
  );

  let sent = 0;
  const timer = setInterval(() => {
    if (sent >= maxMessages) {
      clearInterval(timer);
      logger.info("Demo source reached max messages and stopped.");
      return;
    }
    const sample =
      demoMessages[Math.floor(Math.random() * demoMessages.length)];
    const title = `Demo • ${sample.user} (#${sample.channel})`;
    pushNotification(title, sample.text);
    sent += 1;
  }, intervalMs);

  return () => {
    clearInterval(timer);
    logger.info("Demo source stopped.");
  };
}
