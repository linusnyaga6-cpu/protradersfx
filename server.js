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
  process.env.SESSION_SECRET || "protraders-fx-session-secret";

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
   STATIC WEBSITE FILES
========================================================= */

app.use(
  express.static(__dirname, {
    index: false,
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) {
        res.setHeader(
          "Content-Type",
          "application/javascript; charset=UTF-8"
        );
      }

      if (filePath.endsWith(".css")) {
        res.setHeader(
          "Content-Type",
          "text/css; charset=UTF-8"
        );
      }

      if (filePath.endsWith(".html")) {
        res.setHeader(
          "Content-Type",
          "text/html; charset=UTF-8"
        );
      }
    }
  })
);

/* =========================================================
   HOME PAGE
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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
    callback: `${BASE_URL}/oauth/callback`
  });
});

/* =========================================================
   TRACKING
========================================================= */

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

/* =========================================================
   ANALYTICS
========================================================= */

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    message: "Analytics endpoint is available"
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
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("hex");
}

/* =========================================================
   BUILD DERIV LOGIN URL
========================================================= */

function buildDerivAuthUrl() {
  const verifier = createCodeVerifier();

  const challenge =
    createCodeChallenge(verifier);

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
    const url =
      buildDerivAuthUrl();

    console.log(
      "PROTRADERS FX LOGIN REDIRECT:",
      url
    );

    res.redirect(302, url);

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
    const url =
      buildDerivAuthUrl();

    console.log(
      "PROTRADERS FX SIGNUP REDIRECT:",
      url
    );

    res.redirect(302, url);

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
    state,
    error,
    error_description
  } = req.query;

  console.log(
    "PROTRADERS FX OAUTH CALLBACK"
  );

  console.log(
    "OAuth code:",
    Boolean(code)
  );

  console.log(
    "OAuth state:",
    Boolean(state)
  );

  if (error) {
    console.error(
      "DERIV OAUTH ERROR:",
      error,
      error_description || ""
    );

    return res.redirect(
      302,
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
      302,
      "/?oauth=failed"
    );
  }

  /*
   * OAuth authorization succeeded.
   *
   * The authorization code is returned to the
   * ProTraders FX website.
   */

  return res.redirect(
    302,
    `/?oauth=success&code=${encodeURIComponent(
      String(code)
    )}`
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
   WEBSITE FALLBACK
========================================================= */

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path === "/oauth/callback"
  ) {
    return res.status(404).json({
      ok: false,
      error: "Not found",
      path: req.path
    });
  }

  res.sendFile(
    path.join(__dirname, "index.html"),
    (error) => {
      if (error) {
        next(error);
      }
    }
  );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error(
    "PROTRADERS FX SERVER ERROR:",
    err
  );

  res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

/* =========================================================
   VERCEL
========================================================= */

module.exports = app;

/* =========================================================
   LOCAL DEVELOPMENT
========================================================= */

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `ProTraders FX running on port ${PORT}`
    );
  });
}
