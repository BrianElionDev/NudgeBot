-- Add max drawdown and max profit percentage tracking fields
ALTER TABLE discord_token_trades
ADD COLUMN IF NOT EXISTS max_profit_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_drawdown_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_price_usd NUMERIC,
ADD COLUMN IF NOT EXISTS min_price_usd NUMERIC;

-- Add comments
COMMENT ON COLUMN discord_token_trades.max_profit_percent IS 'Maximum profit percentage achieved from entry price (highest gain)';
COMMENT ON COLUMN discord_token_trades.max_drawdown_percent IS 'Maximum drawdown percentage from entry price (lowest point, negative value)';
COMMENT ON COLUMN discord_token_trades.max_price_usd IS 'Highest price in USD reached after entry';
COMMENT ON COLUMN discord_token_trades.min_price_usd IS 'Lowest price in USD reached after entry';

-- Initialize existing records with 0 if they are null
UPDATE discord_token_trades
SET 
  max_profit_percent = COALESCE(max_profit_percent, 0),
  max_drawdown_percent = COALESCE(max_drawdown_percent, 0),
  max_price_usd = COALESCE(max_price_usd, entry_price_usd),
  min_price_usd = COALESCE(min_price_usd, entry_price_usd)
WHERE max_profit_percent IS NULL OR max_drawdown_percent IS NULL OR max_price_usd IS NULL OR min_price_usd IS NULL;


