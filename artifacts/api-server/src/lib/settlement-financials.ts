/** Quoted payout is not sale proceeds. Only use it as a settled win fallback. */
export function settlementFinancials(
  contract: { status?: unknown; profit?: unknown; sell_price?: unknown; payout?: unknown },
  buyPrice: number,
  settled: boolean,
) {
  const finite = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  if (!settled) return { profit: null, payout: null };
  const reported = finite(contract.profit);
  const sale = finite(contract.sell_price);
  const profit = sale !== null
    ? sale - buyPrice
    : contract.status === "lost"
      ? reported !== null && reported < 0 ? reported : -Math.abs(buyPrice)
      : reported ?? (contract.status === "won" && finite(contract.payout) !== null
        ? finite(contract.payout)! - buyPrice : null);
  return { profit, payout: profit === null ? null : buyPrice + profit };
}
