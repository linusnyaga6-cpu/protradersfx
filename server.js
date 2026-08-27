"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BASE_URL =
  process.env.BASE_URL || "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "protraders-fx-session-secret";

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;

/*
|--------------------------------------------------------------------------
| SECURITY HEADERS
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  next();
});

/*
|--------------------------------------------------------------------------
| STATIC WEBSITE FILES
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This makes these files available:
|
| /
| /index.html
| /app.js
| /style.css
| /tracker.js
|
*/

app.use(
  express.static(ROOT, {
    index: false,
    extensions: ["html"]
  })
);

/*
|--------------------------------------------------------------------------
| HOME PAGE
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
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
| CONFIG
|--------------------------------------------------------------------------
*/

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    baseUrl: BASE_URL,
    oauthConfigured: Boolean(CLIENT_ID),
    callback: `${BASE_URL}/oauth/callback`
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
| OAUTH HELPERS
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
| DERIV LOGIN
|--------------------------------------------------------------------------
*/

app.get("/api/deriv/login", (req, res) => {
  try {
    const verifier =
      createCodeVerifier();

    const challenge =
      createCodeChallenge(
        verifier
      );

    const stateData =
      `${Date.now()}:${verifier}`;

    const signature =
      signState(stateData);

    const state =
      base64UrlEncode(
        Buffer.from(
          `${stateData}:${signature}`
        )
      );

    const callback =
      `${BASE_URL}/oauth/callback`;

    const params =
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: callback,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state
      });

    const authorizationUrl =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "PROTRADERS FX LOGIN:",
      authorizationUrl
    );

    res.redirect(
      authorizationUrl
    );

  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Unable to start login"
    });
  }
});

/*
|--------------------------------------------------------------------------
| DERIV SIGNUP
|--------------------------------------------------------------------------
*/

app.get("/api/deriv/signup", (req, res) => {
  try {
    const verifier =
      createCodeVerifier();

    const challenge =
      createCodeChallenge(
        verifier
      );

    const stateData =
      `${Date.now()}:${verifier}`;

    const signature =
      signState(stateData);

    const state =
      base64UrlEncode(
        Buffer.from(
          `${stateData}:${signature}`
        )
      );

    const callback =
      `${BASE_URL}/oauth/callback`;

    const params =
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: callback,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state
      });

    const authorizationUrl =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "PROTRADERS FX SIGNUP:",
      authorizationUrl
    );

    res.redirect(
      authorizationUrl
    );

  } catch (error) {
    console.error(
      "SIGNUP ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Unable to start signup"
    });
  }
});

/*
|--------------------------------------------------------------------------
| OAUTH CALLBACK
|--------------------------------------------------------------------------
*/

app.get("/oauth/callback", (req, res) => {
  const {
    code,
    error,
    error_description
  } = req.query;

  /*
  |--------------------------------------------------------------------------
  | DERIV RETURNED AN ERROR
  |--------------------------------------------------------------------------
  */

  if (error) {
    console.error(
      "OAUTH ERROR:",
      error,
      error_description || ""
    );

    return res.redirect(
      `/?oauth=error&message=${encodeURIComponent(
        error_description ||
        error
      )}`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NO CODE
  |--------------------------------------------------------------------------
  */

  if (!code) {
    return res.redirect(
      "/?oauth=failed"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SUCCESS
  |--------------------------------------------------------------------------
  |
  | For now we confirm that Deriv returned
  | an authorization code and send the
  | visitor back to the ProTraders FX home
  | page.
  |
  */

  console.log(
    "PROTRADERS FX OAUTH SUCCESS"
  );

  return res.redirect(
    "/?oauth=success"
  );
});

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
| FAVICON
|--------------------------------------------------------------------------
*/

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

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
      error: "Internal server error"
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
  app.listen(PORT, () => {
    console.log(
      `ProTraders FX running on port ${PORT}`
    );
  });
}
