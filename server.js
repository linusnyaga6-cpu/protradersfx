```javascript
"use strict";

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL =
  process.env.BASE_URL ||
  "https://www.protradersfx.com";

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret-change-this";

const DERIV_AFFILIATE_PARAM =
  process.env.DERIV_AFFILIATE_PARAM || "";

const DERIV_AFFILIATE_TOKEN =
  process.env.DERIV_AFFILIATE_TOKEN || "";

const DERIV_AFFILIATE_ID =
  process.env.DERIV_AFFILIATE_ID || "";

const DERIV_CAMPAIGN =
  process.env.DERIV_CAMPAIGN || "";

const CALLBACK_URL =
  `${BASE_URL.replace(/\/$/, "")}/oauth/callback`;

const DERIV_OAUTH_URL =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN_URL =
  "https://oauth.deriv.com/oauth2/token";

const appRoot = path.join(__dirname);

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "100kb"
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);


/* =========================================================
   SIMPLE SESSION COOKIE HELPERS
   ========================================================= */

function base64url(value) {
  return Buffer
    .from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function sign(value) {
  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(value)
    .digest("base64url");
}


function setSession(res, data) {
  const payload = base64url(
    JSON.stringify({
      ...data,
      iat: Date.now()
    })
  );

  const signature = sign(payload);

  res.setHeader(
    "Set-Cookie",
    `protraders_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  );
}


function getCookies(req) {
  const header =
    req.headers.cookie || "";

  const cookies = {};

  header
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");

      if (index === -1) return;

      const key =
        part.slice(0, index).trim();

      const value =
        part.slice(index + 1).trim();

      cookies[key] = decodeURIComponent(value);
    });

  return cookies;
}


function getSession(req) {
  const cookies =
    getCookies(req);

  const raw =
    cookies.protraders_session;

  if (!raw) {
    return null;
  }

  const parts =
    raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload =
    parts[0];

  const signature =
    parts[1];

  const expected =
    sign(payload);

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(
        payload,
        "base64url"
      ).toString("utf8")
    );
  } catch {
    return null;
  }
}


/* =========================================================
   PKCE
   ========================================================= */

function createCodeVerifier() {
  return base64url(
    crypto.randomBytes(32)
  );
}


function createCodeChallenge(verifier) {
  return base64url(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}


/* =========================================================
   OAUTH STATE
   ========================================================= */

function createOAuthState() {
  return base64url(
    crypto.randomBytes(32)
  );
}


function setOAuthCookie(res, state, verifier) {
  const value = base64url(
    JSON.stringify({
      state,
      verifier,
      createdAt: Date.now()
    })
  );

  const signature =
    sign(value);

  res.setHeader(
    "Set-Cookie",
    [
      `protraders_oauth=${value}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    ]
  );
}


function clearOAuthCookie(res) {
  res.setHeader(
    "Set-Cookie",
    [
      "protraders_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ]
  );
}


function getOAuthCookie(req) {
  const cookies =
    getCookies(req);

  const raw =
    cookies.protraders_oauth;

  if (!raw) {
    return null;
  }

  const parts =
    raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload =
    parts[0];

  const signature =
    parts[1];

  const expected =
    sign(payload);

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const result =
      JSON.parse(
        Buffer.from(
          payload,
          "base64url"
        ).toString("utf8")
      );

    if (
      Date.now() -
        result.createdAt >
      10 * 60 * 1000
    ) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}


/* =========================================================
   OAUTH AUTHORIZATION URL
   ========================================================= */

function buildDerivAuthorizationUrl() {
  const state =
    createOAuthState();

  const verifier =
    createCodeVerifier();

  const challenge =
    createCodeChallenge(
      verifier
    );

  const params =
    new URLSearchParams();

  params.set(
    "client_id",
    DERIV_CLIENT_ID
  );

  params.set(
    "redirect_uri",
    CALLBACK_URL
  );

  params.set(
    "response_type",
    "code"
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

  return {
    state,
    verifier,
    url:
      `${DERIV_OAUTH_URL}?${params.toString()}`
  };
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      service: "protraders-fx",
      time: new Date().toISOString(),
      oauthConfigured:
        Boolean(DERIV_CLIENT_ID),
      baseUrl: BASE_URL,
      callback: CALLBACK_URL
    });
  }
);


/* =========================================================
   CONFIG
   ========================================================= */

app.get(
  "/api/config",
  (req, res) => {
    res.json({
      ok: true,
      baseUrl: BASE_URL,
      oauthConfigured:
        Boolean(DERIV_CLIENT_ID),
      callback:
        CALLBACK_URL
    });
  }
);


/* =========================================================
   DERIV LOGIN
   ========================================================= */

app.get(
  "/api/deriv/login",
  (req, res) => {
    try {
      const oauth =
        buildDerivAuthorizationUrl();

      setOAuthCookie(
        res,
        oauth.state,
        oauth.verifier
      );

      res.redirect(
        302,
        oauth.url
      );
    } catch (error) {
      console.error(
        "DERIV LOGIN ERROR:",
        error
      );

      res
        .status(500)
        .send(
          "Unable to start Deriv authorization."
        );
    }
  }
);


/* =========================================================
   DERIV SIGNUP
   ========================================================= */

app.get(
  "/api/deriv/signup",
  (req, res) => {
    try {
      const oauth =
        buildDerivAuthorizationUrl();

      setOAuthCookie(
        res,
        oauth.state,
        oauth.verifier
      );

      let signupUrl =
        oauth.url;

      /*
       * Keep signup on the same OAuth
       * authorization flow. Deriv handles
       * account creation from its side.
       */

      if (DERIV_AFFILIATE_PARAM &&
          DERIV_AFFILIATE_TOKEN) {

        const url =
          new URL(signupUrl);

        url.searchParams.set(
          DERIV_AFFILIATE_PARAM,
          DERIV_AFFILIATE_TOKEN
        );

        signupUrl =
          url.toString();
      }

      if (DERIV_AFFILIATE_ID) {
        const url =
          new URL(signupUrl);

        url.searchParams.set(
          "affiliate_id",
          DERIV_AFFILIATE_ID
        );

        signupUrl =
          url.toString();
      }

      if (DERIV_CAMPAIGN) {
        const url =
          new URL(signupUrl);

        url.searchParams.set(
          "campaign",
          DERIV_CAMPAIGN
        );

        signupUrl =
          url.toString();
      }

      res.redirect(
        302,
        signupUrl
      );
    } catch (error) {
      console.error(
        "DERIV SIGNUP ERROR:",
        error
      );

      res
        .status(500)
        .send(
          "Unable to start Deriv signup."
        );
    }
  }
);


/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

app.get(
  "/oauth/callback",
  async (req, res) => {

    const {
      code,
      state,
      error,
      error_description
    } = req.query;

    console.log(
      "PROTRADERS FX OAUTH CALLBACK"
    );

    if (error) {
      console.error(
        "DERIV OAUTH ERROR:",
        error,
        error_description || ""
      );

      clearOAuthCookie(res);

      return res.redirect(
        302,
        `/?oauth_error=${encodeURIComponent(
          error
        )}`
      );
    }

    if (!code || !state) {
      console.error(
        "Missing authorization code or state."
      );

      clearOAuthCookie(res);

      return res
        .status(400)
        .send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Authorization Failed</title>
            <style>
              body {
                margin:0;
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#070b12;
                color:#fff;
                font-family:Arial,sans-serif;
              }
              .box {
                width:min(500px,90%);
                padding:35px;
                border:1px solid #1d2735;
                background:#0c121c;
                text-align:center;
              }
              a {
                display:inline-block;
                margin-top:20px;
                padding:12px 18px;
                background:#16c784;
                color:#03130c;
                text-decoration:none;
                font-weight:700;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Authorization Failed</h2>
              <p>Missing authorization code or state.</p>
              <a href="/">RETURN TO PROTRADERS FX</a>
            </div>
          </body>
          </html>
        `);
    }

    const oauth =
      getOAuthCookie(req);

    if (!oauth) {
      console.error(
        "PROTRADERS FX OAUTH STATE COOKIE MISSING"
      );

      return res
        .status(400)
        .send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Authorization Failed</title>
            <style>
              body {
                margin:0;
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#070b12;
                color:#fff;
                font-family:Arial,sans-serif;
              }
              .box {
                width:min(500px,90%);
                padding:35px;
                border:1px solid #1d2735;
                background:#0c121c;
                text-align:center;
              }
              a {
                display:inline-block;
                margin-top:20px;
                padding:12px 18px;
                background:#16c784;
                color:#03130c;
                text-decoration:none;
                font-weight:700;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Authorization Failed</h2>
              <p>Your authorization session expired or is invalid.</p>
              <a href="/api/deriv/login">TRY LOGIN AGAIN</a>
            </div>
          </body>
          </html>
        `);
    }

    if (oauth.state !== state) {
      console.error(
        "PROTRADERS FX OAUTH STATE MISMATCH"
      );

      clearOAuthCookie(res);

      return res
        .status(400)
        .send(
          "Authorization state mismatch."
        );
    }

    try {

      const tokenParams =
        new URLSearchParams();

      tokenParams.set(
        "grant_type",
        "authorization_code"
      );

      tokenParams.set(
        "code",
        code
      );

      tokenParams.set(
        "client_id",
        DERIV_CLIENT_ID
      );

      tokenParams.set(
        "redirect_uri",
        CALLBACK_URL
      );

      tokenParams.set(
        "code_verifier",
        oauth.verifier
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
              tokenParams.toString()
          }
        );

      const tokenText =
        await tokenResponse.text();

      let tokenData;

      try {
        tokenData =
          JSON.parse(tokenText);
      } catch {
        tokenData = {
          raw: tokenText
        };
      }

      if (
        !tokenResponse.ok ||
        tokenData.error
      ) {
        console.error(
          "DERIV TOKEN ERROR:",
          tokenData
        );

        clearOAuthCookie(res);

        return res
          .status(400)
          .send(`
            <!doctype html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Authorization Failed</title>
              <style>
                body {
                  margin:0;
                  min-height:100vh;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  background:#070b12;
                  color:#fff;
                  font-family:Arial,sans-serif;
                }
                .box {
                  width:min(520px,90%);
                  padding:35px;
                  border:1px solid #1d2735;
                  background:#0c121c;
                  text-align:center;
                }
                a {
                  display:inline-block;
                  margin-top:20px;
                  padding:12px 18px;
                  background:#16c784;
                  color:#03130c;
                  text-decoration:none;
                  font-weight:700;
                }
              </style>
            </head>
            <body>
              <div class="box">
                <h2>Authorization Failed</h2>
                <p>Deriv authorization could not be completed.</p>
                <a href="/api/deriv/login">TRY LOGIN AGAIN</a>
              </div>
            </body>
            </html>
          `);
      }

      /*
       * Store the OAuth result in the signed
       * server session cookie.
       *
       * The access token itself is NOT exposed
       * in the URL.
       */

      setSession(
        res,
        {
          authenticated: true,
          provider: "deriv",
          access_token:
            tokenData.access_token || null,
          refresh_token:
            tokenData.refresh_token || null,
          token_type:
            tokenData.token_type || null,
          expires_in:
            tokenData.expires_in || null
        }
      );

      clearOAuthCookie(res);

      console.log(
        "PROTRADERS FX DERIV AUTHORIZATION SUCCESSFUL"
      );

      /*
       * IMPORTANT:
       * Send the user straight back to the
       * ProTraders FX terminal.
       */

      return res.redirect(
        302,
        "/"
      );

    } catch (error) {

      console.error(
        "PROTRADERS FX CALLBACK ERROR:",
        error
      );

      clearOAuthCookie(res);

      return res
        .status(500)
        .send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Authorization Failed</title>
            <style>
              body {
                margin:0;
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#070b12;
                color:#fff;
                font-family:Arial,sans-serif;
              }
              .box {
                width:min(520px,90%);
                padding:35px;
                border:1px solid #1d2735;
                background:#0c121c;
                text-align:center;
              }
              a {
                display:inline-block;
                margin-top:20px;
                padding:12px 18px;
                background:#16c784;
                color:#03130c;
                text-decoration:none;
                font-weight:700;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Authorization Failed</h2>
              <p>Unable to complete Deriv authorization.</p>
              <a href="/api/deriv/login">TRY LOGIN AGAIN</a>
            </div>
          </body>
          </html>
        `);
    }
  }
);


/* =========================================================
   AUTH STATUS
   ========================================================= */

app.get(
  "/api/auth/status",
  (req, res) => {

    const session =
      getSession(req);

    res.json({
      authenticated:
        Boolean(
          session &&
          session.authenticated
        ),
      provider:
        session
          ? session.provider
          : null
    });
  }
);


/* =========================================================
   LOGOUT
   ========================================================= */

app.get(
  "/api/deriv/logout",
  (req, res) => {

    res.setHeader(
      "Set-Cookie",
      [
        "protraders_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      ]
    );

    res.redirect(
      302,
      "/"
    );
  }
);


/* =========================================================
   BASIC ANALYTICS ENDPOINTS
   ========================================================= */

app.post(
  "/api/track",
  (req, res) => {

    res.json({
      ok: true
    });
  }
);


app.get(
  "/api/analytics",
  (req, res) => {

    res.json({
      ok: true,
      service: "protraders-fx",
      time: new Date().toISOString()
    });
  }
);


/* =========================================================
   STATIC FRONTEND
   ========================================================= */

app.use(
  express.static(
    appRoot,
    {
      index: "index.html",
      extensions: ["html"]
    }
  )
);


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
   HOME FALLBACK
   ========================================================= */

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        appRoot,
        "index.html"
      )
    );
  }
);


/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      "PROTRADERS FX SERVER ERROR:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res
      .status(500)
      .json({
        ok: false,
        error: "Internal server error"
      });
  }
);


/* =========================================================
   START
   ========================================================= */

if (require.main === module) {

  app.listen(
    PORT,
    () => {

      console.log(
        `PROTRADERS FX SERVER RUNNING ON PORT ${PORT}`
      );

      console.log(
        `BASE URL: ${BASE_URL}`
      );

      console.log(
        `OAUTH CALLBACK: ${CALLBACK_URL}`
      );

    }
  );
}


module.exports = app;
```
