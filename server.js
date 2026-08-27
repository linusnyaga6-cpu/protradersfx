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

/* =========================================================
   SECURITY
========================================================= */

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  next();
});

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static(ROOT, {
    index: false
  })
);

/* =========================================================
   EXPLICIT APP.JS
========================================================= */

app.get("/app.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(
    path.join(ROOT, "app.js")
  );
});

/* =========================================================
   EXPLICIT STYLE.CSS
========================================================= */

app.get("/style.css", (req, res) => {
  res.type("text/css");
  res.sendFile(
    path.join(ROOT, "style.css")
  );
});

/* =========================================================
   EXPLICIT TRACKER.JS
========================================================= */

app.get("/tracker.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(
    path.join(ROOT, "tracker.js")
  );
});

/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(ROOT, "index.html")
  );
});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    baseUrl: BASE_URL,
    oauthConfigured: Boolean(CLIENT_ID),
    callback:
      `${BASE_URL}/oauth/callback`
  });
});

/* =========================================================
   TRACK
========================================================= */

app.get("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

app.post("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

/* =========================================================
   ANALYTICS
========================================================= */

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});

/* =========================================================
   OAUTH HELPERS
========================================================= */

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

/* =========================================================
   OAUTH URL
========================================================= */

function createOAuthUrl() {
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

  return (
    "https://oauth.deriv.com/oauth2/authorize?" +
    params.toString()
  );
}

/* =========================================================
   LOGIN
========================================================= */

app.get("/api/deriv/login", (req, res) => {
  try {
    res.redirect(
      createOAuthUrl()
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

/* =========================================================
   SIGNUP
========================================================= */

app.get("/api/deriv/signup", (req, res) => {
  try {
    res.redirect(
      createOAuthUrl()
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

/* =========================================================
   OAUTH CALLBACK
========================================================= */

app.get("/oauth/callback", (req, res) => {
  const {
    code,
    error,
    error_description
  } = req.query;

  if (error) {
    return res.redirect(
      "/?oauth=error&message=" +
      encodeURIComponent(
        error_description || error
      )
    );
  }

  if (!code) {
    return res.redirect(
      "/?oauth=failed"
    );
  }

  return res.redirect(
    "/?oauth=success"
  );
});

/* =========================================================
   API ROOT
========================================================= */

app.get("/api", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});

/* =========================================================
   FAVICON
========================================================= */

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path
  });
});

/* =========================================================
   ERROR
========================================================= */

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

/* =========================================================
   VERCEL
========================================================= */

module.exports = app;

/* =========================================================
   LOCAL
========================================================= */

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `ProTraders FX running on port ${PORT}`
    );
  });
}
