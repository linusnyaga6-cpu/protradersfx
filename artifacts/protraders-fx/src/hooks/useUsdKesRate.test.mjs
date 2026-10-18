import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./useUsdKesRate.ts", import.meta.url), "utf8"),
).replace('import { useEffect, useState } from "react";', "").replace("export function useUsdKesRate", "function useUsdKesRate");

function mount(fetch, cached = null) {
  const states = [];
  const timers = [];
  const listeners = new Map();
  const storage = new Map(cached ? [["protraders-fx:usd-kes-rate-v1", JSON.stringify(cached)]] : []);
  let cursor = 0;
  let effect;
  const context = {
    fetch, AbortSignal, AbortController, Date, setTimeout, clearTimeout,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useEffect(callback) { effect = callback; },
    window: {
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
      clearTimeout() {},
      addEventListener: (key, callback) => listeners.set(key, callback),
      removeEventListener: key => listeners.delete(key),
    },
  };
  runInNewContext(source + "\nthis.hook = useUsdKesRate;", context);
  function render() { cursor = 0; return context.hook(); }
  render();
  const cleanup = effect();
  return { render, cleanup, states, timers, listeners };
}

const payload = {
  result: "success", base_code: "USD", rates: { KES: 129.75 },
  time_last_update_utc: new Date().toUTCString(),
  time_next_update_unix: Math.floor(Date.now() / 1000) + 3600,
};
const settle = () => new Promise(resolve => setImmediate(resolve));

test("loads a validated rate and supplies a bounded request signal", async () => {
  let signal;
  const app = mount(async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: async () => payload };
  });
  await settle();
  assert.ok(signal instanceof AbortSignal);
  assert.equal(app.render().rate, 129.75);
  assert.equal(app.render().loading, false);
  assert.ok(Number.isFinite(Date.parse(app.render().checkedAt)));
  app.cleanup();
});

test("network failure retries after 30 seconds and can recover", async () => {
  let calls = 0;
  const app = mount(async () => {
    if (++calls <= 2) throw Error("offline");
    return { ok: true, json: async () => payload };
  });
  await settle();
  assert.equal(app.render().rate, null);
  assert.equal(app.timers[0].delay, 30_000);
  await app.timers[0].callback();
  assert.equal(app.render().rate, 129.75);
  assert.equal(app.render().stale, false);
  app.render().refresh();
  assert.equal(app.states[3], 1);
  app.listeners.get("online")();
  assert.equal(app.states[3], 2);
  app.cleanup();
  assert.equal(app.listeners.size, 0);
});

test("rejects malformed provider data rather than inventing a rate", async () => {
  const app = mount(async () => ({ ok: true, json: async () => ({ ...payload, rates: { KES: -1 } }) }));
  await settle();
  assert.equal(app.render().rate, null);
  assert.equal(app.timers[0].delay, 30_000);
  app.cleanup();
});

test("retains a dated cache and marks it stale when refresh fails", async () => {
  const app = mount(async () => { throw Error("offline"); }, {
    rate: 128, updatedAt: new Date(Date.now() - 86400000).toISOString(), nextUpdateAt: Date.now() - 1,
  });
  await settle();
  assert.equal(app.render().rate, 128);
  assert.equal(app.render().stale, true);
  app.cleanup();
});

test("HTTP failures do not become successful conversions", async () => {
  const app = mount(async () => ({ ok: false, status: 429 }));
  await settle();
  assert.equal(app.render().rate, null);
  assert.equal(app.render().loading, false);
  app.cleanup();
});

test("secondary provider restores KSh and other quotes when the primary fails", async () => {
  const app = mount(async url => {
    if (url.includes("open.er-api")) throw Error("primary blocked");
    return { ok: true, json: async () => ({
      date: new Date().toISOString().slice(0, 10), usd: { usd: 1, kes: 129.75, ngn: 1500, eur: 0.9 },
    }) };
  });
  await settle();
  assert.equal(app.render().rate, 129.75);
  assert.equal(app.render().rates.NGN, 1500);
  assert.equal(app.render().rates.EUR, 0.9);
  assert.equal(app.render().source, "Currency API");
  app.cleanup();
});

test("rates older than seven days are not used as current estimates", async () => {
  const app = mount(async () => { throw Error("offline"); }, {
    rate: 128, updatedAt: new Date(Date.now() - 8 * 86400000).toISOString(), nextUpdateAt: Date.now() + 10000,
  });
  await settle();
  assert.equal(app.render().rate, null);
  app.cleanup();
});
