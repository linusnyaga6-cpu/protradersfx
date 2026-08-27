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
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const PORT =
  process.env.PORT || 3000;

const ROOT = __dirname;

/* =========================================================
   SECURITY
========================================================= */

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

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static(ROOT, {
    index: false
  })
);

/* =========================================================
   EXPLICIT FILES
========================================================= */

app.get("/app.js", (req, res) => {
  res.type("application/javascript");

  res.sendFile(
    path.join(ROOT, "app.js")
  );
});

app.get("/style.css", (req, res) => {
  res.type("text/css");

  res.sendFile(
    path.join(ROOT, "style.css")
  );
});

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
   TRACKING
========================================================= */

app.get("/api/track", (req, res) => {
  res.json({
    ok: true
  });
});

app.post("/api/track", (req, res) => {
  res.json({
    ok: true
  });
});

/* =========================================================
   ANALYTICS
========================================================= */

app.get("/api/analytics", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx"
  });
});

/* =========================================================
   PKCE
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
    crypto.randomBytes(64)
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

function buildOAuthUrl() {

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

  const redirectUri =
    `${BASE_URL}/oauth/callback`;

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
    redirectUri
  );

  /*
   * IMPORTANT:
   * Deriv requires scope.
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

  return (
    "https://auth.deriv.com/oauth2/auth?" +
    params.toString()
  );
}

/* =========================================================
   LOGIN
========================================================= */

app.get(
  "/api/deriv/login",
  (req, res) => {

    try {

      const url =
        buildOAuthUrl();

      console.log(
        "PROTRADERS FX OAUTH LOGIN"
      );

      console.log(
        url
      );

      res.redirect(url);

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to start login"
      });
    }
  }
);

/* =========================================================
   SIGNUP
========================================================= */

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

      const redirectUri =
        `${BASE_URL}/oauth/callback`;

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
        redirectUri
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

      /*
       * Required by Deriv for signup.
       */

      params.set(
        "prompt",
        "registration"
      );

      const url =
        "https://auth.deriv.com/oauth2/auth?" +
        params.toString();

      console.log(
        "PROTRADERS FX OAUTH SIGNUP"
      );

      console.log(url);

      res.redirect(url);

    } catch (error) {

      console.error(
        "SIGNUP ERROR:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          "Unable to start signup"
      });
    }
  }
);

/* =========================================================
   OAUTH CALLBACK
========================================================= */

app.get(
  "/oauth/callback",
  (req, res) => {

    const {
      code,
      state,
      error,
      error_description
    } = req.query;

    console.log(
      "OAUTH CALLBACK RECEIVED"
    );

    /*
     * Deriv returned an error.
     */

    if (error) {

      console.error(
        "DERIV OAUTH ERROR:",
        error,
        error_description || ""
      );

      return res.redirect(
        "/?oauth=error&message=" +
        encodeURIComponent(
          error_description ||
          error
        )
      );
    }

    /*
     * No authorization code.
     */

    if (!code) {

      return res.redirect(
        "/?oauth=failed"
      );
    }

    /*
     * We have successfully returned
     * from Deriv.
     */

    console.log(
      "DERIV AUTHORIZATION CODE RECEIVED"
    );

    /*
     * For the moment return to the
     * ProTraders FX website.
     */

    return res.redirect(
      "/?oauth=success"
    );
  }
);

/* =========================================================
   API ROOT
========================================================= */

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx"
  });
});

/* =========================================================
   FAVICON
========================================================= */

app.get(
  "/favicon.ico",
  (req, res) => {
    res.status(204).end();
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({
      ok: false,
      error: "Not found",
      path: req.path
    });
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

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

/* =========================================================
   VERCEL
========================================================= */

module.exports = app;

/* =========================================================
   LOCAL
========================================================= */

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
