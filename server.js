"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

/* =========================================================
   PROTRADERS FX
   SIMPLE VERCEL SERVER
   ========================================================= */

const PORT = process.env.PORT || 3000;

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-change-this-secret";

const CALLBACK_URL =
  BASE_URL + "/oauth/callback";

const DERIV_AUTHORIZE_URL =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN_URL =
  "https://oauth.deriv.com/oauth2/token";

const ROOT = __dirname;


/* =========================================================
   BASIC EXPRESS CONFIG
   ========================================================= */

app.disable("x-powered-by");

app.set("trust proxy", 1);

app.use(express.json({
  limit: "100kb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "100kb"
}));


/* =========================================================
   COOKIE HELPERS
   ========================================================= */

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  if (!header) {
    return cookies;
  }

  header.split(";").forEach(function (part) {
    const index = part.indexOf("=");

    if (index < 0) {
      return;
    }

    const name = part
      .slice(0, index)
      .trim();

    const value = part
      .slice(index + 1)
      .trim();

    if (!name) {
      return;
    }

    try {
      cookies[name] =
        decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  });

  return cookies;
}


function appendCookie(res, cookie) {
  const existing =
    res.getHeader("Set-Cookie");

  if (!existing) {
    res.setHeader(
      "Set-Cookie",
      [cookie]
    );
    return;
  }

  const list =
    Array.isArray(existing)
      ? existing
      : [existing];

  res.setHeader(
    "Set-Cookie",
    list.concat(cookie)
  );
}


function deleteCookie(res, name) {
  appendCookie(
    res,
    name +
      "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}


/* =========================================================
   CRYPTO HELPERS
   ========================================================= */

function base64url(input) {
  return Buffer
    .from(input)
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


function verifySignature(value, signature) {
  try {
    const expected =
      sign(value);

    const a =
      Buffer.from(signature);

    const b =
      Buffer.from(expected);

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      a,
      b
    );
  } catch {
    return false;
  }
}


/* =========================================================
   SESSION COOKIE
   ========================================================= */

function createSessionCookie(res, session) {
  const payload = base64url(
    JSON.stringify({
      authenticated: true,
      provider: "deriv",
      created_at: Date.now(),

      access_token:
        session.access_token || null,

      refresh_token:
        session.refresh_token || null,

      token_type:
        session.token_type || null,

      expires_in:
        session.expires_in || null
    })
  );

  const signature =
    sign(payload);

  appendCookie(
    res,
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


function readSession(req) {
  const cookies =
    parseCookies(req);

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

  if (
    !verifySignature(
      payload,
      signature
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

function randomState() {
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
      state: state,
      verifier: verifier,
      created_at: Date.now()
    })
  );

  const signature =
    sign(payload);

  appendCookie(
    res,
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


function readOAuthState(req) {
  const cookies =
    parseCookies(req);

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

  if (
    !verifySignature(
      payload,
      signature
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

    const created =
      Number(data.created_at || 0);

    if (
      !created ||
      Date.now() - created >
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

function createOAuth() {
  const state =
    randomState();

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
    state: state,
    verifier: verifier,

    url:
      DERIV_AUTHORIZE_URL +
      "?" +
      params.toString()
  };
}


/* =========================================================
   SIMPLE ERROR PAGE
   ========================================================= */

function errorPage(
  res,
  title,
  message,
  buttonText
) {
  const html =
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: #070b12;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
}

body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  width: min(460px, 100%);
  background: #0d141f;
  border: 1px solid #243044;
  padding: 36px;
  text-align: center;
  border-radius: 12px;
}

h1 {
  margin: 0 0 14px;
  font-size: 25px;
}

p {
  color: #9ca8b8;
  line-height: 1.6;
}

a {
  display: inline-block;
  margin-top: 20px;
  padding: 13px 22px;
  background: #16c784;
  color: #03130c;
  text-decoration: none;
  font-weight: 700;
  border-radius: 6px;
}
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
<p>${message}</p>
<a href="/api/deriv/login">${buttonText}</a>
</div>
</body>
</html>`;

  return res
    .status(400)
    .type("html")
    .send(html);
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  function (req, res) {
    return res
      .status(200)
      .json({
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
   API CONFIG
   ========================================================= */

app.get(
  "/api/config",
  function (req, res) {
    return res
      .status(200)
      .json({
        ok: true,
        oauthConfigured:
          Boolean(DERIV_CLIENT_ID),
        baseUrl: BASE_URL,
        callback: CALLBACK_URL
      });
  }
);


/* =========================================================
   DERIV LOGIN
   ========================================================= */

app.get(
  "/api/deriv/login",
  function (req, res) {
    try {
      const oauth =
        createOAuth();

      saveOAuthState(
        res,
        oauth.state,
        oauth.verifier
      );

      console.log(
        "PROTRADERS FX DERIV LOGIN"
      );

      console.log(
        "CALLBACK:",
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
   DERIV SIGNUP
   ========================================================= */

app.get(
  "/api/deriv/signup",
  function (req, res) {
    try {
      const oauth =
        createOAuth();

      saveOAuthState(
        res,
        oauth.state,
        oauth.verifier
      );

      console.log(
        "PROTRADERS FX DERIV SIGNUP"
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
  async function (req, res) {
    try {
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
         DERIV ERROR
         ----------------------------------------- */

      if (oauthError) {
        console.error(
          "DERIV OAUTH ERROR:",
          oauthError,
          errorDescription || ""
        );

        deleteCookie(
          res,
          "protraders_oauth"
        );

        return res.redirect(
          302,
          "/?oauth_error=" +
            encodeURIComponent(
              oauthError
            )
        );
      }


      /* -----------------------------------------
         REQUIRED VALUES
         ----------------------------------------- */

      if (
        !code ||
        !returnedState
      ) {
        console.error(
          "OAUTH CODE OR STATE MISSING"
        );

        deleteCookie(
          res,
          "protraders_oauth"
        );

        return errorPage(
          res,
          "Authorization Failed",
          "The authorization response was incomplete.",
          "TRY LOGIN AGAIN"
        );
      }


      /* -----------------------------------------
         STORED STATE
         ----------------------------------------- */

      const oauth =
        readOAuthState(req);

      if (!oauth) {
        console.error(
          "OAUTH STATE MISSING OR EXPIRED"
        );

        deleteCookie(
          res,
          "protraders_oauth"
        );

        return errorPage(
          res,
          "Authorization Failed",
          "Your authorization session expired. Please start again.",
          "LOGIN AGAIN"
        );
      }


      /* -----------------------------------------
         STATE CHECK
         ----------------------------------------- */

      if (
        oauth.state !==
        returnedState
      ) {
        console.error(
          "OAUTH STATE MISMATCH"
        );

        deleteCookie(
          res,
          "protraders_oauth"
        );

        return errorPage(
          res,
          "Authorization Failed",
          "The authorization state could not be verified.",
          "LOGIN AGAIN"
        );
      }


      /* -----------------------------------------
         TOKEN EXCHANGE
         ----------------------------------------- */

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
        "PROTRADERS FX EXCHANGING CODE"
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
          raw: raw
        };
      }


      if (
        !response.ok ||
        tokenData.error
      ) {
        console.error(
          "DERIV TOKEN ERROR:",
          tokenData
        );

        deleteCookie(
          res,
          "protraders_oauth"
        );

        return errorPage(
          res,
          "Authorization Failed",
          "Deriv authorization could not be completed.",
          "TRY AGAIN"
        );
      }


      /* -----------------------------------------
         CREATE SESSION
         ----------------------------------------- */

      createSessionCookie(
        res,
        {
          access_token:
            tokenData.access_token,

          refresh_token:
            tokenData.refresh_token,

          token_type:
            tokenData.token_type,

          expires_in:
            tokenData.expires_in
        }
      );


      /* IMPORTANT:
         This appends a second Set-Cookie
         instead of overwriting the session.
      */

      deleteCookie(
        res,
        "protraders_oauth"
      );


      console.log(
        "PROTRADERS FX DERIV LOGIN SUCCESSFUL"
      );


      return res.redirect(
        302,
        "/"
      );

    } catch (error) {
      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      deleteCookie(
        res,
        "protraders_oauth"
      );

      return res
        .status(500)
        .send(
          "Unable to complete Deriv authorization."
        );
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

    return res
      .status(200)
      .json({
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
    deleteCookie(
      res,
      "protraders_session"
    );

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
  function (req, res) {
    return res
      .status(200)
      .json({
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
    return res
      .status(200)
      .json({
        ok: true,
        service: "protraders-fx",
        time: new Date().toISOString()
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
   STATIC FRONTEND
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
   ROOT PAGE
   ========================================================= */

app.get(
  "/",
  function (req, res) {
    const indexPath =
      path.join(
        ROOT,
        "index.html"
      );

    return res.sendFile(
      indexPath,
      function (error) {
        if (error) {
          console.error(
            "INDEX.HTML ERROR:",
            error
          );

          if (!res.headersSent) {
            return res
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
   404
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

    if (res.headersSent) {
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
   LOCAL DEVELOPMENT
   ========================================================= */

if (
  require.main === module
) {
  app.listen(
    PORT,
    function () {
      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        "LOCAL:",
        "http://localhost:" + PORT
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
