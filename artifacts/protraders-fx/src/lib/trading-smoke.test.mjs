import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DERIV_CONTRACT_TYPES, executeDerivTrade, requestDerivProposal,
} from './deriv-contracts.ts';
import { normalizeTradeExecution } from './trade-financials.ts';

test('all six shared manual, bulk and free-bot contract paths send valid requests and retain trade figures', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const input = JSON.parse(init.body);
    requests.push({ url, input, credentials: init.credentials });
    return Response.json({
      trade: { contractId: 123, contractType: input.contractType, stake: input.amount, payout: 0.91, profit: 0.41 },
      proposal: { id: 'quote-1', askPrice: 0.5, payout: 0.91, currency: 'USD' },
    });
  };
  try {
    for (const contractType of DERIV_CONTRACT_TYPES) {
      const input = {
        symbol: '1HZ100V', contractType, amount: 0.5, duration: 1,
        durationUnit: 't', currency: 'USD', mode: 'demo', barrier: 4,
      };
      const proposal = await requestDerivProposal(input);
      const trade = await executeDerivTrade(input);
      assert.equal(proposal.id, 'quote-1');
      assert.equal(trade.contractId, 123);
      assert.equal(trade.profit, 0.41);
      const [quoteRequest, buyRequest] = requests.slice(-2);
      assert.equal(quoteRequest.url, '/api/deriv/proposal');
      assert.equal(buyRequest.url, '/api/deriv/execute');
      assert.equal(buyRequest.credentials, 'include');
      assert.equal(buyRequest.input.confirm, true);
      assert.equal(buyRequest.input.mode, 'demo');
      assert.equal(buyRequest.input.contractType, contractType);
      assert.equal(buyRequest.input.barrier, contractType === 'DIGITOVER' || contractType === 'DIGITUNDER' ? 4 : undefined);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid stakes and barriers cannot reach the trading endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async () => { sent += 1; throw new Error('A request should not be sent'); };
  const input = { symbol: '1HZ100V', contractType: 'DIGITOVER', amount: 0.5, duration: 1, durationUnit: 't', currency: 'USD', mode: 'demo', barrier: 4 };
  try {
    await assert.rejects(executeDerivTrade({ ...input, amount: 0 }), /Stake/);
    await assert.rejects(executeDerivTrade({ ...input, barrier: 9 }), /Over barrier/);
    await assert.rejects(executeDerivTrade({ ...input, contractType: 'DIGITUNDER', barrier: 0 }), /Under barrier/);
    assert.equal(sent, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('confirmed trades without settlement figures remain visible as pending, never as failed purchases', () => {
  const trade = normalizeTradeExecution({ contractId: 123, buyPrice: 0.5, status: 'open' });
  assert.equal(trade.settlementPending, true);
  assert.equal(trade.orderStatusUnknown, false);
  assert.equal(trade.profit, null);
});

test('unconfirmed responses stop safely, and settled P/L excludes the stake', () => {
  assert.equal(normalizeTradeExecution({ buyPrice: 0.5 }).orderStatusUnknown, true);
  const settled = normalizeTradeExecution({ contractId: 123, buyPrice: 0.5, payout: 0.91 });
  assert.equal(settled.settlementPending, false);
  assert.equal(settled.orderStatusUnknown, false);
  assert.ok(Math.abs(settled.profit - 0.41) < 0.000001);
});
