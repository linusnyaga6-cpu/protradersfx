import assert from "node:assert/strict";
import test from "node:test";
import { countries } from "./languages.ts";
import { convertCurrency, countryCurrencies, currencyNames, isDisplayCurrency, rateFor } from "./currencies.ts";
import { formatMoneyForDisplay, formatSignedMoneyForDisplay } from "./display-currency.ts";

const rates = Object.fromEntries(Object.keys(currencyNames).map((code, index) => [code, code === "USD" ? 1 : index * 10]));
rates.KES = 130;
rates.EUR = 0.9;
rates.NGN = 1500;

test("all listed countries have an available currency, with KSh explicitly present", () => {
  assert.equal(Object.keys(currencyNames).length, 49);
  for (const country of countries) assert.ok(isDisplayCurrency(countryCurrencies[country]), country);
  assert.equal(countryCurrencies.KE, "KES");
  assert.match(currencyNames.KES, /KSh/);
  assert.equal(countryCurrencies.HR, "EUR");
});
test("all supported currency pairs round-trip without altering account amounts", () => {
  for (const from of Object.keys(currencyNames)) for (const to of Object.keys(currencyNames)) {
    const result = convertCurrency(10, from, to, rates);
    assert.ok(result !== null);
    assert.ok(Math.abs(convertCurrency(result, to, from, rates) - 10) < 1e-10, `${from}/${to}`);
  }
});
test("KSh, euro, and naira amounts and net P/L convert through the same USD table", () => {
  assert.equal(formatMoneyForDisplay(10, "USD", "KES", rates), "KSh 1,300.00");
  assert.equal(formatMoneyForDisplay(1300, "KSH", "EUR", rates), "EUR 9.00");
  assert.equal(formatMoneyForDisplay(9, "EUR", "NGN", rates), "NGN 15,000.00");
  assert.equal(formatSignedMoneyForDisplay(-10, "USD", "KES", rates), "-KSh 1,300.00");
  assert.equal(formatSignedMoneyForDisplay(2, "USD", "NGN", rates), "+NGN 3,000.00");
});
test("missing quotes keep the source label rather than fabricating local currency", () => {
  assert.equal(convertCurrency(10, "USD", "KES", null), null);
  assert.equal(formatMoneyForDisplay(10, "USD", "KES", null), "USD 10.00");
  assert.equal(formatMoneyForDisplay(10, "EUR", "KES", { KES: 130 }), "EUR 10.00");
  assert.equal(rateFor("KES", { KES: -1 }), null);
  assert.equal(convertCurrency(Infinity, "USD", "KES", rates), null);
  assert.equal(isDisplayCurrency("constructor"), false);
});
