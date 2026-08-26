```javascript
"use strict";

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();

/* =========================================================
   PROTRADERS FX
   SERVER + VERCEL + DERIV OAUTH
   ========================================================= */

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret-change-me";

const CALLBACK_URL =
  BASE_URL + "/oauth/callback";

const DERIV_AUTHORIZE_URL =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN_URL =
  "https://oauth.deriv.com/oauth2/token";

const ROOT = __dirname;


/* =========================================================
   BASIC SERVER SETUP
   ========================================================= */

app.set("trust proxy", 1);
app.disable("x-powered-by");

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
   HELPERS
   ========================================================= */

function base64url(value) {
  return Buffer
    .from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function hmac(value) {
  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(value)
    .digest("base64url");
}


function safeEqual(a, b) {
  try {
    const first = Buffer.from(a);
    const second = Buffer.from(b);

    if (first.length !== second.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      first,
      second
    );
  } catch {
    return false;
  }
}


/* =========================================================
   COOKIE HELPERS
   ========================================================= */

function getCookies(req) {
  const header =
    req.headers.cookie || "";

  const cookies = {};

  header
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");

      if (index === -1) {
        return;
      }

      const key =
        part
          .slice(0, index)
          .trim();

      const value =
        part
          .slice(index + 1)
          .trim();

      if (!key) {
        return;
      }

      try {
        cookies[key] =
          decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    });

  return cookies;
}


/* =========================================================
   SESSION COOKIE
   ========================================================= */

function createSessionCookie(res, data) {
  const payload = base64url(
    JSON.stringify({
      ...data,
      created_at: Date.now()
    })
  );

  const signature = hmac(payload);

  res.setHeader(
    "Set-Cookie",
    [
      "protraders_session=" +
        payload +
        "." +
        signature,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=604800"
    ].join("; ")
  );
}


function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    [
      "protraders_session=",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );
}


function readSession(req) {
  const cookies = getCookies(req);

  const raw =
    cookies.protraders_session;

  if (!raw) {
    return null;
  }

  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];

  if (
    !safeEqual(
      signature,
      hmac(payload)
    )
  ) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer
        .from(
          payload,
          "base64url"
        )
        .toString("utf8")
    );
  } catch {
    return null;
  }
}


/* =========================================================
   OAUTH STATE
   ========================================================= */

function createState() {
  return base64url(
    crypto.randomBytes(32)
  );
}


function createVerifier() {
  return base64url(
    crypto.randomBytes(32)
  );
}


function createChallenge(verifier) {
  return base64url(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}


function saveOAuthState(
  res,
  state,
  verifier
) {
  const payload = base64url(
    JSON.stringify({
      state,
      verifier,
      created_at: Date.now()
    })
  );

  const signature = hmac(payload);

  res.setHeader(
    "Set-Cookie",
    [
      "protraders_oauth=" +
        payload +
        "." +
        signature,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=600"
    ].join("; ")
  );
}


function clearOAuthState(res) {
  res.setHeader(
    "Set-Cookie",
    [
      "protraders_oauth=",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );
}


function readOAuthState(req) {
  const cookies = getCookies(req);

  const raw =
    cookies.protraders_oauth;

  if (!raw) {
    return null;
  }

  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];

  if (
    !safeEqual(
      signature,
      hmac(payload)
    )
  ) {
    return null;
  }

  try {
    const data =
      JSON.parse(
        Buffer
          .from(
            payload,
            "base64url"
          )
          .toString("utf8")
      );

    if (
      Date.now() -
        Number(data.created_at || 0)
        >
        10 * 60 * 1000
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}


/* =========================================================
   DERIV OAUTH URL
   ========================================================= */

function buildOAuth() {
  const state = createState();
  const verifier = createVerifier();
  const challenge =
    createChallenge(verifier);

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
      DERIV_AUTHORIZE_URL +
      "?" +
      params.toString()
  };
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      ok: true,
      service: "protraders-fx",
      time:
        new Date().toISOString(),
      oauthConfigured:
        Boolean(DERIV_CLIENT_ID),
      baseUrl:
        BASE_URL,
      callback:
        CALLBACK_URL
    });
  }
);


/* =========================================================
   CONFIG
   ========================================================= */

app.get(
  "/api/config",
  (req, res) => {
    res.status(200).json({
      ok: true,
      oauthConfigured:
        Boolean(DERIV_CLIENT_ID),
      baseUrl:
        BASE_URL,
      callback:
        CALLBACK_URL
    });
  }
);


/* =========================================================
   LOGIN
   ========================================================= */

app.get(
  "/api/deriv/login",
  (req, res) => {
    try {
      const oauth =
        buildOAuth();

      saveOAuthState(
        res,
        oauth.state,
        oauth.verifier
      );

      console.log(
        "PROTRADERS FX DERIV LOGIN"
      );

      console.log(
        "CLIENT ID:",
        DERIV_CLIENT_ID
      );

      console.log(
        "REDIRECT URI:",
        CALLBACK_URL
      );

      return res.redirect(
        302,
        oauth.url
      );
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res
        .status(500)
        .send(
          "Unable to start Deriv login."
        );
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
      const oauth =
        buildOAuth();

      saveOAuthState(
        res,
        oauth.state,
        oauth.verifier
      );

      return res.redirect(
        302,
        oauth.url
      );
    } catch (error) {
      console.error(
        "SIGNUP ERROR:",
        error
      );

      return res
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

    console.log(
      "PROTRADERS FX OAUTH CALLBACK"
    );

    const code =
      req.query.code;

    const returnedState =
      req.query.state;

    const oauthError =
      req.query.error;

    const description =
      req.query.error_description;


    /* -----------------------------------------
       OAUTH ERROR
       ----------------------------------------- */

    if (oauthError) {

      console.error(
        "DERIV OAUTH ERROR:",
        oauthError,
        description || ""
      );

      clearOAuthState(res);

      return res.redirect(
        302,
        "/?oauth_error=" +
          encodeURIComponent(
            oauthError
          )
      );
    }


    /* -----------------------------------------
       MISSING CODE / STATE
       ----------------------------------------- */

    if (
      !code ||
      !returnedState
    ) {

      console.error(
        "Missing authorization code or state."
      );

      clearOAuthState(res);

      return res
        .status(400)
        .send(
          authorizationFailedPage(
            "Missing authorization code or state."
          )
        );
    }


    /* -----------------------------------------
       READ STATE
       ----------------------------------------- */

    const oauth =
      readOAuthState(req);

    if (!oauth) {

      console.error(
        "OAuth state missing or expired."
      );

      clearOAuthState(res);

      return res
        .status(400)
        .send(
          authorizationFailedPage(
            "Authorization session expired."
          )
        );
    }


    /* -----------------------------------------
       VERIFY STATE
       ----------------------------------------- */

    if (
      oauth.state !==
      returnedState
    ) {

      console.error(
        "OAuth state mismatch."
      );

      clearOAuthState(res);

      return res
        .status(400)
        .send(
          authorizationFailedPage(
            "Authorization state mismatch."
          )
        );
    }


    /* -----------------------------------------
       TOKEN EXCHANGE
       ----------------------------------------- */

    try {

      const params =
        new URLSearchParams();

      params.set(
        "grant_type",
        "authorization_code"
      );

      params.set(
        "code",
        code
      );

      params.set(
        "client_id",
        DERIV_CLIENT_ID
      );

      params.set(
        "redirect_uri",
        CALLBACK_URL
      );

      params.set(
        "code_verifier",
        oauth.verifier
      );


      console.log(
        "PROTRADERS FX TOKEN EXCHANGE"
      );


      const response =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },
            body:
              params.toString()
          }
        );


      const raw =
        await response.text();

      let tokenData;

      try {
        tokenData =
          JSON.parse(raw);
      } catch {
        tokenData = {
          raw
        };
      }


      if (
        !response.ok ||
        tokenData.error
      ) {

        console.error(
          "TOKEN EXCHANGE FAILED:",
          tokenData
        );

        clearOAuthState(res);

        return res
          .status(400)
          .send(
            authorizationFailedPage(
              "Deriv authorization could not be completed."
            )
          );
      }


      /* -----------------------------------------
         CREATE LOGIN SESSION
         ----------------------------------------- */

      createSessionCookie(
        res,
        {
          authenticated: true,
          provider: "deriv",
          access_token:
            tokenData.access_token ||
            null,
          refresh_token:
            tokenData.refresh_token ||
            null,
          token_type:
            tokenData.token_type ||
            null,
          expires_in:
            tokenData.expires_in ||
            null
        }
      );


      clearOAuthState(res);


      console.log(
        "PROTRADERS FX LOGIN SUCCESSFUL"
      );


      return res.redirect(
        302,
        "/?login=success"
      );

    } catch (error) {

      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      clearOAuthState(res);

      return res
        .status(500)
        .send(
          authorizationFailedPage(
            "Unable to complete Deriv authorization."
          )
        );
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
      readSession(req);

    return res.status(200).json({
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

    clearSessionCookie(res);

    return res.redirect(
      302,
      "/"
    );
  }
);


/* =========================================================
   TRACK
   ========================================================= */

app.post(
  "/api/track",
  (req, res) => {

    return res.status(200).json({
      ok: true
    });
  }
);


/* =========================================================
   ANALYTICS
   ========================================================= */

app.get(
  "/api/analytics",
  (req, res) => {

    return res.status(200).json({
      ok: true,
      service:
        "protraders-fx",
      time:
        new Date().toISOString()
    });
  }
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
   FRONTEND FILES
   ========================================================= */

app.get(
  "/",
  (req, res) => {

    const file =
      path.join(
        ROOT,
        "index.html"
      );

    return res.sendFile(
      file,
      (error) => {

        if (
          error &&
          !res.headersSent
        ) {

          console.error(
            "INDEX ERROR:",
            error
          );

          res
            .status(404)
            .send(
              "ProTraders FX frontend not found."
            );
        }

      }
    );
  }
);


/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
  express.static(
    ROOT,
    {
      index: false,
      dotfiles: "ignore"
    }
  )
);


/* =========================================================
   404
   ========================================================= */

app.use(
  (req, res) => {

    return res
      .status(404)
      .json({
        ok: false,
        error: "NOT_FOUND",
        path: req.path
      });
  }
);


/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "PROTRADERS FX SERVER ERROR:",
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "INTERNAL_SERVER_ERROR"
      });
  }
);


/* =========================================================
   AUTHORIZATION ERROR PAGE
   ========================================================= */

function authorizationFailedPage(
  message
) {

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
<title>Authorization Failed</title>

<style>
*{
box-sizing:border-box;
}

html,
body{
margin:0;
width:100%;
min-height:100%;
background:#060a10;
color:#f4f7fb;
font-family:Arial,Helvetica,sans-serif;
}

body{
display:flex;
align-items:center;
justify-content:center;
padding:24px;
}

.card{
width:min(460px,100%);
padding:36px;
background:#0c121b;
border:1px solid #1e2938;
border-radius:12px;
text-align:center;
box-shadow:
0 20px 60px rgba(0,0,0,.45);
}

.logo{
font-size:13px;
font-weight:800;
letter-spacing:2px;
margin-bottom:26px;
}

h1{
font-size:24px;
margin:0 0 12px;
}

p{
color:#8e9aaa;
line-height:1.6;
margin:0;
}

a{
display:inline-block;
margin-top:26px;
padding:13px 24px;
border-radius:7px;
background:#16c784;
color:#06110c;
font-weight:800;
text-decoration:none;
}
</style>
</head>

<body>

<div class="card">

<div class="logo">
PROTRADERS FX
</div>

<h1>
Authorization Failed
</h1>

<p>
${escapeHtml(message)}
</p>

<a href="/api/deriv/login">
LOGIN AGAIN
</a>

</div>

</body>
</html>
`;
}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   VERCEL EXPORT
   ========================================================= */

module.exports = app;


/* =========================================================
   LOCAL SERVER
   ========================================================= */

if (
  require.main === module
) {

  const PORT =
    process.env.PORT || 3000;

  app.listen(
    PORT,
    () => {

      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        "LOCAL:",
        `http://localhost:${PORT}`
      );

      console.log(
        "BASE URL:",
        BASE_URL
      );

      console.log(
        "CALLBACK:",
        CALLBACK_URL
      );

    }
  );
}
```
