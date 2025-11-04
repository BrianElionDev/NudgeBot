import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  logger.warn(
    "Supabase credentials not configured. Channel configs will not be loaded."
  );
}

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const SOURCE_CHANNELS = {
  "1374512585201684541": {
    serverName: "OC",
    channelName: "Oc-channel-1",
  },
  "1103867552213499934": {
    serverName: "OC",
    channelName: "Oc-channel-2",
  },
  "1412863957554958519": {
    serverName: "OC",
    channelName: "Oc-channel-testing",
  },
};

const DESTINATION_SERVER_MAP = {
  "oc-degen": process.env.DISCORD_WEBHOOK_OC_DEGEN || "",
  "oc-nightfall": process.env.DISCORD_WEBHOOK_OC_NIGHTFALL || "",
};

function getDestinationEndpoint(destinationServer) {
  return DESTINATION_SERVER_MAP[destinationServer] || "";
}

export class ChannelConfig {
  constructor({
    channelId,
    channelName,
    serverName,
    caller,
    destinationServer,
    destinationEndpoint,
  }) {
    this.channelId = channelId;
    this.channelName = channelName;
    this.serverName = serverName;
    this.caller = caller;
    this.destinationServer = destinationServer;
    this.destinationEndpoint = destinationEndpoint;
  }

  matchesChannel(channelId) {
    return this.channelId === channelId;
  }

  matchesCaller(username) {
    return this.caller === username;
  }
}

let CHANNEL_CONFIGS = [];
let configsLoaded = false;

async function loadChannelConfigs() {
  if (!supabase) {
    logger.error(
      "Supabase client not initialized. Cannot load channel configs."
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("discord_channel_configs")
      .select("*");

    if (error) {
      throw error;
    }

    CHANNEL_CONFIGS = (data || [])
      .map((row) => {
        const channelInfo = SOURCE_CHANNELS[row.channel];
        if (!channelInfo) {
          logger.warn(`Unknown source channel: ${row.channel}`);
          return null;
        }

        const destinationEndpoint = getDestinationEndpoint(
          row.destination_server
        );

        return new ChannelConfig({
          channelId: row.channel,
          channelName: channelInfo.channelName,
          serverName: channelInfo.serverName,
          caller: row.caller,
          destinationServer: row.destination_server,
          destinationEndpoint,
        });
      })
      .filter(Boolean);

    configsLoaded = true;
    logger.info(
      `Loaded ${CHANNEL_CONFIGS.length} channel configs from Supabase`
    );
  } catch (err) {
    logger.error(
      `Failed to load channel configs from Supabase: ${err?.stack || err}`
    );
  }
}

export async function initializeChannelConfigs() {
  if (!configsLoaded) {
    await loadChannelConfigs();
  }
}

export async function findChannelConfig(channelId, username) {
  if (!configsLoaded) {
    await initializeChannelConfigs();
  }
  return CHANNEL_CONFIGS.find(
    (config) =>
      config.matchesChannel(channelId) && config.matchesCaller(username)
  );
}

export function getSourceChannelInfo(channelId) {
  return SOURCE_CHANNELS[channelId] || null;
}

export function getAllChannelIds() {
  return Object.keys(SOURCE_CHANNELS);
}
