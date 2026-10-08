'use strict';

const { ProviderUnavailableError, resolveExecutionProvider } = require('./providers');
const { requireRealTradingReady, validateRealOrder } = require('./real-trading-gates');

class WalletLedger {
  async getWallet() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async getAvailableBalance() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async appendEntry() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async creditVerifiedDeposit() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async reserveStake() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async releaseStake() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async reserveWithdrawal() {
    throw new ProviderUnavailableError('LEDGER_NOT_CONFIGURED', 'A durable wallet ledger is not configured.');
  }

  async recordOperatorFees() {
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
  constructor({ executionProviders = {}, services = {}, realOrderPolicy = {}, env = process.env } = {}) {
    this.executionProviders = executionProviders;
    this.services = services;
    this.realOrderPolicy = realOrderPolicy;
    this.env = env;
  }

  async placeOrder(order, serverContext) {
    const mode = order?.mode;
    if (!order || typeof order !== 'object') throw new TypeError('Order details are required.');
    if (mode === 'real') {
      const provider = resolveExecutionProvider(mode, this.executionProviders, this.env);
      const services = { ...this.services, executionProvider: this.services.executionProvider || provider };
      requireRealTradingReady({ env: this.env, services });
      const validatedOrder = validateRealOrder(order, this.realOrderPolicy);
      // No real-order workflow is supplied or exposed by this preview. If one
      // is added later, it must authenticate from server context and enforce
      // the verified-account, balance, risk, idempotency, persistence,
      // settlement, withdrawal, and audit gates before calling the provider.
      return services.realOrderWorkflow.execute({
        order: validatedOrder,
        serverContext,
        executionProvider: provider,
        services,
      });
    }
    const provider = resolveExecutionProvider(mode, this.executionProviders, this.env);
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
