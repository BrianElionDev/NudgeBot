import WebSocket from "ws";
import { pushNotification } from "../core/notifier.js";
import { logger } from "../core/logger.js";
import "dotenv/config";

const TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const TARGET_CHANNELS_ID = ["1412863957554958519"];
const TARGET_AUTHORS_USERNAME = ["ash_night_owl"];
const CONTRACT_REGEX =
  /\b(?:0x[a-fA-F0-9]{40,64}|[A-HJ-NP-Za-km-z1-9]{32,64})\b/;

// Session state
let sequence = null;
let sessionId = null;
let heartbeatInterval = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 5000; // 5 seconds
let ws;

function connect() {
  const ws = new WebSocket(GATEWAY_URL);

  ws.on("open", () => {
    console.log("Connected to Discord Gateway");
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  });

  ws.on("message", (data) => {
    const payload = JSON.parse(data);
    const { t, s, op, d } = payload;

    // Update sequence number for session resumption
    if (s) sequence = s;

    switch (op) {
      case 10: // Hello
        const { heartbeat_interval } = d;

        // Clear existing heartbeat interval
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }

        // Start sending heartbeats
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 1, d: sequence }));
          }
        }, heartbeat_interval);

        // Identify or resume session
        if (sessionId) {
          // Resume previous session
          const resumePayload = {
            op: 6,
            d: {
              token: TOKEN,
              session_id: sessionId,
              seq: sequence,
            },
          };
          ws.send(JSON.stringify(resumePayload));
          console.log("Attempting to resume session");
        } else {
          // Identify as new session
          const identifyPayload = {
            op: 2,
            d: {
              token: TOKEN,
              intents: 513 + 32768, // GUILDS (1) + GUILD_MESSAGES (512)
              properties: {
                os: "linux",
                browser: "my_library",
                device: "my_library",
              },
            },
          };
          ws.send(JSON.stringify(identifyPayload));
          console.log("Sent Identify payload");
        }
        break;

      case 11: // Heartbeat ACK
        //console.log("✅ Heartbeat acknowledged");
        break;

      case 7: // Reconnect
        console.log("Server requested reconnect");
        ws.close(4000); // Close with reconnect code
        break;

      case 9: // Invalid Session
        console.log("Invalid session, reconnecting...");
        sessionId = null;
        sequence = null;
        setTimeout(connect, reconnectDelay);
        break;

      default:
        // Handle events
        if (t === "READY") {
          console.log("Bot is ready");
          sessionId = d?.session_id || sessionId;
        } else if (t === "RESUMED") {
          console.log("Session resumed successfully");
        } else if (t === "MESSAGE_CREATE") {
          handleMessageCreate(d);
        }
        break;
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`Disconnected from Discord: ${code} - ${reason}`);

    // Clear heartbeat interval
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    // Handle reconnection
    if (code !== 1000 && code !== 1001) {
      // Don't reconnect on normal closures
      handleReconnection();
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  return ws;
}

export async function handleMessageCreate(d) {
  if (!TARGET_CHANNELS_ID.includes(d.channel_id)) return;
  if (!TARGET_AUTHORS_USERNAME.includes(d.author.username)) return;
  if (!checkIfContractIsInTheMessage(d.content)) return;
  const logEntry = {
    id: d.id,
    guild_id: d.guild_id || "DM",
    channel_id: d.channel_id,
    author: `${d.author.username}`,
    content: d.content,
    timestamp: d.timestamp,
    link: d.guild_id
      ? `https://discord.com/channels/${d.guild_id}/${d.channel_id}/${d.id}`
      : null,
  };

  const link = `https://discord.com/channels/${d.guild_id}/${d.channel_id}/${d.id}`;
  console.log("💬 New message:");
  console.log(`👤 Author: ${d.author.username}`);
  console.log(`📅 Date: ${d.timestamp}`);
  console.log(`🔗 Link: ${link}`);
  console.log(`📝 Content: ${d.content}`);
  console.log("-------------------------------");

  try {
    const title = `Discord • ${d.author.username} (#${d.channel_id})`;
    const preview =
      d.content.length > 220 ? `${d.content.slice(0, 217)}...` : d.content;
    pushNotification(title, preview || "(no text)");
    logger.info(`Discord notify ${d.author.username} ${d.id}`);

    const contractAddress = extractContractAddress(d.content);
    if (contractAddress) {
      await sendToWebhook(d.author.username, contractAddress, d.content);
    }
  } catch (err) {
    logger.error(`Failed to push notification: ${err?.stack || err}`);
  }
}

function handleReconnection() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const delay = reconnectDelay * reconnectAttempts;
    console.log(
      `Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`
    );

    setTimeout(() => {
      connect();
    }, delay);
  } else {
    console.error(
      "Max reconnection attempts reached. Please check your token and connection."
    );
  }
}

// Store the WebSocket instance
export function StartWebsocket() {
  ws = connect();
  return () => {
    try {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Normal shutdown");
      }
    } catch {}
  };
}

// Graceful shutdown for direct module run
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(1000, "Normal shutdown");
  }
  process.exit(0);
});

function checkIfContractIsInTheMessage(content = "") {
  return CONTRACT_REGEX.test(content);
}

function extractContractAddress(content = "") {
  const match = content.match(CONTRACT_REGEX);
  return match ? match[0] : null;
}

async function sendToWebhook(username, contractAddress, content) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `**Username:** ${username}\n**Contract Address:** ${contractAddress}`,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook failed: ${response.status} ${response.statusText}`
      );
    }

    logger.info(`Webhook forwarded: ${username} - ${contractAddress}`);
  } catch (err) {
    logger.error(`Failed to send webhook: ${err?.stack || err}`);
  }
}

// Convenience start when importing as a source
export function startDiscordSource() {
  return StartWebsocket();
}
