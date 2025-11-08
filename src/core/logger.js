import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "../../logs");

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Filter for high-level console logs only
const consoleFilter = winston.format((info) => {
  // Always show errors and warnings
  if (info.level === "error" || info.level === "warn") {
    return info;
  }
  
  // Show high-level info messages (not detailed logs)
  // Filter out: [TRADE], [API], [DISCORD], [SCHEDULED_JOB] detailed logs
  // But allow through: server started, major events, etc.
  if (info.level === "info") {
    const message = info.message || "";
    
    // Show if it's a high-level message (doesn't start with [TRADE], [API], [DISCORD], [SCHEDULED_JOB])
    if (
      !message.startsWith("[TRADE]") &&
      !message.startsWith("[API]") &&
      !message.startsWith("[DISCORD]") &&
      !message.startsWith("[SCHEDULED_JOB]") &&
      !message.startsWith("[EXCEPTION]")
    ) {
      return info;
    }
    
    // Filter out detailed logs
    return false;
  }
  
  return info;
});

// Custom format for console output (high-level only)
const consoleFormat = winston.format.combine(
  consoleFilter(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    // Only show metadata for errors/warnings
    if ((level === "error" || level === "warn") && Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Custom format for file output (text format, line-by-line)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let logLine = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace if present
    if (stack) {
      logLine += `\n${stack}`;
    }
    
    // Add metadata as key-value pairs
    if (Object.keys(metadata).length > 0) {
      const metaStr = Object.entries(metadata)
        .map(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            return `${key}=${JSON.stringify(value)}`;
          }
          return `${key}=${value}`;
        })
        .join(" ");
      logLine += ` | ${metaStr}`;
    }
    
    return logLine;
  })
);

// Base logger configuration
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: { service: "nudgebot" },
  transports: [
    // Console transport - high-level logs only (filtered)
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Combined log file - all logs in text format
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Error log file - errors only in text format
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Create specialized loggers
export const logger = {
  // Standard logging methods
  error: (message, meta = {}) => {
    baseLogger.error(message, meta);
  },
  warn: (message, meta = {}) => {
    baseLogger.warn(message, meta);
  },
  info: (message, meta = {}) => {
    baseLogger.info(message, meta);
  },
  debug: (message, meta = {}) => {
    baseLogger.debug(message, meta);
  },

  // Trade-specific logging
  logTrade: (action, tradeData) => {
    baseLogger.info(`[TRADE] ${action}`, {
      type: "trade",
      action,
      ...tradeData,
    });
  },

  logTradeEntry: (tradeData) => {
    baseLogger.info("[TRADE] Entry recorded", {
      type: "trade_entry",
      contractAddress: tradeData.contractAddress,
      caller: tradeData.caller,
      tokenSymbol: tradeData.tokenSymbol,
      entryPrice: tradeData.entryPrice,
      chain: tradeData.chain,
      tradeId: tradeData.tradeId,
    });
  },

  logTradeUpdate: (tradeData) => {
    baseLogger.info("[TRADE] Price updated", {
      type: "trade_update",
      tradeId: tradeData.tradeId,
      contractAddress: tradeData.contractAddress,
      tokenSymbol: tradeData.tokenSymbol,
      entryPrice: tradeData.entryPrice,
      currentPrice: tradeData.currentPrice,
      priceChangePercent: tradeData.priceChangePercent,
      profitLossUsd: tradeData.profitLossUsd,
      isProfitable: tradeData.isProfitable,
      maxProfitPercent: tradeData.maxProfitPercent,
      maxDrawdownPercent: tradeData.maxDrawdownPercent,
    });
  },

  logTradeClosed: (tradeData) => {
    baseLogger.info("[TRADE] Trade closed", {
      type: "trade_closed",
      tradeId: tradeData.tradeId,
      contractAddress: tradeData.contractAddress,
      caller: tradeData.caller,
      tokenSymbol: tradeData.tokenSymbol,
      entryPrice: tradeData.entryPrice,
      finalPrice: tradeData.finalPrice,
      finalProfitLoss: tradeData.finalProfitLoss,
      daysActive: tradeData.daysActive,
      maxProfitPercent: tradeData.maxProfitPercent,
      maxDrawdownPercent: tradeData.maxDrawdownPercent,
    });
  },

  // Exception logging
  logException: (error, context = {}) => {
    baseLogger.error("[EXCEPTION] Unhandled exception", {
      type: "exception",
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    });
  },

  // API logging
  logAPI: (service, action, data = {}) => {
    baseLogger.info(`[API] ${service} - ${action}`, {
      type: "api",
      service,
      action,
      ...data,
    });
  },

  // Discord logging
  logDiscord: (event, data = {}) => {
    baseLogger.info(`[DISCORD] ${event}`, {
      type: "discord",
      event,
      ...data,
    });
  },

  // Scheduled job logging
  logScheduledJob: (jobName, result) => {
    baseLogger.info(`[SCHEDULED_JOB] ${jobName}`, {
      type: "scheduled_job",
      jobName,
      ...result,
    });
  },
};

// Note: Uncaught exception and unhandled rejection handlers are set up in main.js
// to allow proper cleanup. These handlers here just log for cases where main.js
// handlers might not catch everything.