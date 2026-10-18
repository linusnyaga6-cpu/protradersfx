import assert from "node:assert/strict";
import test from "node:test";
import { convertUsdKesAmount } from "./currency-converter.ts";

test("calculator supports USD to KSh and KSh to USD including zero", () => {
  assert.equal(convertUsdKesAmount("10", 129.75, "USD_TO_KES"), 1297.5);
  assert.equal(convertUsdKesAmount("1297.5", 129.75, "KES_TO_USD"), 10);
  assert.equal(convertUsdKesAmount("0", 129.75, "USD_TO_KES"), 0);
});

test("calculator rejects blank, negative, invalid amounts and missing rates", () => {
  for (const amount of ["", " ", "abc", "-1", Infinity]) {
    assert.equal(convertUsdKesAmount(amount, 129.75, "USD_TO_KES"), null);
  }
  for (const rate of [null, 0, -1, NaN, Infinity]) {
    assert.equal(convertUsdKesAmount("10", rate, "USD_TO_KES"), null);
  }
});
