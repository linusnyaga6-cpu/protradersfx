'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateDepositAllocation,
  calculateExecutedTradeFee,
  calculatePerformanceFee,
} = require('./fees');

test('deposit fee math allocates one dollar from a ten-dollar deposit', () => {
  assert.deepEqual(calculateDepositAllocation(1000), {
    grossMinorUnits: 1000,
    platformFeeMinorUnits: 100,
    customerCreditMinorUnits: 900,
  });
});

test('trade fee is 1% of the executed stake, rounded down to minor units', () => {
  assert.deepEqual(calculateExecutedTradeFee(2500), {
    stakeMinorUnits: 2500,
    platformFeeMinorUnits: 25,
  });
  assert.equal(calculateExecutedTradeFee(1).platformFeeMinorUnits, 0);
});

test('performance fee applies only to positive verified net realized profit', () => {
  assert.deepEqual(calculatePerformanceFee(500), {
    eligibleNetProfitMinorUnits: 500,
    platformFeeMinorUnits: 100,
  });
  assert.deepEqual(calculatePerformanceFee(-500), {
    eligibleNetProfitMinorUnits: 0,
    platformFeeMinorUnits: 0,
  });
});

test('fee helpers reject non-integer, negative, and zero gross deposits', () => {
  assert.throws(() => calculateDepositAllocation(0), TypeError);
  assert.throws(() => calculateDepositAllocation(-100), TypeError);
  assert.throws(() => calculateExecutedTradeFee(1.5), TypeError);
  assert.throws(() => calculatePerformanceFee(Number.MAX_SAFE_INTEGER + 1), TypeError);
});
