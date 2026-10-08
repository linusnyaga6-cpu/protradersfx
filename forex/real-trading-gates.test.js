'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_REAL_SERVICES,
  getRealTradingReadiness,
  requireRealTradingReady,
  validateRealOrder,
} = require('./real-trading-gates');

test('REAL mode stays blocked by default with named missing prerequisites', () => {
  const result = getRealTradingReadiness({ env: {}, services: {} });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('EXECUTION_MODE must include REAL'));
  assert.ok(result.missing.includes('REAL_TRADING_ENABLED must be true'));
  assert.ok(result.missing.includes('paymentProvider is not configured'));
  assert.ok(result.missing.includes('ledger is not configured'));
});

test('configuration flags alone do not enable REAL mode without server services', () => {
  const result = getRealTradingReadiness({
    env: {
      EXECUTION_MODE: 'BOTH',
      REAL_TRADING_ENABLED: 'true',
      FOREX_PAYMENTS_ENABLED: 'true',
    },
    services: {},
  });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('authentication is not configured'));
  assert.ok(result.missing.includes('executionProvider is not configured'));
  assert.throws(
    () => requireRealTradingReady({
      env: { EXECUTION_MODE: 'REAL', REAL_TRADING_ENABLED: 'true', FOREX_PAYMENTS_ENABLED: 'true' },
      services: {},
    }),
    { code: 'REAL_TRADING_NOT_READY' },
  );
});

test('readiness contract covers server auth, verified accounts, ledger, payments, execution, and audit', () => {
  assert.deepEqual(Object.keys(REQUIRED_REAL_SERVICES), [
    'authentication',
    'accountVerification',
    'riskAcknowledgement',
    'fundsCustody',
    'settlement',
    'legalReadiness',
    'paymentProvider',
    'ledger',
    'idempotencyStore',
    'orderStore',
    'auditLog',
    'executionProvider',
    'realOrderWorkflow',
  ]);
  assert.ok(REQUIRED_REAL_SERVICES.ledger.includes('reserveStake'));
  assert.ok(REQUIRED_REAL_SERVICES.ledger.includes('reserveWithdrawal'));
  assert.ok(REQUIRED_REAL_SERVICES.orderStore.includes('recordSettlement'));
});

test('real-order validation uses server allowlist and limits and strips browser-supplied state', () => {
  const result = validateRealOrder({
    instrument: 'EUR/USD',
    side: 'BUY',
    currency: 'usd',
    stakeMinorUnits: 500,
    idempotencyKey: 'client-order-00000001',
    balance: 999999999,
    verified: true,
    userId: 'untrusted-browser-user',
  }, {
    allowedInstruments: ['EUR/USD'],
    maxStakeMinorUnits: 1000,
  });
  assert.deepEqual(result, {
    instrument: 'EUR/USD',
    side: 'buy',
    currency: 'USD',
    stakeMinorUnits: 500,
    idempotencyKey: 'client-order-00000001',
  });
  assert.throws(() => validateRealOrder({
    instrument: 'BTC/USD',
    side: 'buy',
    currency: 'USD',
    stakeMinorUnits: 500,
    idempotencyKey: 'client-order-00000001',
  }, { allowedInstruments: ['EUR/USD'], maxStakeMinorUnits: 1000 }), TypeError);
  assert.throws(() => validateRealOrder({
    instrument: 'EUR/USD',
    side: 'buy',
    currency: 'USD',
    stakeMinorUnits: 1001,
    idempotencyKey: 'client-order-00000001',
  }, { allowedInstruments: ['EUR/USD'], maxStakeMinorUnits: 1000 }), TypeError);
  assert.throws(() => validateRealOrder({
    instrument: 'EUR/USD',
    side: 'buy',
    currency: 'USD',
    stakeMinorUnits: 500,
  }, { allowedInstruments: ['EUR/USD'], maxStakeMinorUnits: 1000 }), TypeError);
});
