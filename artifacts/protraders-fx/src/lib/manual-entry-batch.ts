export type ManualEntryReceipt = {
  orderStatusUnknown?: boolean;
  contractId?: string | number | null;
  transactionId?: string | number | null;
};

export type ManualEntryBatchRun<TReceipt> =
  | { run: number; ok: true; receipt: TReceipt }
  | { run: number; ok: false; error: unknown };

export async function executeManualEntryBatch<TInput extends object, TReceipt>(
  input: TInput,
  runCount: number,
  execute: (entry: TInput) => Promise<TReceipt>,
  onRunComplete?: (result: ManualEntryBatchRun<TReceipt>, completedCount: number) => void,
): Promise<ManualEntryBatchRun<TReceipt>[]> {
  if (!Number.isInteger(runCount) || runCount < 1 || runCount > 100) {
    throw new Error("Choose a whole number of runs from 1 to 100.");
  }

  // Snapshot the chosen market, contract side/barrier, stake, duration and
  // account before dispatching. Every run starts from this same selection.
  const snapshot = Object.freeze({ ...input });
  let completedCount = 0;
  return Promise.all(
    Array.from({ length: runCount }, async (_, index) => {
      let result: ManualEntryBatchRun<TReceipt>;
      try {
        result = {
          run: index + 1,
          ok: true,
          receipt: await execute({ ...snapshot } as TInput),
        };
      } catch (error) {
        result = { run: index + 1, ok: false, error };
      }
      completedCount += 1;
      onRunComplete?.(result, completedCount);
      return result;
    }),
  );
}

export function manualEntryBatchDecision(
  receipt: ManualEntryReceipt,
): "confirmed" | "unknown" {
  if (receipt.orderStatusUnknown) return "unknown";
  if (receipt.contractId == null && receipt.transactionId == null) {
    return "unknown";
  }
  return "confirmed";
}
