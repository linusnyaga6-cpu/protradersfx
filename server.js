```javascript
"use strict";

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();

/* =========================================================
   PROTRADERS FX SERVER
   VERCEL + DERIV OAUTH
   ========================================================= */

const BASE_URL =
  process.env.BASE_URL ||
  "https://www.protradersfx.com";

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "CHANGE_THIS_SESSION_SECRET";

const CALLBACK_URL =
  `${BASE_URL.replace(/\/$/, "")}/oauth/callback`;

const DERIV_AUTHORIZE_URL =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN_URL =
  "https://oauth.deriv.com/oauth2/token";

const ROOT =
  __dirname;


/* =========================================================
   VERCEL / EXPRESS
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
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);

    if (aa.length !== bb.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      aa,
      bb
    );
  } catch {
    return false;
  }
}


/* =========================================================
   COOKIE PARSER
   ========================================================= */

function getCookies(req) {
  const header =
    req.headers.cookie || "";

  const result = {};

  header
    .split(";")
    .forEach((part) => {

      const index =
        part.indexOf("=");

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

      result[key] =
        decodeURIComponent(value);

    });

  return result;
}


/* =========================================================
   SESSION
   ========================================================= */

function createSessionCookie(res, data) {

  const payload =
    base64url(
      JSON.stringify({
        ...data,
        created_at:
          Date.now()
      })
    );

  const signature =
    hmac(payload);

  const cookie =
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
    ].join("; ");

  res.setHeader(
    "Set-Cookie",
    cookie
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    "protraders_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );

}


function readSession(req) {

  const cookies =
    getCookies(req);

  const raw =
    cookies.protraders_session;

  if (!raw) {
    return null;
  }

  const pieces =
    raw.split(".");

  if (pieces.length !== 2) {
    return null;
  }

  const payload =
    pieces[0];

  const signature =
    pieces[1];

  const expected =
    hmac(payload);

  if (
    !safeEqual(
      signature,
      expected
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

    return data;

  } catch {

    return null;

  }
}


/* =========================================================
   OAUTH STATE
   ========================================================= */

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


function createState() {

  return base64url(
    crypto.randomBytes(32)
  );

}


/* =========================================================
   OAUTH COOKIE
   ========================================================= */

function saveOAuthState(
  res,
  state,
  verifier
) {

  const payload =
    base64url(
      JSON.stringify({
        state,
        verifier,
        created_at:
          Date.now()
      })
    );

  const signature =
    hmac(payload);

  const cookie =
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
    ].join("; ");

  res.setHeader(
    "Set-Cookie",
    cookie
  );

}


function clearOAuthState(res) {

  res.setHeader(
    "Set-Cookie",
    "protraders_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );

}


function readOAuthState(req) {

  const cookies =
    getCookies(req);

  const raw =
    cookies.protraders_oauth;

  if (!raw) {
    return null;
  }

  const pieces =
    raw.split(".");

  if (pieces.length !== 2) {
    return null;
  }

  const payload =
    pieces[0];

  const signature =
    pieces[1];

  const expected =
    hmac(payload);

  if (
    !safeEqual(
      signature,
      expected
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
   OAUTH URL
   ========================================================= */

function buildOAuthUrl() {

  const state =
    createState();

  const verifier =
    createVerifier();

  const challenge =
    createChallenge(
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
      `${DERIV_AUTHORIZE_URL}?${params.toString()}`
  };

}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  function (req, res) {

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
  function (req, res) {

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
  function (req, res) {

    try {

      const oauth =
        buildOAuthUrl();

      saveOAuthState(
        res,
        oauth.state,
        oauth.verifier
      );

      console.log(
        "PROTRADERS FX STARTING DERIV LOGIN"
      );

      console.log(
        "DERIV CALLBACK:",
        CALLBACK_URL
      );

      return res.redirect(
        302,
        oauth.url
      );

    } catch (error) {

      console.error(
        "DERIV LOGIN ERROR:",
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
  function (req, res) {

    try {

      const oauth =
        buildOAuthUrl();

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
        "DERIV SIGNUP ERROR:",
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
  async function (req, res) {

    const code =
      req.query.code;

    const returnedState =
      req.query.state;

    const oauthError =
      req.query.error;

    const errorDescription =
      req.query.error_description;


    console.log(
      "PROTRADERS FX OAUTH CALLBACK"
    );


    /* -----------------------------------------
       DERIV RETURNED AN ERROR
       ----------------------------------------- */

    if (oauthError) {

      console.error(
        "DERIV OAUTH ERROR:",
        oauthError,
        errorDescription || ""
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
       CODE / STATE REQUIRED
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
        .send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorization Failed</title>
<style>
html,body{
margin:0;
min-height:100%;
background:#070b12;
color:#fff;
font-family:Arial,sans-serif;
}
body{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
}
.box{
width:min(480px,90%);
padding:36px;
background:#0d141f;
border:1px solid #202c3b;
text-align:center;
}
a{
display:inline-block;
margin-top:20px;
padding:12px 22px;
background:#16c784;
color:#04140d;
font-weight:700;
text-decoration:none;
}
</style>
</head>
<body>
<div class="box">
<h2>Authorization Failed</h2>
<p>Missing authorization code or state.</p>
<a href="/api/deriv/login">TRY LOGIN AGAIN</a>
</div>
</body>
</html>
        `);

    }


    /* -----------------------------------------
       READ STORED OAUTH STATE
       ----------------------------------------- */

    const oauth =
      readOAuthState(req);


    if (!oauth) {

      console.error(
        "PROTRADERS FX OAUTH STATE MISSING OR EXPIRED"
      );

      clearOAuthState(res);

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
html,body{
margin:0;
min-height:100%;
background:#070b12;
color:#fff;
font-family:Arial,sans-serif;
}
body{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
}
.box{
width:min(480px,90%);
padding:36px;
background:#0d141f;
border:1px solid #202c3b;
text-align:center;
}
a{
display:inline-block;
margin-top:20px;
padding:12px 22px;
background:#16c784;
color:#04140d;
font-weight:700;
text-decoration:none;
}
</style>
</head>
<body>
<div class="box">
<h2>Authorization Failed</h2>
<p>Your authorization session expired.</p>
<a href="/api/deriv/login">LOGIN AGAIN</a>
</div>
</body>
</html>
        `);

    }


    /* -----------------------------------------
       VERIFY STATE
       ----------------------------------------- */

    if (
      oauth.state !==
      returnedState
    ) {

      console.error(
        "PROTRADERS FX OAUTH STATE MISMATCH"
      );

      clearOAuthState(res);

      return res
        .status(400)
        .send(
          "Authorization state mismatch."
        );

    }


    /* -----------------------------------------
       EXCHANGE CODE FOR TOKEN
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
        "PROTRADERS FX EXCHANGING DERIV CODE"
      );


      const response =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method:
              "POST",

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
          "DERIV TOKEN EXCHANGE FAILED:",
          tokenData
        );

        clearOAuthState(res);

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
html,body{
margin:0;
min-height:100%;
background:#070b12;
color:#fff;
font-family:Arial,sans-serif;
}
body{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
}
.box{
width:min(480px,90%);
padding:36px;
background:#0d141f;
border:1px solid #202c3b;
text-align:center;
}
a{
display:inline-block;
margin-top:20px;
padding:12px 22px;
background:#16c784;
color:#04140d;
font-weight:700;
text-decoration:none;
}
</style>
</head>
<body>
<div class="box">
<h2>Authorization Failed</h2>
<p>Deriv authorization could not be completed.</p>
<a href="/api/deriv/login">TRY AGAIN</a>
</div>
</body>
</html>
          `);

      }


      /* -----------------------------------------
         SAVE AUTHENTICATED SESSION
         ----------------------------------------- */

      createSessionCookie(
        res,
        {
          authenticated:
            true,

          provider:
            "deriv",

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
        "PROTRADERS FX DERIV LOGIN SUCCESSFUL"
      );


      /* -----------------------------------------
         RETURN TO PROTRADERS FX
         ----------------------------------------- */

      return res.redirect(
        302,
        "/"
      );

    } catch (error) {

      console.error(
        "PROTRADERS FX OAUTH CALLBACK ERROR:",
        error
      );

      clearOAuthState(res);

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
html,body{
margin:0;
min-height:100%;
background:#070b12;
color:#fff;
font-family:Arial,sans-serif;
}
body{
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
}
.box{
width:min(480px,90%);
padding:36px;
background:#0d141f;
border:1px solid #202c3b;
text-align:center;
}
a{
display:inline-block;
margin-top:20px;
padding:12px 22px;
background:#16c784;
color:#04140d;
font-weight:700;
text-decoration:none;
}
</style>
</head>
<body>
<div class="box">
<h2>Authorization Failed</h2>
<p>Unable to complete Deriv authorization.</p>
<a href="/api/deriv/login">LOGIN AGAIN</a>
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
  function (req, res) {

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
  function (req, res) {

    clearSessionCookie(res);

    return res.redirect(
      302,
      "/"
    );

  }
);


/* =========================================================
   TRACKING
   ========================================================= */

app.post(
  "/api/track",
  function (req, res) {

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
  function (req, res) {

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
  function (req, res) {

    return res
      .status(204)
      .end();

  }
);


/* =========================================================
   ROOT
   ========================================================= */

app.get(
  "/",
  function (req, res) {

    const indexFile =
      path.join(
        ROOT,
        "index.html"
      );

    return res.sendFile(
      indexFile,
      function (error) {

        if (error) {

          console.error(
            "INDEX.HTML ERROR:",
            error
          );

          if (!res.headersSent) {

            res
              .status(404)
              .send(
                "ProTraders FX frontend not found."
              );

          }

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
   KNOWN 404 RESPONSE
   ========================================================= */

app.use(
  function (req, res) {

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
  function (
    error,
    req,
    res,
    next
  ) {

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
   VERCEL EXPORT
   ========================================================= */

module.exports = app;


/* =========================================================
   LOCAL DEVELOPMENT ONLY
   ========================================================= */

if (
  require.main === module
) {

  const PORT =
    process.env.PORT || 3000;

  app.listen(
    PORT,
    function () {

      console.log(
        `PROTRADERS FX LOCAL SERVER: http://localhost:${PORT}`
      );

      console.log(
        `OAUTH CALLBACK: ${CALLBACK_URL}`
      );

    }
  );

}
```
