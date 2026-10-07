'use strict';

const API_ROOT = 'https://upesipay.com/api/v2';
const MAX_AMOUNT_KES = 500000;

function makeError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeKenyanPhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw makeError('Enter a valid Kenyan M-PESA number.', 400, 'INVALID_PHONE');
  }

  const input = String(value).trim();
  if (!/^[+0-9\s().-]+$/.test(input)) {
    throw makeError('Enter a valid Kenyan M-PESA number.', 400, 'INVALID_PHONE');
  }

  let digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = `254${digits.slice(1)}`;
  } else if (/^[17]\d{8}$/.test(digits)) {
    digits = `254${digits}`;
  }

  if (!/^254[17]\d{8}$/.test(digits)) {
    throw makeError('Enter a valid Kenyan M-PESA number, such as 0712345678.', 400, 'INVALID_PHONE');
  }

  return digits;
}

function parseChannelId(value) {
  const raw = String(value ?? '').trim();
  if (raw.toLowerCase() === 'wallet') return 'wallet';
  if (/^[1-9]\d*$/.test(raw)) {
    const channelId = Number(raw);
    if (Number.isSafeInteger(channelId)) return channelId;
  }
  throw makeError('UpesiPay collection channel is not configured.', 503, 'UPESIPAY_CHANNEL_NOT_CONFIGURED');
}

function getBasicAuth(env = process.env) {
  const authorization = String(env.UPESIPAY_BASIC_AUTH || '').trim();
  if (!/^Basic\s+[A-Za-z0-9+/=_-]+$/.test(authorization)) {
    throw makeError('UpesiPay is not configured yet.', 503, 'UPESIPAY_NOT_CONFIGURED');
  }
  return authorization;
}

async function callUpesiPay({ path, method = 'GET', body, env = process.env, fetchImpl = globalThis.fetch }) {
  const authorization = getBasicAuth(env);
  if (typeof fetchImpl !== 'function') {
    throw makeError('UpesiPay is temporarily unavailable.', 503, 'UPESIPAY_UNAVAILABLE');
  }

  const headers = {
    Authorization: authorization,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetchImpl(`${API_ROOT}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch {
    throw makeError('The request timed out, so its status is unknown. Check your phone or UpesiPay before trying again.', 502, 'UPESIPAY_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Treat an unreadable upstream response as a failed payment operation.
  }

  return { response, payload };
}

function upstreamError(response) {
  if (response.status === 401) {
    return makeError('UpesiPay credentials need to be updated.', 503, 'UPESIPAY_AUTH_FAILED');
  }
  if (response.status === 402) {
    return makeError('The payment service is temporarily unavailable. Please contact support.', 503, 'UPESIPAY_SERVICE_BALANCE');
  }
  if (response.status === 412) {
    return makeError('The UpesiPay account is not fully configured for collections.', 503, 'UPESIPAY_ACCOUNT_NOT_READY');
  }
  if (response.status === 400) {
    return makeError('UpesiPay rejected the request. Check the phone number and active collection channel.', 422, 'UPESIPAY_REQUEST_REJECTED');
  }
  return makeError('UpesiPay could not complete the request. Please try again shortly.', 502, 'UPESIPAY_REQUEST_FAILED');
}

async function initiateStkPush({ amountKes, phoneNumber, env = process.env, fetchImpl = globalThis.fetch }) {
  const amount = Number(amountKes);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT_KES) {
    throw makeError(`Enter a whole KES amount from 1 to ${MAX_AMOUNT_KES.toLocaleString('en-KE')}.`, 400, 'INVALID_AMOUNT');
  }

  const phone = normalizeKenyanPhone(phoneNumber);
  const channelId = parseChannelId(env.UPESIPAY_CHANNEL_ID);
  const { response, payload } = await callUpesiPay({
    path: '/collections/initiate/',
    method: 'POST',
    body: {
      channel_id: channelId,
      phone_number: phone,
      amount,
    },
    env,
    fetchImpl,
  });

  if (!response.ok || payload?.success !== true) throw upstreamError(response);
  const data = payload.data || {};
  const reference = String(data.checkout_request_id || data.reference_id || '');
  if (!reference || !/^[A-Za-z0-9_-]{6,120}$/.test(reference)) {
    throw makeError('UpesiPay did not return a usable payment reference.', 502, 'UPESIPAY_INVALID_RESPONSE');
  }

  return {
    ok: true,
    status: 'pending',
    reference,
    amountKes: amount,
    message: 'M-PESA prompt sent. Enter your PIN on your phone to complete the payment.',
  };
}

function normalizePaymentStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['success', 'successful', 'completed', 'complete'].includes(status)) return 'success';
  if (['failed', 'failure', 'declined'].includes(status)) return 'failed';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (['timeout', 'timed_out', 'expired'].includes(status)) return 'timeout';
  return 'pending';
}

async function getTransactionStatus({ reference, env = process.env, fetchImpl = globalThis.fetch }) {
  const ref = String(reference || '').trim();
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(ref)) {
    throw makeError('Enter a valid payment reference.', 400, 'INVALID_REFERENCE');
  }

  const query = new URLSearchParams({ reference: ref }).toString();
  const { response, payload } = await callUpesiPay({
    path: `/transaction-status?${query}`,
    method: 'GET',
    env,
    fetchImpl,
  });

  if (response.status === 404) return { status: 'pending' };
  if (!response.ok || payload?.success === false) throw upstreamError(response);

  const data = payload.data || payload;
  return {
    status: normalizePaymentStatus(data.status || payload.status),
    ...(Number.isSafeInteger(Number(data.amount)) ? { amountKes: Number(data.amount) } : {}),
  };
}

module.exports = {
  MAX_AMOUNT_KES,
  normalizeKenyanPhone,
  parseChannelId,
  normalizePaymentStatus,
  initiateStkPush,
  getTransactionStatus,
};
