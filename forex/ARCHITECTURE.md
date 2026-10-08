# ProTradersFX `/forex` sandbox architecture

This draft adds an isolated, explicitly simulated workspace. It does not turn
on real payments, customer-money custody, or live execution.

## Existing application facts

- Vercel builds the root `server.js` Express application. The current root
  client is bundled separately from the existing `/trade` static application.
- The existing login and live order paths are Deriv OAuth/account flows. They
  remain separate from this `/forex` preview.
- The deployed source has no PostgreSQL driver or wallet/payment migrations.
  Its analytics file uses `/tmp` on Vercel, which is not a durable ledger.
- There is no live UpesiPay integration on `main`; a separate open draft is not
  included or changed by this work.

## Provider boundaries

- `PaymentProvider` is the interface for collection, payment verification,
  and payout. `UpesiPayPaymentProvider` currently fails closed; it makes no
  network requests and exposes no payment endpoint.
- `ExecutionProvider` is independent of payments. A future implementation
  must be explicitly selected for live mode.
- `TradingEngine` delegates only to the provider selected by an explicit
  `demo` or `live` mode; the `WalletLedger` contract fails closed until a
  durable implementation is supplied.
- `MarketDataProvider` is a separate contract. The demo page uses generated
  browser-only values and labels them simulated; it does not request or claim
  live market data.
- `resolveExecutionProvider()` requires an explicit mode. Live mode returns
  an error while disabled or unconfigured; it never silently changes to demo.
- The current Deriv integration is not treated as custody for a ProTraders FX
  wallet, and UpesiPay is not treated as an execution provider.

## Demo and fees

The `/forex` page is a browser-memory demo with virtual credits. Refreshing or
leaving resets it. Demo positions and results are not saved, cash-valued,
withdrawable, or sent to an exchange.

The proposed schedule is represented only by pure arithmetic helpers:

- 10% of gross deposit;
- 1% of an actually executed stake;
- 20% of verified, positive net realized profit.

The page labels these rates as proposed and inactive. The functions do not
move funds or write balances. Performance-fee input must come from a future
verified ledger calculation, never a client-supplied result or estimate.

## What is deliberately not enabled

- No real deposits, withdrawals, UpesiPay callbacks, or payout requests.
- No persistent customer wallet, KYC gate, or server-side trade ledger.
- No live trade execution or live price feed.
- No real-money commission collection.

Before any real-money feature is implemented, the production deployment needs
a durable transactional database and a reviewed accounting/custody and
settlement design. Payment verification must be server-to-server and
idempotent; customer principal and operator fees must be distinct ledger
accounts. Live execution and regulatory applicability must be established
separately. Those decisions are not inferred or configured in this PR.

## Checks

Run `npm test` and `node --check server.js`. The tests cover fee arithmetic,
provider separation, and fail-closed behavior. They do not test a production
database, UpesiPay, or live trade execution because those paths are not active.
