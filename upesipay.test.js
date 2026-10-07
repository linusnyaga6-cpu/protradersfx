'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeKenyanPhone,
  parseChannelId,
  normalizePaymentStatus,
  initiateStkPush,
  getTransactionStatus,
} = require('./upesipay');

const testEnv = {
  UPESIPAY_BASIC_AUTH: 'Basic dGVzdDp0ZXN0',
  UPESIPAY_CHANNEL_ID: 'wallet',
};

function fakeResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

test('normalizes Kenyan mobile numbers to the UpesiPay country-code format', () => {
  assert.equal(normalizeKenyanPhone('0712 345 678'), '254712345678');
  assert.equal(normalizeKenyanPhone('+254 712-345-678'), '254712345678');
  assert.equal(normalizeKenyanPhone('112345678'), '254112345678');
  assert.throws(() => normalizeKenyanPhone('12345'), { code: 'INVALID_PHONE' });
});

test('accepts the UpesiPay wallet channel or a positive registered channel ID', () => {
  assert.equal(parseChannelId('wallet'), 'wallet');
  assert.equal(parseChannelId('12'), 12);
  assert.throws(() => parseChannelId(''), { code: 'UPESIPAY_CHANNEL_NOT_CONFIGURED' });
  assert.throws(() => parseChannelId('0'), { code: 'UPESIPAY_CHANNEL_NOT_CONFIGURED' });
});

test('maps provider statuses to a small safe set', () => {
  assert.equal(normalizePaymentStatus('success'), 'success');
  assert.equal(normalizePaymentStatus('cancelled'), 'cancelled');
  assert.equal(normalizePaymentStatus('timeout'), 'timeout');
  assert.equal(normalizePaymentStatus('sent'), 'pending');
});

test('validates a collection before calling UpesiPay', async () => {
  let called = false;
  await assert.rejects(
    initiateStkPush({
      amountKes: 0,
      phoneNumber: '0712345678',
      env: testEnv,
      fetchImpl: async () => { called = true; },
    }),
    { code: 'INVALID_AMOUNT' },
  );
  assert.equal(called, false);
});

test('sends a fixed-channel KES STK request and returns only safe payment details', async () => {
  let captured;
  const result = await initiateStkPush({
    amountKes: 500,
    phoneNumber: '0712345678',
    env: testEnv,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return fakeResponse(200, {
        success: true,
        data: { checkout_request_id: 'ws_CO_24062026133240', status: 'sent' },
      });
    },
  });

  assert.equal(captured.url, 'https://upesipay.com/api/v2/collections/initiate/');
  assert.equal(captured.options.headers.Authorization, testEnv.UPESIPAY_BASIC_AUTH);
  assert.deepEqual(JSON.parse(captured.options.body), {
    channel_id: 'wallet',
    phone_number: '254712345678',
    amount: 500,
  });
  assert.deepEqual(result, {
    ok: true,
    status: 'pending',
    reference: 'ws_CO_24062026133240',
    amountKes: 500,
    message: 'M-PESA prompt sent. Enter your PIN on your phone to complete the payment.',
  });
});

test('checks status with UpesiPay using the returned reference', async () => {
  let requestedUrl = '';
  const result = await getTransactionStatus({
    reference: 'ws_CO_24062026133240',
    env: testEnv,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return fakeResponse(200, { success: true, data: { status: 'success', amount: 500 } });
    },
  });

  assert.equal(requestedUrl, 'https://upesipay.com/api/v2/transaction-status?reference=ws_CO_24062026133240');
  assert.deepEqual(result, { status: 'success', amountKes: 500 });
});

test('never calls UpesiPay when server credentials are missing', async () => {
  let called = false;
  await assert.rejects(
    initiateStkPush({
      amountKes: 500,
      phoneNumber: '0712345678',
      env: { UPESIPAY_CHANNEL_ID: 'wallet' },
      fetchImpl: async () => { called = true; },
    }),
    { code: 'UPESIPAY_NOT_CONFIGURED' },
  );
  assert.equal(called, false);
});
