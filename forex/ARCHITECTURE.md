# ProTradersFX account-mode architecture

This draft preserves the `/forex` demo and adds configuration and fail-closed
contracts for future real-account work. It does not enable a real account,
payment, customer balance, withdrawal, or live order path.

## Existing application facts

- Vercel builds the root `server.js` Express application. The current root
  client and the existing `/trade` application remain separate.
- The existing Deriv login and order routes remain a separate integration.
  `/forex` does not use Deriv as custody or send orders to its endpoints.
- The current production source has no durable wallet database or migrations;
  Vercel analytics use `/tmp`, not a customer ledger.
- No live UpesiPay payment integration or real-money `/forex` ledger is included.

## Account modes

- `DEMO`: the current browser-only simulation; generated values, simulated
  orders, no external execution, no cash value.
- `REAL`: intended future real-money mode. It remains unavailable until payment,
  funds-control, settlement, execution, authentication, persistence, and review
  requirements are implemented.
- `BOTH`: a future configuration that can expose both modes only after the
  real-mode gates are satisfied. It does not override the disabled flag or
  missing infrastructure.

Configuration defaults in `.env.example`:

```text
EXECUTION_MODE=DEMO
REAL_TRADING_ENABLED=false
FOREX_DEMO_TRADING_ENABLED=true
FOREX_PAYMENTS_ENABLED=false
```

The public status endpoint advertises DEMO only and reports REAL unavailable.
The UI shows `DEMO · ACTIVE` and `REAL · OFF`; REAL is not a clickable switch.
Changing the mode string or flag alone cannot turn on real trading. The
`TradingEngine` also requires a complete server-side readiness contract before
delegating to a real workflow. No real workflow or real-money HTTP route is
provided in this draft.

## Real-mode server-side gates

`real-trading-gates.js` names the required server services: authentication,
verified-account checks, risk acknowledgement, a verified funds-control and
settlement arrangement, regulatory readiness, payment verification and payout,
a durable ledger, idempotency storage, persistent order/settlement records,
audit logging, a real execution adapter, and a reviewed real-order workflow.
Every service must be explicitly configured and implement its required methods.

`validateRealOrder()` uses a server-configured instrument allowlist and stake
limit, requires a currency, direction, integer minor-unit stake, and idempotency
key, and returns only those validated fields. It strips any client-supplied
balance, identity, verification, or settlement claims. A future workflow must
still obtain the authenticated user from server context, verify the account and
risk acknowledgement, check and reserve available balance atomically, claim
the idempotency key, persist pending/executed/settled state, audit the action,
and authorize withdrawals server-side.

These are fail-closed interfaces and input checks, not a production financial
system. No durable database, auth/account-verification service, payment
provider, real execution venue, settlement provider, withdrawal authorization
flow, or legal approval is present. The gate does not determine or invent where
funds are held or which regulation applies.

## Requested implementation report

1. **Demo flow:** the browser generates prices and settles simulated orders
   against virtual credits; refresh clears them. No provider is called.
2. **Real flow:** not active. An explicitly selected REAL request must pass
   config, infrastructure-readiness, and server-order validation before a
   future injected workflow could call a configured execution adapter. This
   repo supplies no such workflow or route.
3. **Balance storage:** demo credits exist only in browser memory. No customer
   real balance is stored; there is no durable ledger.
4. **Deposits/withdrawals:** neither is processed. The UpesiPay class is a
   fail-closed boundary only; it makes no requests. UpesiPay is payment-only.
5. **Real order execution:** none is configured in `/forex`. No broker,
   custodian, venue, or licence is invented. Existing Deriv routes remain
   separate from this account-mode preview.
6. **Environment/secrets:** current non-secret settings are `EXECUTION_MODE`,
   `REAL_TRADING_ENABLED`, `FOREX_DEMO_TRADING_ENABLED`, and
   `FOREX_PAYMENTS_ENABLED`. Defaults keep the site in DEMO. No credentials are
   required for this preview. If a payment adapter is later implemented,
   provider credentials must be server-side deployment secrets and used only
   by that payment adapter.
7. **Security gates:** explicit mode selection with no mode fallback; REAL flag
   and provider/config checks; named missing-infrastructure report; server
   allowlist, positive integer stake and maximum-stake validation; idempotency
   key requirement; browser-supplied identity/balance claims are discarded;
   tests verify no provider call when readiness services are missing. Actual
   authentication, balance reservation, persistent idempotency, audit, and
   payout authorization still need implementations.
8. **Tests:** `npm test` covers fee math, provider separation, mode flags,
   readiness gates, real-order input validation, and the no-execution default.
9. **Preview:** use the latest Vercel Preview URL recorded on the open draft PR;
   it is not the production site.
10. **Before REAL can be enabled:** document the actual funds holding/control
    and settlement path; determine applicable regulatory requirements; select
    and intentionally configure real payment and execution adapters; implement
    durable transactional database migrations and a balanced customer/operator
    ledger; add authentication, account verification and risk acceptance;
    implement server-side order validation, atomic balance reservation,
    idempotency, execution and settlement persistence, audit logging, and
    authorized withdrawals; configure secrets only in the deployment's secret
    manager; test provider sandbox, duplicate callbacks/orders, failure and
    recovery paths; then complete independent security/compliance review and a
    separately approved production release.

## Proposed fees

The 10% gross-deposit, 1% actually executed stake, and 20% verified positive
net realized profit calculations remain proposals only. The helper functions
do not collect fees, mutate a ledger, or make a browser-reported profit
withdrawable.
