import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyDisplayContext, ProfitLossValue, profitLossTone } from "./display-currency.ts";
import { currencyNames } from "./currencies.ts";

function render(amount, displayCurrency = "USD", rate = null, currency = "USD") {
  return renderToStaticMarkup(createElement(CurrencyDisplayContext.Provider, {
    value: { displayCurrency, rate, toggleDisplayCurrency() {} },
  }, createElement(ProfitLossValue, { amount, currency })));
}

test("loss and profit keep their sign and colour marker in every selected currency", () => {
  const rates = Object.fromEntries(Object.keys(currencyNames).map(code => [code, code === "USD" ? 1 : 130]));
  for (const code of Object.keys(currencyNames)) {
    const loss = render(-2, code, rates);
    const profit = render(2, code, rates);
    assert.match(loss, /data-pnl-tone="loss"/);
    assert.match(loss, />-[^<]+<\/span>/);
    assert.match(profit, /data-pnl-tone="profit"/);
    assert.match(profit, />\+[^<]+<\/span>/);
    assert.match(loss, /dir="ltr"/);
  }
});

test("missing rates preserve USD and the correct P/L sign", () => {
  assert.match(render(-10, "KES"), />-USD 10\.00</);
  assert.match(render(10, "KES"), />\+USD 10\.00</);
});

test("zero, unavailable and invalid results are neutral, never wins or losses", () => {
  for (const amount of [0, -0, "0"]) {
    assert.equal(profitLossTone(amount), "flat");
    assert.match(render(amount), /data-pnl-tone="flat".*>FLAT</);
  }
  for (const amount of [null, undefined, "", NaN, Infinity, "invalid"]) {
    assert.equal(profitLossTone(amount), "pending");
    assert.match(render(amount), /data-pnl-tone="pending".*>—</);
  }
  assert.equal(profitLossTone("-1.25"), "loss");
  assert.equal(profitLossTone("1.25"), "profit");
});

test("P/L stylesheet binds financial meaning to red and green regardless of workspace theme", () => {
  const css = readFileSync(new URL("../profit-loss.css", import.meta.url), "utf8");
  assert.match(css, /\[data-pnl-tone="profit"\]\s*\{\s*color: #16a34a !important;/);
  assert.match(css, /\[data-pnl-tone="loss"\]\s*\{\s*color: #ef4444 !important;/);
});

test("visible outcome labels distinguish profit, loss and pending results without colour alone", () => {
  assert.match(render(8), /data-pnl-label="PROFIT"/);
  assert.match(render(-10), /data-pnl-label="LOSS"/);
  assert.match(render(null), /data-pnl-label="PENDING"/);
  assert.match(render(0), /Break-even: no net gain or loss/);
});

test("nested P/L values cannot inherit card layout or invisible font sizes from legacy span selectors", () => {
  const css = readFileSync(new URL("../profit-loss.css", import.meta.url), "utf8");
  assert.match(css, /display: inline !important/);
  assert.match(css, /padding: 0 !important/);
  assert.match(css, /font: inherit !important/);
  assert.match(css, /\.trade-money-details > :is\(b, strong\)/);
});
