ALTER TABLE discord_channel_configs
ADD CONSTRAINT fk_channel_configs_source_channel
FOREIGN KEY (channel)
REFERENCES discord_source_channels(channel_id)
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE discord_channel_configs
ADD CONSTRAINT fk_channel_configs_destination_server
FOREIGN KEY (destination_server)
REFERENCES discord_destination_servers(server_name)
ON DELETE RESTRICT
ON UPDATE CASCADE;





