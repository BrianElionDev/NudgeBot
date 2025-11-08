-- Add unique constraint to prevent duplicate channel configs
-- This ensures that the same channel-caller-destination_server combination cannot exist twice

ALTER TABLE discord_channel_configs
ADD CONSTRAINT unique_channel_config 
UNIQUE (channel, caller, destination_server);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT unique_channel_config ON discord_channel_configs IS 
'Prevents duplicate channel configurations: same channel, caller, and destination_server combination cannot exist multiple times';


