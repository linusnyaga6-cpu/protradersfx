import assert from "node:assert/strict";
import test from "node:test";
import {
  executeManualEntryBatch,
  manualEntryBatchDecision,
} from "./manual-entry-batch.ts";

test("dispatches all requested runs together using an immutable snapshot of one selection", async () => {
  const selectedEntry = {
    symbol: "1HZ100V",
    contractType: "DIGITUNDER",
    barrier: 8,
    amount: 2,
    duration: 1,
    durationUnit: "t",
    currency: "USD",
    mode: "demo",
  };
  const deferred = [];
  const receivedEntries = [];
  const batch = executeManualEntryBatch(selectedEntry, 5, (entry) => {
    receivedEntries.push(entry);
    return new Promise((resolve) => deferred.push(resolve));
  });

  // Every request starts immediately; no settlement is required before the
  // next run is submitted.
  assert.equal(receivedEntries.length, 5);
  assert.equal(new Set(receivedEntries).size, 5);
  selectedEntry.symbol = "1HZ75V";
  selectedEntry.barrier = 7;

  for (const entry of receivedEntries) {
    assert.deepEqual(entry, {
      symbol: "1HZ100V",
      contractType: "DIGITUNDER",
      barrier: 8,
      amount: 2,
      duration: 1,
      durationUnit: "t",
      currency: "USD",
      mode: "demo",
    });
  }

  deferred.forEach((resolve, index) => resolve({ contractId: `contract-${index + 1}` }));
  const results = await batch;
  assert.deepEqual(results.map(({ run }) => run), [1, 2, 3, 4, 5]);
  assert.deepEqual(results.map(({ receipt }) => receipt.contractId), [
    "contract-1", "contract-2", "contract-3", "contract-4", "contract-5",
  ]);
});

test("reports failed runs without retrying them or changing the other selected entries", async () => {
  let calls = 0;
  const results = await executeManualEntryBatch(
    { symbol: "1HZ100V", contractType: "DIGITUNDER", barrier: 8 },
    5,
    async () => {
      calls += 1;
      if (calls === 2) throw new Error("proposal failed");
      return { contractId: `confirmed-${calls}` };
    },
  );

  assert.equal(calls, 5);
  assert.equal(results.length, 5);
  assert.equal(results.filter((result) => result.ok).length, 4);
  assert.equal(results.filter((result) => !result.ok).length, 1);
});

test("rejects invalid run counts before dispatching any orders", async () => {
  let calls = 0;
  await assert.rejects(
    executeManualEntryBatch({ symbol: "1HZ100V" }, 0, async () => {
      calls += 1;
    }),
    /1 to 100/,
  );
  assert.equal(calls, 0);
});

test("treats a confirmed contract that is still settling as a placed run", () => {
  assert.equal(
    manualEntryBatchDecision({
      contractId: "contract-1",
      settlementPending: true,
    }),
    "confirmed",
  );
});

test("recognizes a settled order with a confirmed transaction", () => {
  assert.equal(
    manualEntryBatchDecision({
      transactionId: 42,
      orderStatusUnknown: false,
    }),
    "confirmed",
  );
});

test("flags an unknown order status so the run is not retried", () => {
  assert.equal(
    manualEntryBatchDecision({
      contractId: "contract-1",
      orderStatusUnknown: true,
    }),
    "unknown",
  );
});

test("flags a response without a contract or transaction identifier as unknown", () => {
  assert.equal(
    manualEntryBatchDecision({
      orderStatusUnknown: false,
    }),
    "unknown",
  );
});
