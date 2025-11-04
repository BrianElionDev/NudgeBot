CREATE TABLE IF NOT EXISTS discord_channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'Discord',
  channel TEXT NOT NULL,
  caller TEXT NOT NULL,
  destination_server TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, channel, caller)
);

CREATE INDEX IF NOT EXISTS idx_channel_configs_lookup 
  ON discord_channel_configs(platform, channel, caller);

COMMENT ON TABLE discord_channel_configs IS 'Mapping of callers to destination servers per channel';
COMMENT ON COLUMN discord_channel_configs.platform IS 'Platform type (e.g., Discord)';
COMMENT ON COLUMN discord_channel_configs.channel IS 'Discord channel ID (source)';
COMMENT ON COLUMN discord_channel_configs.caller IS 'Discord username (caller)';
COMMENT ON COLUMN discord_channel_configs.destination_server IS 'Destination server name (e.g., oc-degen, oc-nightfall)';

INSERT INTO discord_channel_configs (platform, channel, caller, destination_server)
VALUES 
  ('Discord', '1374512585201684541', 'tripw1re', 'oc-nightfall'),
  ('Discord', '1374512585201684541', 'turbotorb', 'oc-nightfall'),
  ('Discord', '1103867552213499934', 'tripw1re', 'oc-degen'),
  ('Discord', '1103867552213499934', 'turbotorb', 'oc-degen'),
  ('Discord', '1103867552213499934', 'cccasp3r', 'oc-degen'),
  ('Discord', '1103867552213499934', 'djadidadiddy', 'oc-degen'),
  ('Discord', '1103867552213499934', 'chillcorset', 'oc-degen'),
  ('Discord', '1103867552213499934', 'pseudonymrandom', 'oc-degen'),
  ('Discord', '1103867552213499934', 'forfun9458', 'oc-degen'),
  ('Discord', '1103867552213499934', 'deloreablood', 'oc-degen')
ON CONFLICT (platform, channel, caller) DO NOTHING;

