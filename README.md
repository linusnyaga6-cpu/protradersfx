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
