'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ProviderUnavailableError,
  UpesiPayPaymentProvider,
  getFeatureFlags,
  getPublicStatus,
  resolveExecutionProvider,
} = require('./providers');

test('REAL mode is rejected by default and never falls back to demo', () => {
  const demo = { name: 'demo' };
  assert.throws(
    () => resolveExecutionProvider('real', { demo }, {}),
    (error) => error instanceof ProviderUnavailableError && error.code === 'REAL_MODE_NOT_CONFIGURED',
  );
});

test('REAL mode requires an explicit mode and flag and never uses the demo adapter', () => {
  assert.throws(
    () => resolveExecutionProvider('real', { demo: {} }, { EXECUTION_MODE: 'REAL' }),
    (error) => error.code === 'REAL_TRADING_DISABLED',
  );
  assert.throws(
    () => resolveExecutionProvider('real', { demo: {} }, {
      EXECUTION_MODE: 'REAL',
      REAL_TRADING_ENABLED: 'true',
    }),
    (error) => error.code === 'REAL_EXECUTION_NOT_CONFIGURED',
  );
});

test('demo mode requires an explicit demo provider and enabled flag', () => {
  const demo = { name: 'demo' };
  assert.equal(resolveExecutionProvider('demo', { demo }, {}).name, 'demo');
  assert.throws(
    () => resolveExecutionProvider('demo', {}, {}),
    (error) => error.code === 'DEMO_EXECUTION_NOT_CONFIGURED',
  );
  assert.throws(
    () => resolveExecutionProvider('demo', { demo }, { FOREX_DEMO_TRADING_ENABLED: 'false' }),
    (error) => error.code === 'DEMO_TRADING_DISABLED',
  );
});

test('mode selection rejects missing or unknown mode instead of guessing', () => {
  assert.throws(() => resolveExecutionProvider(undefined, {}, {}), { code: 'INVALID_TRADING_MODE' });
  assert.throws(() => resolveExecutionProvider('practice', {}, {}), { code: 'INVALID_TRADING_MODE' });
  assert.throws(
    () => resolveExecutionProvider('demo', { demo: {} }, { EXECUTION_MODE: 'AUTO' }),
    { code: 'INVALID_EXECUTION_CONFIGURATION' },
  );
});

test('BOTH may expose demo while REAL remains disabled without its flag and adapters', () => {
  const demo = { name: 'demo' };
  assert.equal(resolveExecutionProvider('demo', { demo }, { EXECUTION_MODE: 'BOTH' }).name, 'demo');
  assert.throws(
    () => resolveExecutionProvider('real', { demo }, { EXECUTION_MODE: 'BOTH' }),
    { code: 'REAL_TRADING_DISABLED' },
  );
});

test('payment requests fail closed and public status never claims live payments', async () => {
  const provider = new UpesiPayPaymentProvider();
  await assert.rejects(provider.createDeposit(), { code: 'PAYMENTS_DISABLED' });
  await assert.rejects(provider.verifyDeposit(), { code: 'PAYMENTS_DISABLED' });
  await assert.rejects(provider.getDepositStatus(), { code: 'PAYMENTS_DISABLED' });
  await assert.rejects(provider.requestWithdrawal(), { code: 'PAYMENTS_DISABLED' });
  await assert.rejects(provider.getTransactionHistory(), { code: 'PAYMENTS_DISABLED' });
  assert.deepEqual(getPublicStatus({ FOREX_PAYMENTS_ENABLED: 'true', REAL_TRADING_ENABLED: 'true' }), {
    mode: 'demo',
    executionModeSetting: 'DEMO',
    availableAccountModes: ['DEMO'],
    demoTradingEnabled: true,
    realTradingEnabled: false,
    realModeAvailable: false,
    realModeBlocker: 'Required real-account infrastructure is not configured.',
    paymentsEnabled: false,
    quoteSource: 'simulated',
    wallet: 'browser-only demo credits; no persistent or withdrawable balance',
  });
  assert.equal(getFeatureFlags({ FOREX_PAYMENTS_ENABLED: 'true' }).paymentsRequested, true);
});
