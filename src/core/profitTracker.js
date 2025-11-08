import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";
import axios from "axios";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Maps chain names to GeckoTerminal network names
 * @param {string} chain - Chain name from our system
 * @returns {string} GeckoTerminal network name
 */
function mapChainToGeckoNetwork(chain) {
  const chainMap = {
    solana: "solana",
    bsc: "bsc",
    ethereum: "eth",
    polygon: "polygon_pos",
    arbitrum: "arbitrum",
    avalanche: "avax",
    base: "base",
  };
  return chainMap[chain?.toLowerCase()] || chain?.toLowerCase() || "solana";
}

/**
 * Fetches OHLC (Open, High, Low, Close) data from GeckoTerminal API
 * @param {string} tokenAddress - Token contract address
 * @param {string} network - Blockchain network (default: "solana")
 * @param {string} timeframe - Timeframe for OHLC data (default: "day")
 * @returns {Promise<Array|null>} Array of OHLC data points or null on error
 */
async function getTokenOHLC(tokenAddress, network = "solana", timeframe = "day") {
  try {
    const geckoNetwork = mapChainToGeckoNetwork(network);
    
    const poolRes = await axios.get(
      `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/tokens/${tokenAddress}/pools`
    );
    
    const poolData = poolRes.data;
    if (!poolData.data?.length) {
      logger.logAPI("GeckoTerminal", "no_pools_found", {
        contractAddress: tokenAddress,
        network: geckoNetwork,
      });
      return null;
    }
    
    const poolAddress = poolData.data[0].attributes.address;
    
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const ohlcUrl = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=1&before_timestamp=${currentTimestamp}&limit=100&currency=usd&include_empty_intervals=false&token=base`;
    
    const ohlcRes = await axios.get(ohlcUrl);
    const ohlcData = ohlcRes.data;
    
    const list = ohlcData?.data?.attributes?.ohlcv_list;
    if (!list?.length) {
      logger.logAPI("GeckoTerminal", "no_ohlc_data", {
        contractAddress: tokenAddress,
        network: geckoNetwork,
        poolAddress,
      });
      return null;
    }
    
    const formatted = list.map(
      ([timestamp, open, high, low, close, volume]) => ({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      })
    );
    
    logger.logAPI("GeckoTerminal", "ohlc_fetch_success", {
      contractAddress: tokenAddress,
      network: geckoNetwork,
      dataPoints: formatted.length,
    });
    
    return formatted;
  } catch (err) {
    logger.logException(err, {
      source: "getTokenOHLC",
      contractAddress: tokenAddress,
      network,
    });
    logger.error(`Failed to fetch OHLC data: ${err?.response?.data || err.message}`, {
      contractAddress: tokenAddress,
      network,
    });
    return null;
  }
}

/**
 * Fetches token data from DexScreener API
 * @param {string} contractAddress - Token contract address
 * @param {string} chain - Blockchain network (default: "bsc")
 * @returns {Promise<Object|null>} Token information or null if not found
 */
export async function getTokenDexData(contractAddress, chain = "solana") {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;
    const res = await fetch(url);

    if (!res.ok) {
      logger.logAPI("DexScreener", "fetch_failed", {
        contractAddress,
        chain,
        status: res.status,
        statusText: res.statusText,
      });
      logger.error(`DexScreener API error: ${res.status} ${res.statusText}`, {
        contractAddress,
        chain,
      });
      return null;
    }

    const data = await res.json();

    if (!data.pairs || data.pairs.length === 0) {
      logger.logAPI("DexScreener", "no_data", {
        contractAddress,
        chain,
      });
      logger.warn(`No data found for token: ${contractAddress}`, {
        contractAddress,
        chain,
      });
      return null;
    }

    // Find the pair matching the chain, or use the first one
    const token =
      data.pairs.find(
        (pair) => pair.chainId?.toLowerCase() === chain.toLowerCase()
      ) || data.pairs[0];

    const info = {
      name: token.baseToken?.name || "Unknown",
      symbol: token.baseToken?.symbol || "UNKNOWN",
      price_usd: token.priceUsd ? parseFloat(token.priceUsd) : null,
      liquidity_usd: token.liquidity?.usd
        ? parseFloat(token.liquidity.usd)
        : null,
      volume_24h: token.volume?.h24 ? parseFloat(token.volume.h24) : null,
      chain: token.chainId || chain,
    };

    logger.logAPI("DexScreener", "fetch_success", {
      contractAddress,
      chain,
      tokenSymbol: info.symbol,
      tokenName: info.name,
      price: info.price_usd,
    });
    logger.info(
      `Token data fetched: ${info.symbol} (${info.name}) - $${info.price_usd}`,
      { contractAddress, chain }
    );
    return info;
  } catch (err) {
    logger.logException(err, {
      source: "getTokenDexData",
      contractAddress,
      chain,
    });
    logger.error(`Failed to fetch token data: ${err?.stack || err}`, {
      contractAddress,
      chain,
    });
    return null;
  }
}

/**
 * Records a new token trade entry with entry price
 * @param {Object} tradeData - Trade information
 * @param {string} tradeData.contractAddress - Token contract address
 * @param {string} tradeData.caller - Discord username
 * @param {string} tradeData.sourceChannelId - UUID of the source channel from discord_source_channels
 * @param {string} tradeData.messageLink - Link to Discord message
 * @param {string} tradeData.chain - Blockchain network (default: "bsc")
 * @returns {Promise<Object|null>} Created trade record or null on error
 */
export async function recordTokenEntry({
  contractAddress,
  caller,
  sourceChannelId,
  messageLink,
  chain = "bsc",
}) {
  if (!supabase) {
    logger.error("Supabase client not initialized. Cannot record token entry.");
    return null;
  }

  try {
    // Fetch current token data to get entry price
    const tokenData = await getTokenDexData(contractAddress, chain);

    if (!tokenData) {
      logger.warn(
        `Could not fetch token data for ${contractAddress}. Entry not recorded.`
      );
      return null;
    }

    // Insert new trade record (multiple trades for same contract-caller are allowed)
    const { data, error } = await supabase
      .from("discord_token_trades")
      .insert({
        contract_address: contractAddress,
        chain: tokenData.chain || chain,
        caller: caller,
        source_channel_id: sourceChannelId,
        message_link: messageLink,
        token_name: tokenData.name,
        token_symbol: tokenData.symbol,
        entry_price_usd: tokenData.price_usd,
        entry_liquidity_usd: tokenData.liquidity_usd,
        entry_volume_24h: tokenData.volume_24h,
        current_price_usd: tokenData.price_usd, // Initialize with entry price
        current_liquidity_usd: tokenData.liquidity_usd,
        current_volume_24h: tokenData.volume_24h,
        last_updated: new Date().toISOString(),
        price_change_percent: 0, // No change at entry
        profit_loss_usd: 0,
        is_profitable: null, // Not applicable at entry
        max_profit_percent: 0, // Initialize max profit at 0
        max_drawdown_percent: 0, // Initialize max drawdown at 0
        max_price_usd: tokenData.price_usd, // Initialize with entry price
        min_price_usd: tokenData.price_usd, // Initialize with entry price
        status: "active",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logTradeEntry({
      contractAddress,
      caller,
      tokenSymbol: tokenData.symbol,
      entryPrice: tokenData.price_usd,
      chain: tokenData.chain || chain,
      tradeId: data.id,
      sourceChannelId,
      messageLink,
    });
    logger.info(
      `Token entry recorded: ${tokenData.symbol} (${contractAddress}) by ${caller} at $${tokenData.price_usd}`,
      {
        tradeId: data.id,
        contractAddress,
        caller,
        entryPrice: tokenData.price_usd,
      }
    );

    return data;
  } catch (err) {
    logger.logException(err, {
      source: "recordTokenEntry",
      contractAddress,
      caller,
    });
    logger.error(`Failed to record token entry: ${err?.stack || err}`, {
      contractAddress,
      caller,
    });
    return null;
  }
}

/**
 * Updates current price and calculates profit/loss for a trade
 * @param {string} tradeId - Trade record ID
 * @returns {Promise<Object|null>} Updated trade record or null on error
 */
export async function updateTokenPrice(tradeId) {
  if (!supabase) {
    logger.error("Supabase client not initialized. Cannot update token price.");
    return null;
  }

  try {
    // Get the trade record
    const { data: trade, error: fetchError } = await supabase
      .from("discord_token_trades")
      .select("*")
      .eq("id", tradeId)
      .single();

    if (fetchError || !trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    // Fetch current token data
    const tokenData = await getTokenDexData(
      trade.contract_address,
      trade.chain
    );

    if (!tokenData || tokenData.price_usd === null) {
      logger.warn(`Could not fetch current price for trade ${tradeId}`);
      return null;
    }

    // Calculate profit/loss
    const entryPrice = parseFloat(trade.entry_price_usd);
    const currentPrice = tokenData.price_usd;
    const priceChangePercent =
      entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
    const profitLossUsd = currentPrice - entryPrice;
    const isProfitable = profitLossUsd > 0;

    // Get existing max values (default to 0 if null)
    let existingMaxProfit = parseFloat(trade.max_profit_percent) || 0;
    let existingMaxDrawdown = parseFloat(trade.max_drawdown_percent) || 0;
    let existingMaxPrice = parseFloat(trade.max_price_usd) || entryPrice;
    let existingMinPrice = parseFloat(trade.min_price_usd) || entryPrice;

    // Fetch OHLC data to find highest/lowest prices since entry
    const entryTimestamp = new Date(trade.entry_timestamp).getTime() / 1000;
    const ohlcData = await getTokenOHLC(trade.contract_address, trade.chain, "day");
    
    // Initialize with entry price or existing values
    let highestPrice = Math.max(existingMaxPrice, entryPrice);
    let lowestPrice = Math.min(existingMinPrice, entryPrice);
    
    if (ohlcData && ohlcData.length > 0) {
      // Filter OHLC data to only include data points after entry
      const dataSinceEntry = ohlcData.filter(
        (point) => point.timestamp >= entryTimestamp
      );
      
      if (dataSinceEntry.length > 0) {
        // Check all high/low values from OHLC data
        dataSinceEntry.forEach((point) => {
          if (point.high > highestPrice) highestPrice = point.high;
          if (point.low < lowestPrice && point.low > 0) lowestPrice = point.low;
        });
      }
    }
    
    // Also include current price in the comparison
    if (currentPrice > highestPrice) highestPrice = currentPrice;
    if (currentPrice < lowestPrice) lowestPrice = currentPrice;
    
    // Calculate percentages from entry price
    const highestProfitPercent =
      entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice) * 100 : 0;
    const lowestDrawdownPercent =
      entryPrice > 0 ? ((lowestPrice - entryPrice) / entryPrice) * 100 : 0;
    
    // Update max profit if we found a higher gain
    const maxProfitPercent =
      highestProfitPercent > existingMaxProfit
        ? highestProfitPercent
        : existingMaxProfit;

    // Update max drawdown if we found a lower (more negative) value
    const maxDrawdownPercent =
      lowestDrawdownPercent < existingMaxDrawdown
        ? lowestDrawdownPercent
        : existingMaxDrawdown;

    // Update the trade record
    const { data, error } = await supabase
      .from("discord_token_trades")
      .update({
        current_price_usd: currentPrice,
        current_liquidity_usd: tokenData.liquidity_usd,
        current_volume_24h: tokenData.volume_24h,
        price_change_percent: priceChangePercent,
        profit_loss_usd: profitLossUsd,
        is_profitable: isProfitable,
        max_profit_percent: maxProfitPercent,
        max_drawdown_percent: maxDrawdownPercent,
        max_price_usd: highestPrice,
        min_price_usd: lowestPrice,
        last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tradeId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.logTradeUpdate({
      tradeId: trade.id,
      contractAddress: trade.contract_address,
      tokenSymbol: trade.token_symbol,
      entryPrice,
      currentPrice,
      priceChangePercent,
      profitLossUsd,
      isProfitable,
      maxProfitPercent,
      maxDrawdownPercent,
    });
    logger.info(
      `Price updated for ${
        trade.token_symbol
      }: $${entryPrice} -> $${currentPrice} (${priceChangePercent.toFixed(
        2
      )}%)`,
      {
        tradeId: trade.id,
        contractAddress: trade.contract_address,
        priceChangePercent,
        profitLossUsd,
        isProfitable,
        maxProfitPercent,
        maxDrawdownPercent,
      }
    );

    return data;
  } catch (err) {
    logger.logException(err, {
      source: "updateTokenPrice",
      tradeId,
    });
    logger.error(`Failed to update token price: ${err?.stack || err}`, {
      tradeId,
    });
    return null;
  }
}

/**
 * Updates prices for all active trades
 * @returns {Promise<number>} Number of trades updated
 */
export async function updateAllActiveTrades() {
  if (!supabase) {
    logger.error("Supabase client not initialized. Cannot update trades.");
    return 0;
  }

  try {
    // Get all active trades
    const { data: activeTrades, error } = await supabase
      .from("discord_token_trades")
      .select("id")
      .eq("status", "active");

    if (error) {
      throw error;
    }

    if (!activeTrades || activeTrades.length === 0) {
      logger.info("No active trades to update");
      return 0;
    }

    // Update each trade
    let updatedCount = 0;
    for (const trade of activeTrades) {
      const result = await updateTokenPrice(trade.id);
      if (result) {
        updatedCount++;
      }
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    logger.info(
      `Updated ${updatedCount} of ${activeTrades.length} active trades`,
      { updatedCount, totalActive: activeTrades.length }
    );
    return updatedCount;
  } catch (err) {
    logger.logException(err, {
      source: "updateAllActiveTrades",
    });
    logger.error(`Failed to update all active trades: ${err?.stack || err}`);
    return 0;
  }
}

/**
 * Marks trades older than specified days as closed
 * @param {number} daysOld - Number of days after which trades should be marked as closed (default: 7)
 * @returns {Promise<number>} Number of trades marked as closed
 */
export async function markOldTradesAsClosed(daysOld = 7) {
  if (!supabase) {
    logger.error(
      "Supabase client not initialized. Cannot mark old trades as closed."
    );
    return 0;
  }

  try {
    // Calculate the cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffDateISO = cutoffDate.toISOString();

    // Update trades older than 7 days
    const { data, error } = await supabase
      .from("discord_token_trades")
      .update({
        status: "closed",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "active")
      .lt("entry_timestamp", cutoffDateISO)
      .select("*");

    if (error) {
      throw error;
    }

    const closedCount = data?.length || 0;
    if (closedCount > 0) {
      // Log each closed trade
      data.forEach((trade) => {
        const daysActive = Math.floor(
          (new Date() - new Date(trade.entry_timestamp)) / (1000 * 60 * 60 * 24)
        );
        logger.logTradeClosed({
          tradeId: trade.id,
          contractAddress: trade.contract_address,
          caller: trade.caller,
          tokenSymbol: trade.token_symbol,
          entryPrice: parseFloat(trade.entry_price_usd),
          finalPrice: parseFloat(trade.current_price_usd),
          finalProfitLoss: parseFloat(trade.profit_loss_usd),
          daysActive,
          maxProfitPercent: parseFloat(trade.max_profit_percent) || 0,
          maxDrawdownPercent: parseFloat(trade.max_drawdown_percent) || 0,
        });
      });
      logger.info(
        `Marked ${closedCount} trade(s) older than ${daysOld} days as closed`,
        { closedCount, daysOld }
      );
    }

    return closedCount;
  } catch (err) {
    logger.logException(err, {
      source: "markOldTradesAsClosed",
      daysOld,
    });
    logger.error(`Failed to mark old trades as closed: ${err?.stack || err}`, {
      daysOld,
    });
    return 0;
  }
}

/**
 * Scheduled job to update prices and mark old trades as closed
 * This should be called every hour
 * @returns {Promise<Object>} Summary of the update operation
 */
export async function runHourlyPriceUpdate() {
  logger.info("Starting hourly price update job...");
  const startTime = Date.now();

  try {
    // First, mark old trades (7+ days) as closed
    const closedCount = await markOldTradesAsClosed(7);

    // Then update prices for remaining active trades
    const updatedCount = await updateAllActiveTrades();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const result = {
      closedCount,
      updatedCount,
      duration: parseFloat(duration),
    };

    logger.logScheduledJob("hourly_price_update", result);
    logger.info(
      `Hourly price update completed in ${duration}s: ${closedCount} trades closed, ${updatedCount} trades updated`,
      result
    );

    return result;
  } catch (err) {
    logger.logException(err, {
      source: "runHourlyPriceUpdate",
    });
    logger.error(`Hourly price update job failed: ${err?.stack || err}`, {
      error: err.message,
    });
    return {
      closedCount: 0,
      updatedCount: 0,
      error: err.message,
    };
  }
}

/**
 * Gets profit statistics for a caller
 * @param {string} caller - Discord username
 * @returns {Promise<Object|null>} Profit statistics or null on error
 */
export async function getCallerProfitStats(caller) {
  if (!supabase) {
    logger.error("Supabase client not initialized. Cannot get profit stats.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("discord_token_trades")
      .select("*")
      .eq("caller", caller)
      .eq("status", "active");

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return {
        total_trades: 0,
        profitable_trades: 0,
        total_profit_loss: 0,
        average_change_percent: 0,
      };
    }

    const profitableTrades = data.filter(
      (trade) => trade.is_profitable === true
    ).length;
    const totalProfitLoss = data.reduce(
      (sum, trade) => sum + (parseFloat(trade.profit_loss_usd) || 0),
      0
    );
    const averageChangePercent =
      data.reduce(
        (sum, trade) => sum + (parseFloat(trade.price_change_percent) || 0),
        0
      ) / data.length;

    return {
      total_trades: data.length,
      profitable_trades: profitableTrades,
      total_profit_loss: totalProfitLoss,
      average_change_percent: averageChangePercent,
    };
  } catch (err) {
    logger.error(`Failed to get caller profit stats: ${err?.stack || err}`);
    return null;
  }
}
