# ProTraders FX — production starter

## What is included
- Production-style landing page and responsive design
- Deriv OAuth 2.0 Authorization Code flow with PKCE
- Separate existing-user Login and new-user Sign Up flows; only Sign Up sends `prompt=registration`
- CSRF-protected, encrypted OAuth state
- Deriv signup attribution via the exact affiliate parameter configured in `.env`
- Basic privacy-conscious visitor and registration analytics
- Security headers, CORS allow-list, API rate limiting, and no token exposure to the browser
- Required Deriv risk warning and independent-partner disclosure

## Required before deployment
1. Create/register your Deriv OAuth 2.0 application and whitelist exactly:
   `https://protradersfx.com/oauth/callback`
2. Copy the `client_id` into `DERIV_CLIENT_ID`.
3. Copy the tracking token and parameter name (`t`, `affiliate_token`, `sidi`, or `ca`) from your Deriv referral link/Partners dashboard into `DERIV_AFFILIATE_PARAM` and `DERIV_AFFILIATE_TOKEN`.
4. Set a strong `SESSION_SECRET`.
5. Set `BASE_URL` and `ALLOWED_ORIGINS` to the final HTTPS domain.
6. Run `npm install` then `npm start`.

## Analytics limitation
The site counts visitors and successful OAuth registrations. It does **not** invent or infer funded accounts. Confirmed funded/trading referral data should be taken from Deriv Partner Hub reports.
