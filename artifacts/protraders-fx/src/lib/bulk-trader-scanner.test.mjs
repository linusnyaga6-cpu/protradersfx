import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeBulkMarket, MIN_BULK_SCAN_TICKS } from './bulk-trader-scanner.ts';

const market = {
  label: 'VOL 100',
  name: 'Volatility 100 Index',
  symbol: '1HZ100V',
  family: 'volatility',
};
const now = 1_000_000;

function quote(ticks, overrides = {}) {
  return {
    status: 'live',
    price: ticks.at(-1) ?? 100,
    previousPrice: ticks.at(-2) ?? 100,
    pipSize: 2,
    ticks,
    lastTickAt: now,
    ...overrides,
  };
}

function pricesFromDigits(digits) {
  return digits.map((digit) => 100 + digit / 100);
}

test('rejects invalid scan lengths instead of silently changing the requested sample', () => {
  for (const requested of [0, 19, 1000, 20.5, Number.NaN]) {
    const result = analyzeBulkMarket(market, quote(Array(120).fill(100)), 'Even/Odd', requested, now);
    assert.equal(result.result, null);
    assert.match(result.message, /scan window/);
  }
});

test('refuses stale or non-live quotes before exposing a scan result', () => {
  const ticks = Array.from({ length: MIN_BULK_SCAN_TICKS }, (_, index) => 100 + index);
  const stale = analyzeBulkMarket(market, quote(ticks, { lastTickAt: now - 15_001 }), 'Rise/Fall', MIN_BULK_SCAN_TICKS, now);
  const connecting = analyzeBulkMarket(market, quote(ticks, { status: 'connecting' }), 'Rise/Fall', MIN_BULK_SCAN_TICKS, now);
  assert.equal(stale.result, null);
  assert.equal(connecting.result, null);
  assert.match(stale.message, /fresh live Deriv tick/);
});

test('requires the full requested live sample before analysis', () => {
  const result = analyzeBulkMarket(market, quote(Array(19).fill(100)), 'Even/Odd', MIN_BULK_SCAN_TICKS, now);
  assert.equal(result.result, null);
  assert.match(result.message, /Need 20 live ticks/);
});

test('neutral 4 digits count against Over/Under instead of inflating the signal', () => {
  const digits = [
    5, 5, 4, 4, 4, 4, 4, 4, 4, 3,
    5, 5, 4, 4, 4, 4, 4, 4, 4, 3,
  ];
  const result = analyzeBulkMarket(market, quote(pricesFromDigits(digits), { pipSize: 2 }), 'Over/Under', 20, now).result;
  assert.equal(result?.side, 'Over');
  assert.equal(result?.contractType, 'DIGITOVER');
  assert.equal(result?.observedShare, 20);
  assert.equal(result?.windowAgreement, false);
  assert.equal(result?.hasSignal, false);
  assert.equal(result?.barrier, 4);
});

test('flat price changes count against Rise/Fall instead of creating an automatic signal', () => {
  const ticks = [100, 101, ...Array(8).fill(101), 102, ...Array(9).fill(102)];
  const result = analyzeBulkMarket(market, quote(ticks), 'Rise/Fall', 20, now).result;
  assert.equal(result?.side, 'Rise');
  assert.equal(result?.contractType, 'CALL');
  assert.equal(result?.windowAgreement, false);
  assert.equal(result?.hasSignal, false);
  assert.ok(result && result.observedShare < 50);
});

test('emits a signal only when the same side has a majority in both halves and the full sample', () => {
  const digits = [2, 4, 6, 8, 0, 2, 4, 1, 3, 5, 0, 2, 4, 6, 8, 0, 1, 3, 5, 7];
  const even = analyzeBulkMarket(market, quote(pricesFromDigits(digits), { pipSize: 2 }), 'Even/Odd', 20, now).result;
  const rise = analyzeBulkMarket(market, quote(Array.from({ length: 20 }, (_, i) => 100 + i)), 'Rise/Fall', 20, now).result;
  assert.equal(even?.side, 'Even');
  assert.equal(even?.contractType, 'DIGITEVEN');
  assert.equal(even?.hasSignal, true);
  assert.equal(even?.windowAgreement, true);
  assert.equal(rise?.side, 'Rise');
  assert.equal(rise?.contractType, 'CALL');
  assert.equal(rise?.hasSignal, true);
  assert.equal(rise?.windowAgreement, true);
});
