import assert from 'node:assert/strict';
import test from 'node:test';
import { startPublicIntro } from './public-intro.ts';

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const tasks = new Map();
  return {
    now: () => now,
    schedule(callback, delayMs) {
      const id = ++nextId;
      tasks.set(id, { at: now + delayMs, callback });
      return () => tasks.delete(id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        tasks.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
    get pending() { return tasks.size; },
  };
}

test('counts 0–100 and automatically hands off without animation frames or CSS events', () => {
  const clock = fakeClock();
  const progress = [];
  let completed = 0;
  startPublicIntro({ durationMs: 2400, clock, onProgress: (value) => progress.push(value), onComplete: () => completed++ });
  assert.equal(progress[0], 0);
  clock.advance(1200);
  assert.equal(progress.at(-1), 50);
  clock.advance(1200);
  assert.equal(progress.at(-1), 100);
  assert.equal(completed, 0);
  clock.advance(220);
  assert.equal(completed, 1);
  clock.advance(10000);
  assert.equal(completed, 1);
  assert.equal(clock.pending, 0);
});

test('reduced-motion opening also completes automatically', () => {
  const clock = fakeClock();
  let completed = false;
  startPublicIntro({ durationMs: 800, clock, onProgress: () => {}, onComplete: () => { completed = true; } });
  clock.advance(1020);
  assert.equal(completed, true);
});

test('unmount cancels progress and completion timers', () => {
  const clock = fakeClock();
  let completed = false;
  const cancel = startPublicIntro({ durationMs: 2400, clock, onProgress: () => {}, onComplete: () => { completed = true; } });
  clock.advance(700);
  cancel();
  clock.advance(10000);
  assert.equal(completed, false);
  assert.equal(clock.pending, 0);
});

test('unmount at 100% cancels the final handoff', () => {
  const clock = fakeClock();
  let completed = false;
  const cancel = startPublicIntro({ durationMs: 2400, clock, onProgress: () => {}, onComplete: () => { completed = true; } });
  clock.advance(2400);
  cancel();
  clock.advance(1000);
  assert.equal(completed, false);
  assert.equal(clock.pending, 0);
});
