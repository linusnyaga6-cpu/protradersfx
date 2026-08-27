"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

const BASE_URL =
  process.env.BASE_URL || "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================================
   SECURITY
================================ */

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  next();
});

/* ================================
   STATIC FILES
================================ */

app.use(
  express.static(__dirname, {
    index: false
  })
);

/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/* ================================
   HEALTH
================================ */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

/* ================================
   CONFIG
================================ */

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    baseUrl: BASE_URL,
    oauthConfigured: Boolean(CLIENT_ID),
    callback:
      `${BASE_URL}/oauth/callback`
  });
});

/* ================================
   TRACK
================================ */

app.get("/api/track", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/track", (req, res) => {
  res.json({ ok: true });
});

/* ================================
   ANALYTICS
================================ */

app.get("/api/analytics", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx"
  });
});

/* ================================
   OAUTH HELPERS
================================ */

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

function createState(verifier) {
  const data =
    `${Date.now()}:${verifier}`;

  const signature =
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(data)
      .digest("hex");

  return base64UrlEncode(
    Buffer.from(
      `${data}:${signature}`
    )
  );
}

/* ================================
   DERIV OAUTH
================================ */

function derivLogin(req, res) {
  try {
    const verifier =
      createCodeVerifier();

    const challenge =
      createCodeChallenge(
        verifier
      );

    const state =
      createState(verifier);

    const callback =
      `${BASE_URL}/oauth/callback`;

    const params =
      new URLSearchParams();

    params.set(
      "client_id",
      CLIENT_ID
    );

    params.set(
      "redirect_uri",
      callback
    );

    params.set(
      "response_type",
      "code"
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
     * Explicitly request the scopes
     * enabled in the Deriv application.
     */
    params.set(
      "scope",
      "trade account_manage"
    );

    params.set(
      "state",
      state
    );

    const url =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH URL:",
      url
    );

    res.redirect(302, url);

  } catch (error) {
    console.error(
      "OAUTH START ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Unable to start OAuth"
    });
  }
}

/* ================================
   LOGIN
================================ */

app.get(
  "/api/deriv/login",
  derivLogin
);

/* ================================
   SIGNUP
================================ */

app.get(
  "/api/deriv/signup",
  derivLogin
);

/* ================================
   CALLBACK
================================ */

app.get(
  "/oauth/callback",
  (req, res) => {

    const {
      code,
      error,
      error_description
    } = req.query;

    console.log(
      "PROTRADERS FX CALLBACK"
    );

    if (error) {
      console.error(
        "DERIV ERROR:",
        error,
        error_description || ""
      );

      return res.redirect(
        `/?oauth=error&message=${encodeURIComponent(
          String(
            error_description ||
            error
          )
        )}`
      );
    }

    if (!code) {
      return res.redirect(
        "/?oauth=failed"
      );
    }

    /*
     * Authorization succeeded.
     *
     * The authorization code is now
     * returned to ProTraders FX.
     */

    return res.redirect(
      `/?oauth=success&code=${encodeURIComponent(
        String(code)
      )}`
    );
  }
);

/* ================================
   API ROOT
================================ */

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx"
  });
});

/* ================================
   FAVICON
================================ */

app.get(
  "/favicon.ico",
  (req, res) => {
    res.status(204).end();
  }
);

/* ================================
   404
================================ */

app.use(
  (req, res) => {
    res.status(404).json({
      ok: false,
      error: "Not found",
      path: req.path
    });
  }
);

/* ================================
   ERROR
================================ */

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

/* ================================
   VERCEL
================================ */

module.exports = app;

/* ================================
   LOCAL
================================ */

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
