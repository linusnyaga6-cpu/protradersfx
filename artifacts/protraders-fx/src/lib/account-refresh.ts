export type BalanceAccountMode = "demo" | "real";

// One request at a time per provider, with a generation guard for account changes.
export function createAccountRefresher<T>(
  request: (mode: BalanceAccountMode) => Promise<T>,
  apply: (value: T, mode: BalanceAccountMode) => void,
) {
  let generation = 0;
  let current: { mode: BalanceAccountMode; generation: number; promise: Promise<void> } | null = null;
  return {
    invalidate() { generation += 1; },
    async idle() { await current?.promise.catch(() => undefined); },
    refresh(mode: BalanceAccountMode): Promise<void> {
      if (current?.mode === mode && current.generation === generation) return current.promise;
      const expectedGeneration = generation;
      const previous = current?.promise;
      const promise = (async () => {
        await previous?.catch(() => undefined);
        if (generation !== expectedGeneration) return;
        const value = await request(mode);
        if (generation === expectedGeneration) apply(value, mode);
      })();
      current = { mode, generation: expectedGeneration, promise };
      void promise.finally(() => {
        if (current?.promise === promise) current = null;
      }).catch(() => undefined);
      return promise;
    },
  };
}
