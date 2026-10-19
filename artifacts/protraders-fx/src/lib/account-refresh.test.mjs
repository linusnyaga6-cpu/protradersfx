import assert from "node:assert/strict";
import test from "node:test";
import { createAccountRefresher } from "./account-refresh.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("balance polling and per-trade refresh share a single request", async () => {
  const response = deferred(), applied = [];
  let requests = 0;
  const client = createAccountRefresher(() => { requests++; return response.promise; }, value => applied.push(value));
  const poll = client.refresh("demo"), trade = client.refresh("demo");
  assert.equal(poll, trade);
  await flush();
  assert.equal(requests, 1);
  response.resolve({ balance: 99 });
  await poll;
  assert.deepEqual(applied, [{ balance: 99 }]);
});

test("old account responses cannot overwrite the newly selected account", async () => {
  const old = deferred(), applied = [], requests = [];
  const client = createAccountRefresher(mode => {
    requests.push(mode);
    return mode === "demo" ? old.promise : Promise.resolve({ balance: 500 });
  }, (value, mode) => applied.push({ value, mode }));
  const demo = client.refresh("demo");
  await flush();
  client.invalidate();
  const real = client.refresh("real");
  await flush();
  assert.deepEqual(requests, ["demo"]);
  old.resolve({ balance: 10000 });
  await Promise.all([demo, real]);
  assert.deepEqual(applied, [{ value: { balance: 500 }, mode: "real" }]);
});

test("failure does not fabricate a balance and the next poll can recover", async () => {
  let count = 0;
  const applied = [];
  const client = createAccountRefresher(async () => {
    if (++count === 1) throw Error("offline");
    return { balance: 42 };
  }, value => applied.push(value));
  await assert.rejects(client.refresh("demo"), /offline/);
  assert.deepEqual(applied, []);
  await client.refresh("demo");
  assert.deepEqual(applied, [{ balance: 42 }]);
});

test("account switching can wait for the previous request without applying its stale balance", async () => {
  const response = deferred(), applied = [];
  const client = createAccountRefresher(() => response.promise, value => applied.push(value));
  const pending = client.refresh("demo");
  await flush();
  client.invalidate();
  let drained = false;
  const idle = client.idle().then(() => { drained = true; });
  await flush();
  assert.equal(drained, false);
  response.resolve({ balance: 100 });
  await Promise.all([pending, idle]);
  assert.equal(drained, true);
  assert.deepEqual(applied, []);
});
