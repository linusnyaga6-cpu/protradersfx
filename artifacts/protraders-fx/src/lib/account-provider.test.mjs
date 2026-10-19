import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(
  new URL("../../../api-server/src/lib/deriv-options.ts", import.meta.url), "utf8",
), { mode: "transform" }).replace(/^import .*from .*;\s*$/gm, "").replace(/\bexport /g, "");

function provider(fetch) {
  const context = { fetch, AbortSignal, setTimeout, clearTimeout, Date, Map };
  runInNewContext(source, context);
  return context.readOptionsAccounts;
}

test("account provider requests fresh Deriv balances rather than returning the old null placeholder", async () => {
  const balances = [100, 96, 103.6];
  let calls = 0;
  const read = provider(async (url, options) => {
    assert.equal(url, "https://api.derivws.com/trading/v1/options/accounts");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ data: [
      { account_id: "fixture-demo", account_type: "demo", currency: "USD", status: "active", balance: balances[calls++] },
    ] }) };
  });
  for (const expected of balances) {
    assert.equal((await read({ accessToken: "test-fixture-not-a-credential" }))[0].balance, expected);
  }
});

test("upstream errors cannot be mistaken for a zero balance", async () => {
  const read = provider(async () => ({
    ok: false, status: 502, json: async () => ({ errors: [{ message: "temporarily unavailable" }] }),
  }));
  await assert.rejects(read({ accessToken: "test-fixture-not-a-credential" }), /temporarily unavailable/);
});
