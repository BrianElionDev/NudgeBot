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

let SOURCE_CHANNELS = {};
let DESTINATION_SERVER_MAP = {};
let CHANNEL_CONFIGS = [];
let configsLoaded = false;
let realtimeSubscriptions = [];

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

async function loadSourceChannels() {
  if (!supabase) {
    logger.error(
      "Supabase client not initialized. Cannot load source channels."
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("discord_source_channels")
      .select("*");

    if (error) {
      throw error;
    }

    SOURCE_CHANNELS = {};
    (data || []).forEach((row) => {
      SOURCE_CHANNELS[row.channel_id] = {
        serverName: row.server_name,
        channelName: row.channel_name,
      };
    });

    logger.info(
      `Loaded ${Object.keys(SOURCE_CHANNELS).length} source channels from Supabase`
    );
  } catch (err) {
    logger.error(
      `Failed to load source channels from Supabase: ${err?.stack || err}`
    );
  }
}

async function loadDestinationServers() {
  if (!supabase) {
    logger.error(
      "Supabase client not initialized. Cannot load destination servers."
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("discord_destination_servers")
      .select("*");

    if (error) {
      throw error;
    }

    DESTINATION_SERVER_MAP = {};
    (data || []).forEach((row) => {
      DESTINATION_SERVER_MAP[row.server_name] = row.webhook_url || "";
    });

    logger.info(
      `Loaded ${Object.keys(DESTINATION_SERVER_MAP).length} destination servers from Supabase`
    );
  } catch (err) {
    logger.error(
      `Failed to load destination servers from Supabase: ${err?.stack || err}`
    );
  }
}

async function rebuildChannelConfigs() {
  if (!supabase) {
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

    logger.info(
      `Rebuilt ${CHANNEL_CONFIGS.length} channel configs`
    );
  } catch (err) {
    logger.error(
      `Failed to rebuild channel configs: ${err?.stack || err}`
    );
  }
}

async function loadChannelConfigs() {
  if (!supabase) {
    logger.error(
      "Supabase client not initialized. Cannot load channel configs."
    );
    return;
  }

  await loadSourceChannels();
  await loadDestinationServers();
  await rebuildChannelConfigs();

  configsLoaded = true;
}

function setupRealtimeSubscriptions() {
  if (!supabase) {
    logger.warn("Supabase client not initialized. Cannot setup realtime subscriptions.");
    return;
  }

  const channel1 = supabase
    .channel("discord_source_channels_changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "discord_source_channels",
      },
      async (payload) => {
        logger.info(`Source channel change detected: ${payload.eventType}`);
        await loadSourceChannels();
        await rebuildChannelConfigs();
      }
    )
    .subscribe();

  const channel2 = supabase
    .channel("discord_destination_servers_changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "discord_destination_servers",
      },
      async (payload) => {
        logger.info(`Destination server change detected: ${payload.eventType}`);
        await loadDestinationServers();
        await rebuildChannelConfigs();
      }
    )
    .subscribe();

  const channel3 = supabase
    .channel("discord_channel_configs_changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "discord_channel_configs",
      },
      async (payload) => {
        logger.info(`Channel config change detected: ${payload.eventType}`);
        await rebuildChannelConfigs();
      }
    )
    .subscribe();

  realtimeSubscriptions = [channel1, channel2, channel3];
  logger.info("Realtime subscriptions setup complete");
}

export async function initializeChannelConfigs() {
  if (!configsLoaded) {
    await loadChannelConfigs();
    setupRealtimeSubscriptions();
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

export function cleanup() {
  realtimeSubscriptions.forEach((subscription) => {
    if (subscription) {
      subscription.unsubscribe();
    }
  });
  realtimeSubscriptions = [];
}
