# ProTraders FX — Controlled Live Test

1. Confirm the production domain is HTTPS.
2. Confirm Deriv OAuth redirect URI is exactly `https://protradersfx.com/oauth/callback`.
3. Confirm the OAuth client ID and partner tracking values are set in Vercel.
4. Test **Log In** with an existing Deriv account. It must not force registration.
5. Test **Create Account** through the partner flow and verify attribution in Deriv Partner tooling.
6. Confirm no access token is exposed to browser JavaScript.
7. Confirm live market feed displays real ticks when `DERIV_PUBLIC_APP_ID` is configured.
8. Test account data using a controlled/demo account before real funds.
9. Enable real trading only after the server-side Deriv trading adapter validates orders, account session, stake and risk limits.
10. Test the free bot on demo before any live execution is enabled.
11. Verify logout destroys the application session.
12. Verify analytics does not collect unnecessary personally identifying information.

Never use fabricated prices, balances, trades or funded-account counts in production UI.
