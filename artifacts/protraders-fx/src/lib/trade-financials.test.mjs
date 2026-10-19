import assert from "node:assert/strict";
import test from "node:test";
import { actualTradeStake, normalizeTradeExecution, settledTradeNetProfit, sumSettledTradeNetProfit, tradeResultFinancialState } from "./trade-financials.ts";

test("martingale results use the actual paid stake and keep net P/L separate", () => {
  const trades = [
    { contractId: 1, stake: 1, buyPrice: 1, payout: 0, status: "lost" },
    { contractId: 2, stake: 1, buyPrice: 2, payout: 0, status: "lost" },
    { contractId: 3, stake: 1, buyPrice: 4, payout: 7.6, status: "won" },
  ].map(normalizeTradeExecution);
  assert.deepEqual(trades.map(actualTradeStake), [1, 2, 4]);
  assert.deepEqual(trades.map(trade => trade.stake), [1, 2, 4]);
  assert.ok(Math.abs(settledTradeNetProfit(trades[2]) - 3.6) < 1e-8);
  assert.ok(Math.abs(sumSettledTradeNetProfit(trades) - 0.6) < 1e-8);
  assert.equal(trades.reduce((total, trade) => total + actualTradeStake(trade), 0), 7);
});

test("gross profit or unrelated balance cannot override a settled payout minus paid price", () => {
  assert.equal(settledTradeNetProfit({ buyPrice: 10, stake: 1, payout: 18, profit: 5000, balance: 5018, status: "won" }), 8);
  assert.equal(settledTradeNetProfit({ buyPrice: 20, payout: 0, profit: 20, status: "lost" }), -20);
  assert.equal(settledTradeNetProfit({ buyPrice: 10, payout: 10, status: "sold" }), 0);
});

test("unsettled trades remain pending; unknown purchases are not counted as confirmed contract value", () => {
  assert.equal(settledTradeNetProfit({ buyPrice: 4, payout: 7.6, status: "open" }), null);
  assert.equal(settledTradeNetProfit({ buyPrice: 4, payout: 7.6, settlementPending: true }), null);
  assert.equal(actualTradeStake({ buyPrice: "-4", stake: "2" }), 2);
  assert.equal(actualTradeStake({}), null);
});

test("result headline follows settled contract rows, never a stale aggregate or balance", () => {
  assert.deepEqual(tradeResultFinancialState({
    profit: 999, tradeResults: [{ buyPrice: 10, payout: 0, result: "lost" }],
  }), { profit: -10, pending: false, orderStatusUnknown: false });
  assert.deepEqual(tradeResultFinancialState({
    profit: -999, tradeResults: [{ buyPrice: 10, payout: 18, result: "won" }],
  }), { profit: 8, pending: false, orderStatusUnknown: false });
  assert.equal(tradeResultFinancialState({
    profit: 999, tradeResults: [{ buyPrice: 10, payout: 10, status: "sold" }],
  }).profit, 0);
});

test("pending or uncertain rows cannot produce a false profit headline", () => {
  assert.deepEqual(tradeResultFinancialState({
    profit: 999, tradeResults: [{ buyPrice: 10, payout: 18, status: "open" }],
  }), { profit: null, pending: true, orderStatusUnknown: false });
  assert.equal(tradeResultFinancialState({
    profit: 999, tradeResults: [{ orderStatusUnknown: true }],
  }).orderStatusUnknown, true);
});
