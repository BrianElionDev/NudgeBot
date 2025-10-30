import notifier from "node-notifier";
import { logger } from "./logger.js";

function resolveSoundSetting() {
  const raw = process.env.NOTIFIER_SOUND || true;
  if (raw === undefined) return true;
  const lower = String(raw).toLowerCase();
  if (lower === "false") return false;
  if (lower === "true") return true;
  return raw;
}

export const pushNotification = (title, message) => {
  notifier.notify({
    title,
    message,
    sound: resolveSoundSetting(),
    wait: false,
    // Windows-specific: customize app name and icon shown in the toast
    appID:
      process.platform === "win32"
        ? process.env.NOTIFIER_APP_ID || "🔔 NudgeBot"
        : undefined,
    icon:
      process.platform === "win32"
        ? process.env.NOTIFIER_ICON || undefined
        : undefined,
  });
  logger.info(`Notification sent: ${title} - ${message}`);
};
