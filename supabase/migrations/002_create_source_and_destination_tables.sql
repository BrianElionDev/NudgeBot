CREATE TABLE IF NOT EXISTS discord_source_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL UNIQUE,
  server_name TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_channels_channel_id 
  ON discord_source_channels(channel_id);

COMMENT ON TABLE discord_source_channels IS 'Source Discord channels configuration';
COMMENT ON COLUMN discord_source_channels.channel_id IS 'Discord channel ID';
COMMENT ON COLUMN discord_source_channels.server_name IS 'Server name';
COMMENT ON COLUMN discord_source_channels.channel_name IS 'Channel display name';

INSERT INTO discord_source_channels (channel_id, server_name, channel_name)
VALUES 
  ('1374512585201684541', 'OC', 'Oc-channel-1'),
  ('1103867552213499934', 'OC', 'Oc-channel-2'),
  ('1412863957554958519', 'OC', 'Oc-channel-testing')
ON CONFLICT (channel_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS discord_destination_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destination_servers_server_name 
  ON discord_destination_servers(server_name);

COMMENT ON TABLE discord_destination_servers IS 'Destination server webhook URLs';
COMMENT ON COLUMN discord_destination_servers.server_name IS 'Destination server name (e.g., oc-degen, oc-nightfall)';
COMMENT ON COLUMN discord_destination_servers.webhook_url IS 'Discord webhook URL';

INSERT INTO discord_destination_servers (server_name, webhook_url)
VALUES 
  ('oc-degen', ''),
  ('oc-nightfall', '')
ON CONFLICT (server_name) DO UPDATE SET webhook_url = EXCLUDED.webhook_url;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'discord_source_channels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discord_source_channels;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'discord_destination_servers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discord_destination_servers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'discord_channel_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discord_channel_configs;
  END IF;
END $$;

