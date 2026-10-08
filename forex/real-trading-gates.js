'use strict';

const { getFeatureFlags, ProviderUnavailableError } = require('./providers');

// These capabilities must be implemented by server-side services and
// explicitly marked configured. The preview provides none of them.
const REQUIRED_REAL_SERVICES = Object.freeze({
  authentication: ['requireAuthenticatedUser'],
  accountVerification: ['requireVerifiedAccount'],
  riskAcknowledgement: ['requireAcknowledged'],
  fundsCustody: ['verifyArrangement'],
  settlement: ['verifySettlementPath'],
  legalReadiness: ['assertApproved'],
  paymentProvider: ['verifyDeposit', 'requestWithdrawal'],
  ledger: [
    'getAvailableBalance',
    'creditVerifiedDeposit',
    'reserveStake',
    'releaseStake',
    'settleTrade',
    'reserveWithdrawal',
    'recordOperatorFees',
  ],
  idempotencyStore: ['claim'],
  orderStore: ['createPending', 'recordExecution', 'recordSettlement'],
  auditLog: ['record'],
  executionProvider: ['validateOrder', 'placeOrder', 'getOrder'],
  realOrderWorkflow: ['execute'],
});

function getRealTradingReadiness({ env = process.env, services = {} } = {}) {
  const flags = getFeatureFlags(env);
  const missing = [];

  if (!flags.validExecutionMode) missing.push('EXECUTION_MODE must be DEMO, REAL, or BOTH');
  else if (!flags.realTradingRequested) missing.push('EXECUTION_MODE must include REAL');
  if (!flags.realTradingEnabled) missing.push('REAL_TRADING_ENABLED must be true');
  if (!flags.paymentsRequested) missing.push('FOREX_PAYMENTS_ENABLED must be true');

  for (const [serviceName, methods] of Object.entries(REQUIRED_REAL_SERVICES)) {
    const service = services[serviceName];
    if (!service || service.configured !== true) {
      missing.push(`${serviceName} is not configured`);
      continue;
    }
    for (const method of methods) {
      if (typeof service[method] !== 'function') missing.push(`${serviceName}.${method} is not implemented`);
    }
  }

  return { ready: missing.length === 0, missing };
}

function requireRealTradingReady(options) {
  const readiness = getRealTradingReadiness(options);
  if (!readiness.ready) {
    const error = new ProviderUnavailableError(
      'REAL_TRADING_NOT_READY',
      'Real-money trading is disabled until all required services and approvals are configured.',
    );
    error.missingRequirements = readiness.missing;
    throw error;
  }
  return readiness;
}

// Server-side schema gate: allowlists and limits must come from trusted
// server configuration, not from the request body or browser wallet.
function validateRealOrder(order, { allowedInstruments = [], maxStakeMinorUnits } = {}) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new TypeError('A real order object is required.');
  }
  const instrument = typeof order.instrument === 'string' ? order.instrument.trim() : '';
  const currency = typeof order.currency === 'string' ? order.currency.trim().toUpperCase() : '';
  const side = typeof order.side === 'string' ? order.side.trim().toLowerCase() : '';
  const idempotencyKey = typeof order.idempotencyKey === 'string' ? order.idempotencyKey.trim() : '';
  const stakeMinorUnits = order.stakeMinorUnits;

  if (!Array.isArray(allowedInstruments) || !allowedInstruments.includes(instrument)) {
    throw new TypeError('Instrument is not in the server-configured allowlist.');
  }
  if (!['buy', 'sell'].includes(side)) throw new TypeError('Order side must be buy or sell.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('A valid currency code is required.');
  if (!Number.isSafeInteger(stakeMinorUnits) || stakeMinorUnits <= 0) {
    throw new TypeError('Stake must be a positive integer in minor units.');
  }
  if (!Number.isSafeInteger(maxStakeMinorUnits) || maxStakeMinorUnits <= 0 || stakeMinorUnits > maxStakeMinorUnits) {
    throw new TypeError('Stake exceeds the server-configured order limit.');
  }
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    throw new TypeError('A valid idempotency key is required.');
  }

  // Return only validated fields. In particular, never accept a client balance,
  // account-verification claim, user identity, or settlement result.
  return { instrument, side, currency, stakeMinorUnits, idempotencyKey };
}

module.exports = {
  REQUIRED_REAL_SERVICES,
  getRealTradingReadiness,
  requireRealTradingReady,
  validateRealOrder,
};
