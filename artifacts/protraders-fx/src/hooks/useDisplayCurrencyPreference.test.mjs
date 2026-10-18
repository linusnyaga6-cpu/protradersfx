import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { countryCurrencies, isDisplayCurrency } from "../lib/currencies.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("./useDisplayCurrencyPreference.ts", import.meta.url), "utf8"))
  .replace(/^import .*;$/gm, "").replace("export function useDisplayCurrencyPreference", "function useDisplayCurrencyPreference");
function mount(initialCountry, saved = null, blocked = false) {
  const states = [];
  const dependencies = [];
  const storage = new Map(saved ? [["protradersfx:display-currency", saved]] : []);
  let cursor = 0, effectCursor = 0, country = initialCountry, effects = [];
  const context = {
    countryCurrencies, isDisplayCurrency,
    useLanguage: () => ({ country }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useEffect(callback, deps) {
      const index = effectCursor++;
      if (!dependencies[index] || deps.some((value, i) => !Object.is(value, dependencies[index][i]))) effects.push(callback);
      dependencies[index] = deps;
    },
    localStorage: {
      getItem(key) { if (blocked) throw Error("disabled"); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error("disabled"); storage.set(key, value); },
    },
  };
  runInNewContext(source + "\nthis.hook = useDisplayCurrencyPreference;", context);
  function render() {
    cursor = effectCursor = 0; effects = [];
    let result = context.hook();
    if (effects.length) { effects.forEach(effect => effect()); cursor = effectCursor = 0; result = context.hook(); }
    return result;
  }
  return { render, changeCountry(value) { country = value; }, storage };
}
test("automatic currency follows Kenya, Brazil and Eurozone country selections", () => {
  const app = mount("KE");
  assert.equal(app.render().automatic, true);
  assert.equal(app.render().displayCurrency, "KES");
  app.changeCountry("BR");
  assert.equal(app.render().displayCurrency, "BRL");
  app.changeCountry("HR");
  assert.equal(app.render().displayCurrency, "EUR");
});
test("manual USD or currency choice remains selected when the country changes", () => {
  const app = mount("KE");
  app.render().selectCurrency("USD");
  app.changeCountry("ZA");
  assert.equal(app.render().automatic, false);
  assert.equal(app.render().displayCurrency, "USD");
  app.render().selectCurrency("NGN");
  app.changeCountry("DE");
  assert.equal(app.render().displayCurrency, "NGN");
});
test("South American selections use local currency including Ecuador USD", () => {
  const app = mount("SR");
  for (const [country, currency] of [["SR","SRD"],["BO","BOB"],["EC","USD"],["GY","GYD"],["PY","PYG"],["PE","PEN"],["UY","UYU"],["VE","VES"]]) {
    app.changeCountry(country);
    assert.equal(app.render().displayCurrency, currency, country);
  }
  app.render().selectCurrency("KES");
  app.changeCountry("SR");
  assert.equal(app.render().displayCurrency, "KES");
  app.render().selectCurrency("auto");
  assert.equal(app.render().displayCurrency, "SRD");
});
test("Arab country automatic currencies follow selection while manual choices remain saved", () => {
  const app = mount("AE");
  assert.equal(app.render().displayCurrency, "AED");
  for (const [country, currency] of [["SA","SAR"],["BH","BHD"],["PS","ILS"],["MA","MAD"],["YE","YER"]]) {
    app.changeCountry(country);
    assert.equal(app.render().displayCurrency, currency);
  }
  app.render().selectCurrency("KWD");
  app.changeCountry("QA");
  assert.equal(app.render().displayCurrency, "KWD");
  assert.equal(app.render().automatic, false);
  app.render().selectCurrency("auto");
  assert.equal(app.render().displayCurrency, "QAR");
  assert.equal(mount("AE", "AED").render().displayCurrency, "AED");
});
test("returning to automatic immediately restores country currency and saves automatic mode", () => {
  const app = mount("KE", "EUR");
  assert.equal(app.render().automatic, false);
  app.render().selectCurrency("auto");
  assert.equal(app.render().displayCurrency, "KES");
  assert.equal(app.render().automatic, true);
  assert.equal(app.storage.get("protradersfx:display-currency"), "auto");
});
test("reload respects manual preferences and automatic selection", () => {
  assert.equal(mount("KE", "EUR").render().displayCurrency, "EUR");
  assert.equal(mount("KE", "auto").render().displayCurrency, "KES");
  assert.equal(mount("KE", "KSH").render().displayCurrency, "KES");
});
test("unmapped country uses USD without blocking manual KSh", () => {
  const app = mount("XX");
  assert.equal(app.render().displayCurrency, "USD");
  app.render().selectCurrency("KES");
  assert.equal(app.render().displayCurrency, "KES");
});
test("storage-disabled browsers can still switch between manual and automatic", () => {
  const app = mount("KE", null, true);
  app.render().selectCurrency("GBP");
  assert.equal(app.render().displayCurrency, "GBP");
  app.render().selectCurrency("auto");
  assert.equal(app.render().displayCurrency, "KES");
});
