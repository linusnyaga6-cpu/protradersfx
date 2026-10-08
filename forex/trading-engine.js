'use strict';

const { ProviderUnavailableError, resolveExecutionProvider } = require('./providers');

class WalletLedger {
  async getWallet() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async appendEntry() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async creditVerifiedDeposit() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async reserveWithdrawal() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async listTransactions() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async settleTrade() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }
}

class TradingEngine {
  constructor({ executionProviders = {}, env = process.env } = {}) {
    this.executionProviders = executionProviders;
    this.env = env;
  }

  async placeOrder(order) {
    const mode = order?.mode;
    const provider = resolveExecutionProvider(mode, this.executionProviders, this.env);
    if (!order || typeof order !== 'object') throw new TypeError('Order details are required.');
    return provider.placeOrder(order);
  }

  async getQuote(mode, instrument) {
    const provider = resolveExecutionProvider(mode, this.executionProviders, this.env);
    if (typeof provider.getQuote !== 'function') {
      throw new ProviderUnavailableError('QUOTE_NOT_SUPPORTED', 'The selected execution provider has no quote method.');
    }
    return provider.getQuote(instrument);
  }
}

module.exports = { TradingEngine, WalletLedger };
