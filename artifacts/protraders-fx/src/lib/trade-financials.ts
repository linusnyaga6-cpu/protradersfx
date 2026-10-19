export type TradeFinancials = {
  status?: unknown;
  result?: unknown;
  settlementPending?: boolean;
  orderStatusUnknown?: boolean;
  payout?: unknown;
  buyPrice?: unknown;
  stake?: unknown;
  profit?: unknown;
};

function finiteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

export function actualTradeStake(trade: TradeFinancials) {
  const paid = finiteNumber(trade.buyPrice);
  if (paid !== null && paid >= 0) return paid;
  const stake = finiteNumber(trade.stake);
  return stake !== null && stake >= 0 ? stake : null;
}

export function settledTradeNetProfit(trade: TradeFinancials) {
  const status = String(trade.status ?? trade.result ?? "").toLowerCase();
  if (
    trade.settlementPending ||
    trade.orderStatusUnknown ||
    status === "open" ||
    status === "pending" ||
    status === "unknown"
  ) {
    return null;
  }

  const buyPrice = actualTradeStake(trade);
  const payout = finiteNumber(trade.payout);
  if (payout !== null && buyPrice !== null) {
    return payout - buyPrice;
  }

  const reportedProfit = finiteNumber(trade.profit);
  if (reportedProfit !== null) {
    return reportedProfit;
  }

  if (status === "lost" && buyPrice !== null) {
    return -Math.abs(buyPrice);
  }
  return null;
}

export function sumSettledTradeNetProfit<T extends TradeFinancials>(trades: T[]) {
  if (!trades.length) return null;
  const profits = trades.map(settledTradeNetProfit);
  if (profits.some((profit) => profit === null)) return null;
  return profits.reduce<number>((total, profit) => total + (profit ?? 0), 0);
}

export function normalizeTradeExecution<T extends TradeFinancials & { contractId?: unknown; transactionId?: unknown }>(trade: T) {
  const normalized = {
    ...trade,
    buyPrice: finiteNumber(trade.buyPrice) ?? undefined,
    stake: actualTradeStake(trade) ?? undefined,
    payout: finiteNumber(trade.payout),
    profit: finiteNumber(trade.profit),
  };
  const profit = settledTradeNetProfit(normalized);
  const hasIdentifier = [trade.contractId, trade.transactionId].some(
    (value) => (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value)),
  );
  return {
    ...normalized,
    profit,
    settlementPending: Boolean(trade.settlementPending || (profit === null && hasIdentifier && !trade.orderStatusUnknown)),
    orderStatusUnknown: Boolean(trade.orderStatusUnknown || (profit === null && !hasIdentifier)),
  };
}
