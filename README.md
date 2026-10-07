# ProTraders FX v5

A clean ProTraders FX rebuild with a TraderScheme-style dark trading workspace, Deriv OAuth 2.0 + PKCE, live public market feed, authenticated account proxy, manual Rise/Fall execution, analytics, and the free bot interface. Premium bots are excluded.

## Flow
Home (`/`) -> LOG IN -> Deriv OAuth -> `/workspace.html`.

Existing Deriv users use **LOG IN**. New users use **CREATE ACCOUNT**, which carries the configured Deriv partner attribution parameters.

## Required Vercel environment variables
Copy `.env.example` into the Vercel project settings and supply real production values. Never commit `.env` or Deriv tokens.

The Deriv OAuth redirect URI must be registered exactly as:
`https://protradersfx.com/oauth/callback`

## Important
The manual trade endpoint uses Deriv's proposal + buy flow for Rise/Fall (CALL/PUT). Test with a demo account and a very small stake first. Do not advertise simulated results as real performance.

## ProTraders Markets deposits

The `/trade` Markets portal can initiate an UpesiPay M-PESA STK collection and check its provider status. This first release is collection-only: it does not create customer accounts, post a credit to the simulated USD balance, or process withdrawals. Payouts remain manual.

Configure `UPESIPAY_BASIC_AUTH` (the complete Basic authorization header) and `UPESIPAY_CHANNEL_ID` as server-only Vercel environment variables for the `protradersfx` project. Generate/rotate the UpesiPay credentials before use; never place them in browser code, chat, or the repository. Choose an active collection channel from the UpesiPay dashboard. Their `wallet` channel has a published 4.5% collection fee; verify the current fee and channel terms in UpesiPay before enabling it.
