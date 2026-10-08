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
  await assert.rejects(engine.placeOrder({ mode: 'live', instrument: 'EUR/USD' }), {
    code: 'LIVE_TRADING_DISABLED',
  });
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
