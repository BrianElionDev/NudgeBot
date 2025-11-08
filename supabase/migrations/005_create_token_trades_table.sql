-- Create table for tracking token trades and profit analysis
CREATE TABLE IF NOT EXISTS discord_token_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'bsc',
  caller TEXT NOT NULL,
  source_channel_id UUID REFERENCES discord_source_channels(id) ON DELETE SET NULL,
  message_link TEXT,
  
  -- Token info at entry
  token_name TEXT,
  token_symbol TEXT,
  entry_price_usd NUMERIC,
  entry_liquidity_usd NUMERIC,
  entry_volume_24h NUMERIC,
  entry_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Current token info (updated periodically)
  current_price_usd NUMERIC,
  current_liquidity_usd NUMERIC,
  current_volume_24h NUMERIC,
  last_updated TIMESTAMP WITH TIME ZONE,
  
  -- Profit calculations
  price_change_percent NUMERIC,
  profit_loss_usd NUMERIC,
  is_profitable BOOLEAN,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'closed', 'archived'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_discord_token_trades_contract_address 
  ON discord_token_trades(contract_address);

CREATE INDEX IF NOT EXISTS idx_discord_token_trades_caller 
  ON discord_token_trades(caller);

CREATE INDEX IF NOT EXISTS idx_discord_token_trades_status 
  ON discord_token_trades(status);

CREATE INDEX IF NOT EXISTS idx_discord_token_trades_entry_timestamp 
  ON discord_token_trades(entry_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_discord_token_trades_source_channel_id 
  ON discord_token_trades(source_channel_id);

-- Note: Multiple active trades for the same contract-caller combination are allowed
-- Each trade is independent and tracked separately

-- Add comments
COMMENT ON TABLE discord_token_trades IS 'Tracks Discord token trades for profit analysis';
COMMENT ON COLUMN discord_token_trades.contract_address IS 'Token contract address';
COMMENT ON COLUMN discord_token_trades.chain IS 'Blockchain network (e.g., bsc, ethereum, solana)';
COMMENT ON COLUMN discord_token_trades.caller IS 'Discord username who called the token';
COMMENT ON COLUMN discord_token_trades.source_channel_id IS 'Reference to discord_source_channels table';
COMMENT ON COLUMN discord_token_trades.message_link IS 'Link to the Discord message';
COMMENT ON COLUMN discord_token_trades.entry_price_usd IS 'Token price in USD when trade was initiated';
COMMENT ON COLUMN discord_token_trades.current_price_usd IS 'Current token price in USD';
COMMENT ON COLUMN discord_token_trades.price_change_percent IS 'Percentage change from entry price';
COMMENT ON COLUMN discord_token_trades.profit_loss_usd IS 'Profit/loss in USD (calculated)';
COMMENT ON COLUMN discord_token_trades.is_profitable IS 'Boolean indicating if trade is profitable';
COMMENT ON COLUMN discord_token_trades.status IS 'Trade status: active, closed, archived';

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'discord_token_trades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE discord_token_trades;
  END IF;
END $$;

