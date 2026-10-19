import test from "node:test";
import assert from "node:assert/strict";
import { settlementFinancials } from "./settlement-financials.ts";

test("a lost contract's winning quote cannot turn it into a profit", () => {
  assert.deepEqual(settlementFinancials({status:"lost", payout:19, profit:-10},10,true), {profit:-10,payout:0});
  assert.deepEqual(settlementFinancials({status:"lost", payout:19},10,true), {profit:-10,payout:0});
});
test("sale proceeds and broker net profit determine results, not the quote", () => {
  assert.deepEqual(settlementFinancials({status:"sold", payout:19, sell_price:6, profit:-4},10,true), {profit:-4,payout:6});
  assert.deepEqual(settlementFinancials({status:"won", payout:19, profit:9},10,true), {profit:9,payout:19});
  assert.deepEqual(settlementFinancials({status:"open", payout:19, profit:9},10,false), {profit:null,payout:null});
});
