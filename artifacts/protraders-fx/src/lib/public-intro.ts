type IntroClock = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};

const browserClock: IntroClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = globalThis.setTimeout(callback, delayMs);
    return () => globalThis.clearTimeout(timer);
  },
};

/** Decorative progress must never wait for rendering, auth, or market sockets. */
export function startPublicIntro({
  durationMs,
  onProgress,
  onComplete,
  clock = browserClock,
}: {
  durationMs: number;
  onProgress: (progress: number) => void;
  onComplete: () => void;
  clock?: IntroClock;
}) {
  const startedAt = clock.now();
  let cancelled = false;
  let finished = false;
  let cancelTick = () => {};
  let cancelHandoff = () => {};
  const tick = () => {
    if (cancelled || finished) return;
    onProgress(Math.min(99, Math.floor(((clock.now() - startedAt) / durationMs) * 100)));
    cancelTick = clock.schedule(tick, 100);
  };

  onProgress(0);
  cancelTick = clock.schedule(tick, 100);
  const cancelFinish = clock.schedule(() => {
    if (cancelled || finished) return;
    finished = true;
    cancelTick();
    onProgress(100);
    cancelHandoff = clock.schedule(() => {
      if (!cancelled) onComplete();
    }, 220);
  }, durationMs);

  return () => {
    cancelled = true;
    cancelTick();
    cancelFinish();
    cancelHandoff();
  };
}
