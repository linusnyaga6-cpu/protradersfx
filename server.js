"use strict";

const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| PROTRADERS FX CONFIGURATION
|--------------------------------------------------------------------------
*/

const BASE_URL = "https://protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret-change-this";

const PORT = process.env.PORT || 3000;

const REDIRECT_URI =
  `${BASE_URL}/oauth/callback`;

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

/*
|--------------------------------------------------------------------------
| SECURITY HEADERS
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "X-Frame-Options",
    "SAMEORIGIN"
  );

  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  next();
});

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| API CONFIG
|--------------------------------------------------------------------------
*/

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    baseUrl: BASE_URL,
    oauthConfigured: Boolean(CLIENT_ID),
    callback: REDIRECT_URI
  });
});

/*
|--------------------------------------------------------------------------
| TRACKING
|--------------------------------------------------------------------------
*/

app.post("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

app.get("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

/*
|--------------------------------------------------------------------------
| ANALYTICS
|--------------------------------------------------------------------------
*/

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    message: "Analytics endpoint is available"
  });
});

/*
|--------------------------------------------------------------------------
| PKCE HELPERS
|--------------------------------------------------------------------------
*/

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function createCodeVerifier() {
  return base64UrlEncode(
    crypto.randomBytes(32)
  );
}

function createCodeChallenge(verifier) {
  return base64UrlEncode(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}

/*
|--------------------------------------------------------------------------
| SIGN STATE
|--------------------------------------------------------------------------
*/

function signState(data) {
  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(data)
    .digest("hex");
}

/*
|--------------------------------------------------------------------------
| CREATE OAUTH STATE
|--------------------------------------------------------------------------
*/

function createOAuthState(verifier) {
  const timestamp =
    Date.now().toString();

  const random =
    crypto.randomBytes(16).toString("hex");

  const stateData =
    `${timestamp}:${random}:${verifier}`;

  const signature =
    signState(stateData);

  const complete =
    `${stateData}:${signature}`;

  return base64UrlEncode(
    Buffer.from(complete)
  );
}

/*
|--------------------------------------------------------------------------
| VERIFY OAUTH STATE
|--------------------------------------------------------------------------
*/

function verifyOAuthState(state) {
  try {
    const decoded =
      Buffer.from(
        state,
        "base64url"
      ).toString("utf8");

    const parts =
      decoded.split(":");

    if (parts.length !== 5) {
      return {
        valid: false
      };
    }

    const timestamp =
      parts[0];

    const random =
      parts[1];

    const verifier =
      parts[2];

    const signature =
      parts[4];

    const stateData =
      `${timestamp}:${random}:${verifier}`;

    const expected =
      signState(stateData);

    const validSignature =
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );

    const age =
      Date.now() -
      Number(timestamp);

    const validAge =
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 10 * 60 * 1000;

    return {
      valid:
        validSignature &&
        validAge,

      verifier
    };

  } catch (error) {
    console.error(
      "STATE VERIFY ERROR:",
      error
    );

    return {
      valid: false
    };
  }
}

/*
|--------------------------------------------------------------------------
| DERIV LOGIN
|--------------------------------------------------------------------------
*/

app.get(
  "/api/deriv/login",
  (req, res) => {
    try {
      const verifier =
        createCodeVerifier();

      const challenge =
        createCodeChallenge(
          verifier
        );

      const state =
        createOAuthState(
          verifier
        );

      const params =
        new URLSearchParams();

      params.set(
        "response_type",
        "code"
      );

      params.set(
        "client_id",
        CLIENT_ID
      );

      params.set(
        "redirect_uri",
        REDIRECT_URI
      );

      /*
       * Required Deriv OAuth scopes.
       */
      params.set(
        "scope",
        "trade account_manage"
      );

      params.set(
        "state",
        state
      );

      params.set(
        "code_challenge",
        challenge
      );

      params.set(
        "code_challenge_method",
        "S256"
      );

      const authorizationUrl =
        `${DERIV_AUTH_URL}?${params.toString()}`;

      console.log(
        "PROTRADERS FX OAUTH LOGIN:",
        authorizationUrl
      );

      return res.redirect(
        authorizationUrl
      );

    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to start Deriv login"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DERIV SIGNUP
|--------------------------------------------------------------------------
*/

app.get(
  "/api/deriv/signup",
  (req, res) => {
    try {
      const verifier =
        createCodeVerifier();

      const challenge =
        createCodeChallenge(
          verifier
        );

      const state =
        createOAuthState(
          verifier
        );

      const params =
        new URLSearchParams();

      params.set(
        "response_type",
        "code"
      );

      params.set(
        "client_id",
        CLIENT_ID
      );

      params.set(
        "redirect_uri",
        REDIRECT_URI
      );

      params.set(
        "scope",
        "trade account_manage"
      );

      params.set(
        "state",
        state
      );

      params.set(
        "code_challenge",
        challenge
      );

      params.set(
        "code_challenge_method",
        "S256"
      );

      const signupUrl =
        `${DERIV_AUTH_URL}?${params.toString()}`;

      console.log(
        "PROTRADERS FX OAUTH SIGNUP:",
        signupUrl
      );

      return res.redirect(
        signupUrl
      );

    } catch (error) {
      console.error(
        "SIGNUP ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to start Deriv signup"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OAUTH CALLBACK
|--------------------------------------------------------------------------
*/

app.get(
  "/oauth/callback",
  async (req, res) => {

    console.log(
      "PROTRADERS FX OAUTH CALLBACK RECEIVED"
    );

    const {
      code,
      state,
      error,
      error_description
    } = req.query;

    /*
     * DERIV RETURNED AN ERROR
     */

    if (error) {
      console.error(
        "DERIV OAUTH ERROR:",
        error,
        error_description || ""
      );

      return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Login Error</title>
<style>
body{
  margin:0;
  min-height:100vh;
  background:#070b12;
  color:#f2f5f8;
  font-family:Arial,sans-serif;
  display:flex;
  align-items:center;
  justify-content:center;
}
.box{
  width:min(500px,90%);
  background:#0c121c;
  border:1px solid #1d2735;
  padding:30px;
}
h1{
  margin-top:0;
  font-size:22px;
}
p{
  color:#9aa6b5;
  line-height:1.6;
}
a{
  display:inline-block;
  margin-top:15px;
  padding:11px 18px;
  background:#16c784;
  color:#04130d;
  text-decoration:none;
  font-weight:700;
}
</style>
</head>
<body>
<div class="box">
<h1>Authentication Error</h1>
<p>${escapeHtml(
  String(
    error_description ||
    error
  )
)}</p>
<a href="/">RETURN TO PROTRADERS FX</a>
</div>
</body>
</html>
      `);
    }

    /*
     * CODE IS REQUIRED
     */

    if (!code) {
      return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Authentication Failed</title>
<style>
body{
  margin:0;
  min-height:100vh;
  background:#070b12;
  color:#f2f5f8;
  font-family:Arial,sans-serif;
  display:flex;
  align-items:center;
  justify-content:center;
}
.box{
  width:min(500px,90%);
  background:#0c121c;
  border:1px solid #1d2735;
  padding:30px;
}
h1{
  margin-top:0;
  font-size:22px;
}
p{
  color:#9aa6b5;
  line-height:1.6;
}
a{
  display:inline-block;
  margin-top:15px;
  padding:11px 18px;
  background:#16c784;
  color:#04130d;
  text-decoration:none;
  font-weight:700;
}
</style>
</head>
<body>
<div class="box">
<h1>Authentication Failed</h1>
<p>Deriv did not return an authorization code.</p>
<a href="/">RETURN TO PROTRADERS FX</a>
</div>
</body>
</html>
      `);
    }

    /*
     * STATE IS REQUIRED
     */

    if (!state) {
      return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Security Error</title>
</head>
<body style="
margin:0;
padding:40px;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
">
<h2>Security Error</h2>
<p>OAuth state was not returned by Deriv.</p>
<a href="/" style="
display:inline-block;
margin-top:15px;
padding:10px 16px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
">RETURN TO PROTRADERS FX</a>
</body>
</html>
      `);
    }

    /*
     * VERIFY STATE
     */

    const stateResult =
      verifyOAuthState(
        String(state)
      );

    if (!stateResult.valid) {
      console.error(
        "INVALID OAUTH STATE"
      );

      return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Security Error</title>
</head>
<body style="
margin:0;
padding:40px;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
">
<h2>Security Error</h2>
<p>The OAuth session could not be verified.</p>
<a href="/" style="
display:inline-block;
margin-top:15px;
padding:10px 16px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
">RETURN TO PROTRADERS FX</a>
</body>
</html>
      `);
    }

    const verifier =
      stateResult.verifier;

    /*
     * EXCHANGE AUTHORIZATION CODE
     * FOR ACCESS TOKEN
     */

    try {
      const body =
        new URLSearchParams();

      body.set(
        "grant_type",
        "authorization_code"
      );

      body.set(
        "client_id",
        CLIENT_ID
      );

      body.set(
        "code",
        String(code)
      );

      body.set(
        "code_verifier",
        verifier
      );

      body.set(
        "redirect_uri",
        REDIRECT_URI
      );

      console.log(
        "PROTRADERS FX EXCHANGING OAUTH CODE"
      );

      const tokenResponse =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              body.toString()
          }
        );

      const tokenData =
        await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error(
          "DERIV TOKEN ERROR:",
          tokenData
        );

        return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Login Error</title>
</head>
<body style="
margin:0;
padding:40px;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
">
<h2>Deriv Login Failed</h2>
<p>The authorization code could not be exchanged for a login token.</p>
<p>Please return to ProTraders FX and try again.</p>
<a href="/" style="
display:inline-block;
margin-top:15px;
padding:10px 16px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
">RETURN TO PROTRADERS FX</a>
</body>
</html>
        `);
      }

      if (!tokenData.access_token) {
        console.error(
          "NO ACCESS TOKEN:",
          tokenData
        );

        return res.status(400).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Login Error</title>
</head>
<body style="
margin:0;
padding:40px;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
">
<h2>Login Token Missing</h2>
<p>Deriv did not return an access token.</p>
<a href="/" style="
display:inline-block;
margin-top:15px;
padding:10px 16px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
">RETURN TO PROTRADERS FX</a>
</body>
</html>
        `);
      }

      /*
       * IMPORTANT:
       *
       * Do NOT put the access token in the URL.
       * Do NOT log the token.
       *
       * For this deployment stage we confirm that
       * Deriv authentication completed successfully.
       */

      console.log(
        "PROTRADERS FX DERIV AUTHENTICATION SUCCESS"
      );

      return res.redirect(
        "/?oauth=success"
      );

    } catch (error) {
      console.error(
        "OAUTH TOKEN EXCHANGE ERROR:",
        error
      );

      return res.status(500).send(`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX - Authentication Error</title>
</head>
<body style="
margin:0;
padding:40px;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
">
<h2>Authentication Error</h2>
<p>ProTraders FX could not complete the Deriv login.</p>
<a href="/" style="
display:inline-block;
margin-top:15px;
padding:10px 16px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
">RETURN TO PROTRADERS FX</a>
</body>
</html>
      `);
    }
  }
);

/*
|--------------------------------------------------------------------------
| API ROOT
|--------------------------------------------------------------------------
*/

app.get("/api", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});

/*
|--------------------------------------------------------------------------
| HTML ESCAPE
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path
  });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  (err, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      err
    );

    res.status(500).json({
      ok: false,
      error:
        "Internal server error"
    });
  }
);

/*
|--------------------------------------------------------------------------
| VERCEL EXPORT
|--------------------------------------------------------------------------
*/

module.exports = app;

/*
|--------------------------------------------------------------------------
| LOCAL DEVELOPMENT
|--------------------------------------------------------------------------
*/

if (require.main === module) {
  app.listen(
    PORT,
    () => {
      console.log(
        `ProTraders FX running on port ${PORT}`
      );
    }
  );
}
