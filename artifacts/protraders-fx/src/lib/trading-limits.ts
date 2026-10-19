/**
 * Run-level limits apply to settled NET P/L, not stake, balance, or a quote.
 * A zero limit is disabled. The epsilon only absorbs floating-point noise at
 * exact currency boundaries; it is far smaller than a displayed cent.
 */
export function reachedTradingLimit(
  settledNetProfit: number,
  takeProfit: number,
  stopLoss: number,
): "take-profit" | "stop-loss" | null {
  if (!Number.isFinite(settledNetProfit) || !Number.isFinite(takeProfit) || !Number.isFinite(stopLoss)) return null;
  const epsilon = 1e-9;
  if (takeProfit > 0 && settledNetProfit >= takeProfit - epsilon) return "take-profit";
  if (stopLoss > 0 && settledNetProfit <= -stopLoss + epsilon) return "stop-loss";
  return null;
}
