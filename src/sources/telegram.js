import TelegramBot from "node-telegram-bot-api";
import { logger } from "../core/logger.js";
import "../core/config.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHANNELS_TO_MONITOR = process.env.TELEGRAM_CHANNELS
  ? process.env.TELEGRAM_CHANNELS.split(",").map((c) => c.trim())
  : [];

let bot = null;

export function startTelegramSource() {
  if (!TOKEN) {
    logger.error("TELEGRAM_BOT_TOKEN is not set");
    return null;
  }

  if (CHANNELS_TO_MONITOR.length === 0) {
    logger.warn("No channels configured. Set TELEGRAM_CHANNELS env var");
  }

  bot = new TelegramBot(TOKEN, { polling: true });

  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const chatTitle = msg.chat.title || msg.chat.username || "Unknown";
    const chatUsername = msg.chat.username;
    const chatType = msg.chat.type;
    const from = msg.from?.username || msg.from?.first_name || "Unknown";
    const text = msg.text || msg.caption || "";
    const messageId = msg.message_id;

    const isChannel = chatType === "channel" || chatType === "supergroup";
    const channelIdentifier = chatUsername
      ? `@${chatUsername}`
      : `ID:${chatId}`;

    const shouldMonitor =
      CHANNELS_TO_MONITOR.length === 0 ||
      CHANNELS_TO_MONITOR.some(
        (ch) =>
          ch === channelIdentifier ||
          ch === chatUsername ||
          ch === String(chatId)
      );

    if (!shouldMonitor && CHANNELS_TO_MONITOR.length > 0) {
      return;
    }

    if (isChannel || chatType === "supergroup") {
      const link = chatUsername
        ? `https://t.me/${chatUsername}/${messageId}`
        : `https://t.me/c/${String(chatId).replace(/-100/, "")}/${messageId}`;

      logger.info(`💬 New Telegram message:`);
      logger.info(`📺 Channel: ${chatTitle} (${channelIdentifier})`);
      logger.info(`👤 Author: ${from}`);
      logger.info(`📅 Message ID: ${messageId}`);
      logger.info(`🔗 Link: ${link}`);
      logger.info(`📝 Content: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`);
      logger.info("-------------------------------");

      handleTelegramMessage({
        channelId: String(chatId),
        channelName: chatTitle,
        channelUsername: chatUsername,
        channelIdentifier,
        author: from,
        messageId,
        content: text,
        link,
        timestamp: new Date(msg.date * 1000).toISOString(),
      });
    }
  });

  bot.on("channel_post", (msg) => {
    const chatId = msg.chat.id;
    const chatTitle = msg.chat.title || msg.chat.username || "Unknown";
    const chatUsername = msg.chat.username;
    const text = msg.text || msg.caption || "";
    const messageId = msg.message_id;

    const channelIdentifier = chatUsername
      ? `@${chatUsername}`
      : `ID:${chatId}`;

    const shouldMonitor =
      CHANNELS_TO_MONITOR.length === 0 ||
      CHANNELS_TO_MONITOR.some(
        (ch) =>
          ch === channelIdentifier ||
          ch === chatUsername ||
          ch === String(chatId)
      );

    if (!shouldMonitor && CHANNELS_TO_MONITOR.length > 0) {
      return;
    }

    const link = chatUsername
      ? `https://t.me/${chatUsername}/${messageId}`
      : `https://t.me/c/${String(chatId).replace(/-100/, "")}/${messageId}`;

    logger.info(`💬 New Telegram channel post:`);
    logger.info(`📺 Channel: ${chatTitle} (${channelIdentifier})`);
    logger.info(`📅 Message ID: ${messageId}`);
    logger.info(`🔗 Link: ${link}`);
    logger.info(`📝 Content: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`);
    logger.info("-------------------------------");

    handleTelegramMessage({
      channelId: String(chatId),
      channelName: chatTitle,
      channelUsername: chatUsername,
      channelIdentifier,
      author: "Channel",
      messageId,
      content: text,
      link,
      timestamp: new Date(msg.date * 1000).toISOString(),
    });
  });

  bot.on("edited_message", (msg) => {
    logger.info(`✏️ Edited message in ${msg.chat.title || msg.chat.username}`);
  });

  bot.on("error", (error) => {
    logger.error(`Telegram bot error: ${error.message}`);
  });

  bot.on("polling_error", (error) => {
    logger.error(`Telegram polling error: ${error.message}`);
  });

  logger.info("Telegram bot started and listening for messages");

  return () => {
    if (bot) {
      bot.stopPolling();
      logger.info("Telegram bot stopped");
    }
  };
}

function handleTelegramMessage(messageData) {
  const { channelName, channelIdentifier, author, content, link } =
    messageData;

  console.log("Processing Telegram message:", {
    channel: channelName,
    author,
    content: content.substring(0, 100),
  });
}

