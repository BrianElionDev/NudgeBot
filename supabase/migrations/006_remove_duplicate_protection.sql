-- Remove duplicate protection constraint to allow multiple independent trades
-- for the same contract-caller combination

-- Drop the unique index if it exists
DROP INDEX IF EXISTS idx_discord_token_trades_unique_active;

COMMENT ON TABLE discord_token_trades IS 'Tracks Discord token trades for profit analysis. Multiple active trades for the same contract-caller combination are allowed - each trade is independent.';


