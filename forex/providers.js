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
  return {
    demoTradingEnabled: env.FOREX_DEMO_TRADING_ENABLED !== 'false',
    liveTradingRequested: env.FOREX_LIVE_TRADING_ENABLED === 'true',
    paymentsRequested: env.FOREX_PAYMENTS_ENABLED === 'true',
  };
}

function resolveExecutionProvider(mode, providers = {}, env = process.env) {
  const flags = getFeatureFlags(env);

  if (mode === 'demo') {
    if (!flags.demoTradingEnabled) {
      throw new ProviderUnavailableError('DEMO_TRADING_DISABLED', 'Demo trading is disabled.');
    }
    if (!providers.demo) {
      throw new ProviderUnavailableError('DEMO_EXECUTION_NOT_CONFIGURED', 'Demo execution is not configured.');
    }
    return providers.demo;
  }

  if (mode === 'live') {
    if (!flags.liveTradingRequested) {
      throw new ProviderUnavailableError('LIVE_TRADING_DISABLED', 'Live trading is unavailable.');
    }
    if (!providers.live) {
      throw new ProviderUnavailableError('LIVE_EXECUTION_NOT_CONFIGURED', 'Live trading is unavailable.');
    }
    return providers.live;
  }

  throw new InvalidTradingModeError('Choose demo or live mode explicitly.');
}

function getPublicStatus(env = process.env) {
  return {
    mode: 'demo',
    demoTradingEnabled: env.FOREX_DEMO_TRADING_ENABLED !== 'false',
    liveTradingEnabled: false,
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
