# Controlled Live Test Gate

Do not launch until every item below passes with production credentials issued by Deriv.

1. Configure `BASE_URL=https://protradersfx.com`.
2. In the official Deriv OAuth application, register **exactly** `https://protradersfx.com/oauth/callback` as the production redirect URI.
3. Set `DERIV_CLIENT_ID`, `DERIV_AFFILIATE_PARAM`, `DERIV_AFFILIATE_TOKEN`, and a strong `SESSION_SECRET` only in the server environment. Never commit them.
4. Open `/api/preflight` and require `readyForControlledLiveTest: true`.
5. From a controlled test device, start **Sign Up** and confirm Deriv displays the registration flow.
6. Confirm the Deriv consent/login screens work and cancellation returns safely to the site.
7. Complete one controlled test registration using the approved Deriv test account/process. Verify the callback succeeds and no access token appears in URL, HTML, browser storage, or logs.
8. Verify the registration is attributed in Deriv Partner Hub. The site counter alone is not proof of partner attribution.
9. Verify the authenticated session can obtain the test account information and execute **one demo/test trade only**. Do not use a real-money account for the launch gate.
10. Verify trade success/error handling, session expiry, logout, invalid state, invalid/expired authorization code, and Deriv API failure handling.
11. Check server logs and confirm no client secret, access token, refresh token, authorization code, or PKCE verifier is logged.
12. Only after all checks pass, deploy the production build and open public registration.

## Current status

The repository has **not** passed this gate because production Deriv credentials and a live deployed environment were not supplied to the build environment. Do not mark the launch as passed until the controlled test is actually performed.
