import assert from "node:assert/strict";
import test from "node:test";
import { reachedTradingLimit } from "./trading-limits.ts";

test("take-profit stops the run at the configured cumulative net-profit target", () => {
  assert.equal(reachedTradingLimit(9.99, 10, 5), null);
  assert.equal(reachedTradingLimit(10, 10, 5), "take-profit");
  assert.equal(reachedTradingLimit(12, 10, 5), "take-profit");
  assert.equal(reachedTradingLimit(0.1 + 0.2, 0.3, 2), "take-profit");
});

test("stop-loss stops at the configured cumulative net-loss threshold", () => {
  assert.equal(reachedTradingLimit(-4.99, 10, 5), null);
  assert.equal(reachedTradingLimit(-5, 10, 5), "stop-loss");
  assert.equal(reachedTradingLimit(-7, 10, 5), "stop-loss");
  assert.equal(reachedTradingLimit(-0.1 - 0.2, 10, 0.3), "stop-loss");
});

test("zero disables only its own limit and invalid values never invent a stop", () => {
  assert.equal(reachedTradingLimit(100, 0, 0), null);
  assert.equal(reachedTradingLimit(-100, 0, 0), null);
  assert.equal(reachedTradingLimit(10, 10, 0), "take-profit");
  assert.equal(reachedTradingLimit(-10, 0, 10), "stop-loss");
  assert.equal(reachedTradingLimit(Number.NaN, 10, 5), null);
});

test("a settled contract that reaches either limit prevents another run", () => {
  const outcomes = [-4, -6, 50];
  let total = 0;
  let placed = 0;
  let reason = null;
  for (const outcome of outcomes) {
    if (reason) break;
    placed += 1;
    total += outcome;
    reason = reachedTradingLimit(total, 10, 10);
  }
  assert.equal(placed, 2);
  assert.equal(total, -10);
  assert.equal(reason, "stop-loss");
});
