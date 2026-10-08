'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TradingEngine, WalletLedger } = require('./trading-engine');

test('trading engine routes explicit demo orders to the demo adapter', async () => {
  const demo = { placeOrder: async (order) => ({ mode: 'demo', order }) };
  const engine = new TradingEngine({ executionProviders: { demo }, env: {} });
  const result = await engine.placeOrder({ mode: 'demo', instrument: 'EUR/USD', side: 'buy' });
  assert.equal(result.mode, 'demo');
  assert.equal(result.order.instrument, 'EUR/USD');
});

test('trading engine does not silently route live requests to the demo adapter', async () => {
  const demo = { placeOrder: async () => ({ mode: 'demo' }) };
  const engine = new TradingEngine({ executionProviders: { demo }, env: {} });
  await assert.rejects(engine.placeOrder({ mode: 'real', instrument: 'EUR/USD' }), {
    code: 'REAL_MODE_NOT_CONFIGURED',
  });
});

test('REAL flags and an execution provider still cannot bypass missing server-side gates', async () => {
  let executionCalls = 0;
  const real = { placeOrder: async () => { executionCalls++; return { status: 'executed' }; } };
  const engine = new TradingEngine({
    executionProviders: { real },
    realOrderPolicy: { allowedInstruments: ['EUR/USD'], maxStakeMinorUnits: 10000 },
    env: {
      EXECUTION_MODE: 'REAL',
      REAL_TRADING_ENABLED: 'true',
      FOREX_PAYMENTS_ENABLED: 'true',
    },
  });
  await assert.rejects(engine.placeOrder({
    mode: 'real',
    instrument: 'EUR/USD',
    side: 'buy',
    currency: 'USD',
    stakeMinorUnits: 100,
    idempotencyKey: 'client-order-00000001',
  }), { code: 'REAL_TRADING_NOT_READY' });
  assert.equal(executionCalls, 0);
});

test('wallet ledger contract fails closed until durable storage is supplied', async () => {
  const ledger = new WalletLedger();
  await assert.rejects(ledger.getWallet('user-1'), { code: 'LEDGER_NOT_CONFIGURED' });
  await assert.rejects(ledger.appendEntry({}), { code: 'LEDGER_NOT_CONFIGURED' });
  await assert.rejects(ledger.creditVerifiedDeposit({}), { code: 'LEDGER_NOT_CONFIGURED' });
  await assert.rejects(ledger.reserveWithdrawal({}), { code: 'LEDGER_NOT_CONFIGURED' });
  await assert.rejects(ledger.listTransactions('user-1'), { code: 'LEDGER_NOT_CONFIGURED' });
  await assert.rejects(ledger.settleTrade({}), { code: 'LEDGER_NOT_CONFIGURED' });
});
