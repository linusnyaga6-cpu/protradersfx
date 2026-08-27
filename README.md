# ProTraders FX — Trading Workspace

TraderScheme-inspired UX/layout for ProTraders FX, using the supplied ProTraders FX foundation and a dark, compact professional terminal design.

## Included
- Homepage with Log In / Create Account
- Deriv OAuth 2.0 + PKCE foundation
- Existing-user login flow without registration prompt
- New-user partner attribution flow
- Live synthetic-market ticker/price chart when `DERIV_PUBLIC_APP_ID` is configured
- Market analysis workspace
- Account overview shell
- Free-bot interface (execution intentionally disabled until controlled live-test integration)
- Trading interface (execution intentionally disabled until server-side Deriv trading adapter is configured)
- Privacy-conscious analytics
- Vercel deployment configuration

## Important
This project does not fabricate balances, trades, funded accounts or execution results. Live trading must be enabled only after the authenticated Deriv WebSocket/trading adapter is implemented and tested with the official production credentials.

## Production environment
Set the values from `.env.example` in Vercel Project Settings → Environment Variables. Never commit `.env` or access tokens.

Production OAuth callback:
`https://protradersfx.com/oauth/callback`

## Design reference
The interface takes inspiration from the public structure and trading-workspace presentation of TraderScheme, but uses original ProTraders FX branding, content and implementation. Do not copy proprietary assets or source code.

## Run locally
```bash
npm install
npm start
```
