'use strict';

class ProviderUnavailableError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.code = code;
    this.statusCode = 503;
  }
}

class InvalidTradingModeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidTradingModeError';
    this.code = 'INVALID_TRADING_MODE';
    this.statusCode = 400;
  }
}

class PaymentProvider {
  async createDeposit() {
    throw new ProviderUnavailableError('PAYMENTS_DISABLED', 'Payments are not enabled.');
  }

  async verifyDeposit() {
    throw new ProviderUnavailableError('PAYMENTS_DISABLED', 'Payments are not enabled.');
  }

  async getDepositStatus() {
    throw new ProviderUnavailableError('PAYMENTS_DISABLED', 'Payments are not enabled.');
  }

  async requestWithdrawal() {
    throw new ProviderUnavailableError('PAYMENTS_DISABLED', 'Payments are not enabled.');
  }

  async getTransactionHistory() {
    throw new ProviderUnavailableError('PAYMENTS_DISABLED', 'Payments are not enabled.');
  }
}

// Deliberately fail-closed: the payment boundary is defined, but this preview
// does not initiate, verify, or pay out real UpesiPay transactions.
class UpesiPayPaymentProvider extends PaymentProvider {}

class ExecutionProvider {
  async validateOrder() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async getQuote() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async placeOrder() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async cancelOrder() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async getOrder() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async getPositions() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async getBalance() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }

  async getTradeHistory() {
    throw new ProviderUnavailableError('EXECUTION_NOT_CONFIGURED', 'No execution provider is configured.');
  }
}

class MarketDataProvider {
  async getQuote() {
    throw new ProviderUnavailableError('MARKET_DATA_NOT_CONFIGURED', 'No live market-data provider is configured.');
  }

  async getHistoricalData() {
    throw new ProviderUnavailableError('MARKET_DATA_NOT_CONFIGURED', 'No live market-data provider is configured.');
  }

  async subscribe() {
    throw new ProviderUnavailableError('MARKET_DATA_NOT_CONFIGURED', 'No live market-data provider is configured.');
  }
}

function getFeatureFlags(env = process.env) {
  const executionMode = String(env.EXECUTION_MODE || 'DEMO').trim().toUpperCase();
  const validExecutionMode = ['DEMO', 'REAL', 'BOTH'].includes(executionMode);
  const demoRequested = executionMode === 'DEMO' || executionMode === 'BOTH';
  const realRequested = executionMode === 'REAL' || executionMode === 'BOTH';
  return {
    executionMode,
    validExecutionMode,
    demoTradingEnabled: validExecutionMode && demoRequested && env.FOREX_DEMO_TRADING_ENABLED !== 'false',
    realTradingRequested: validExecutionMode && realRequested,
    realTradingEnabled: env.REAL_TRADING_ENABLED === 'true',
    paymentsRequested: env.FOREX_PAYMENTS_ENABLED === 'true',
  };
}

function resolveExecutionProvider(mode, providers = {}, env = process.env) {
  const flags = getFeatureFlags(env);
  if (!flags.validExecutionMode) {
    throw new ProviderUnavailableError('INVALID_EXECUTION_CONFIGURATION', 'EXECUTION_MODE must be DEMO, REAL, or BOTH.');
  }

  if (mode === 'demo') {
    if (!flags.demoTradingEnabled) {
      throw new ProviderUnavailableError('DEMO_TRADING_DISABLED', 'Demo trading is disabled.');
    }
    if (!providers.demo) {
      throw new ProviderUnavailableError('DEMO_EXECUTION_NOT_CONFIGURED', 'Demo execution is not configured.');
    }
    return providers.demo;
  }

  if (mode === 'real') {
    if (!flags.realTradingRequested) {
      throw new ProviderUnavailableError('REAL_MODE_NOT_CONFIGURED', 'REAL mode is not selected in EXECUTION_MODE.');
    }
    if (!flags.realTradingEnabled) {
      throw new ProviderUnavailableError('REAL_TRADING_DISABLED', 'Real-money trading is disabled.');
    }
    if (!providers.real) {
      throw new ProviderUnavailableError('REAL_EXECUTION_NOT_CONFIGURED', 'Real-money execution is not configured.');
    }
    return providers.real;
  }

  throw new InvalidTradingModeError('Choose demo or real mode explicitly.');
}

function getPublicStatus(env = process.env) {
  const flags = getFeatureFlags(env);
  return {
    mode: 'demo',
    executionModeSetting: flags.validExecutionMode ? flags.executionMode : 'INVALID',
    availableAccountModes: flags.demoTradingEnabled ? ['DEMO'] : [],
    demoTradingEnabled: flags.demoTradingEnabled,
    realTradingEnabled: false,
    realModeAvailable: false,
    realModeBlocker: 'Required real-account infrastructure is not configured.',
    paymentsEnabled: false,
    quoteSource: 'simulated',
    wallet: 'browser-only demo credits; no persistent or withdrawable balance',
  };
}

module.exports = {
  ExecutionProvider,
  InvalidTradingModeError,
  MarketDataProvider,
  PaymentProvider,
  ProviderUnavailableError,
  UpesiPayPaymentProvider,
  getFeatureFlags,
  getPublicStatus,
  resolveExecutionProvider,
};
