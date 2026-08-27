```javascript
"use strict";

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-change-this-secret";

const CALLBACK_URL =
  BASE_URL + "/oauth/callback";

const DERIV_AUTHORIZE =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN =
  "https://oauth.deriv.com/oauth2/token";

const ROOT = __dirname;


/* =========================================================
   BASIC EXPRESS SETUP
   ========================================================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));


/* =========================================================
   HELPERS
   ========================================================= */

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}


function makeToken(length = 32) {
  return base64url(
    crypto.randomBytes(length)
  );
}


function safeEqual(a, b) {
  if (!a || !b) {
    return false;
  }

  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}


function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  header.split(";").forEach((part) => {
    const index = part.indexOf("=");

    if (index < 0) {
      return;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!key) {
      return;
    }

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  });

  return cookies;
}


function signedCookieValue(data) {
  const payload = base64url(
    JSON.stringify(data)
  );

  return payload + "." + sign(payload);
}


function readSignedCookie(req, name) {
  const cookies = parseCookies(req);
  const raw = cookies[name];

  if (!raw) {
    return null;
  }

  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];

  const expected = sign(payload);

  if (!safeEqual(signature, expected)) {
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


function cookie(name, value, maxAge) {
  return [
    name + "=" + value,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ].join("; ");
}


function deleteCookie(name) {
  return [
    name + "=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}


/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString(),
    oauthConfigured: Boolean(CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });
});


/* =========================================================
   CONFIG
   ========================================================= */

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    oauthConfigured: Boolean(CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });
});


/* =========================================================
   CREATE OAUTH REQUEST
   ========================================================= */

function createOAuthRequest() {
  const state = makeToken(32);
  const verifier = makeToken(32);

  const challenge = base64url(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );

  const params = new URLSearchParams();

  params.set("client_id", CLIENT_ID);
  params.set("redirect_uri", CALLBACK_URL);
  params.set("response_type", "code");
  params.set("state", state);
  params.set("code_challenge", challenge);
  params.set("code_challenge_method", "S256");

  return {
    state,
    verifier,
    url:
      DERIV_AUTHORIZE +
      "?" +
      params.toString()
  };
}


/* =========================================================
   DERIV LOGIN
   ========================================================= */

function startDerivLogin(req, res) {
  try {
    const oauth = createOAuthRequest();

    const stateCookie = signedCookieValue({
      state: oauth.state,
      verifier: oauth.verifier,
      createdAt: Date.now()
    });

    res.setHeader(
      "Set-Cookie",
      cookie(
        "protraders_oauth",
        stateCookie,
        600
      )
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
      "DERIV LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "DERIV_LOGIN_FAILED"
    });
  }
}


app.get(
  "/api/deriv/login",
  startDerivLogin
);


app.get(
  "/api/deriv/signup",
  startDerivLogin
);


/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

app.get(
  "/oauth/callback",
  async (req, res) => {

    try {

      const error =
        req.query.error;

      const code =
        req.query.code;

      const returnedState =
        req.query.state;


      /* -----------------------------------------
         DERIV ERROR
         ----------------------------------------- */

      if (error) {

        console.error(
          "DERIV OAUTH ERROR:",
          error,
          req.query.error_description || ""
        );

        res.setHeader(
          "Set-Cookie",
          deleteCookie(
            "protraders_oauth"
          )
        );

        return res.redirect(
          302,
          "/?oauth_error=" +
          encodeURIComponent(error)
        );
      }


      /* -----------------------------------------
         REQUIRED PARAMETERS
         ----------------------------------------- */

      if (
        !code ||
        !returnedState
      ) {

        return res.status(400).send(
          "Missing authorization code or state."
        );
      }


      /* -----------------------------------------
         READ OAUTH COOKIE
         ----------------------------------------- */

      const oauth =
        readSignedCookie(
          req,
          "protraders_oauth"
        );


      if (!oauth) {

        console.error(
          "OAUTH COOKIE MISSING"
        );

        return res.status(400).send(
          "Authorization session expired. Please log in again."
        );
      }


      /* -----------------------------------------
         CHECK EXPIRATION
         ----------------------------------------- */

      const age =
        Date.now() -
        Number(
          oauth.createdAt || 0
        );

      if (
        age >
        10 * 60 * 1000
      ) {

        res.setHeader(
          "Set-Cookie",
          deleteCookie(
            "protraders_oauth"
          )
        );

        return res.status(400).send(
          "Authorization session expired. Please log in again."
        );
      }


      /* -----------------------------------------
         CHECK STATE
         ----------------------------------------- */

      if (
        oauth.state !==
        returnedState
      ) {

        console.error(
          "OAUTH STATE MISMATCH"
        );

        return res.status(400).send(
          "Authorization state mismatch."
        );
      }


      /* -----------------------------------------
         EXCHANGE CODE
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
        CLIENT_ID
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
          DERIV_TOKEN,
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


      const text =
        await response.text();

      let tokenData;

      try {
        tokenData =
          JSON.parse(text);
      } catch {
        tokenData = {};
      }


      if (
        !response.ok ||
        tokenData.error
      ) {

        console.error(
          "DERIV TOKEN ERROR:",
          tokenData
        );

        res.setHeader(
          "Set-Cookie",
          deleteCookie(
            "protraders_oauth"
          )
        );

        return res.redirect(
          302,
          "/?oauth_error=token_exchange_failed"
        );
      }


      /* -----------------------------------------
         AUTHENTICATED SESSION
         ----------------------------------------- */

      const session =
        signedCookieValue({
          authenticated: true,
          provider: "deriv",
          createdAt: Date.now(),
          expiresIn:
            tokenData.expires_in || null
        });


      /*
       * IMPORTANT:
       * Set both cookies together.
       * Do NOT call setHeader twice because
       * the second call would erase the first.
       */

      res.setHeader(
        "Set-Cookie",
        [
          cookie(
            "protraders_session",
            session,
            604800
          ),

          deleteCookie(
            "protraders_oauth"
          )
        ]
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

      return res.status(500).json({
        ok: false,
        error: "OAUTH_CALLBACK_FAILED"
      });
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
      readSignedCookie(
        req,
        "protraders_session"
      );

    res.status(200).json({
      authenticated:
        Boolean(
          session &&
          session.authenticated === true
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
      deleteCookie(
        "protraders_session"
      )
    );

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
  (req, res) => {

    return res.status(204).end();
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
   FRONTEND
   ========================================================= */

app.get(
  "/",
  (req, res) => {

    return res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );
  }
);


/* =========================================================
   404
   ========================================================= */

app.use(
  (req, res) => {

    return res.status(404).json({
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
  (error, req, res, next) => {

    console.error(
      "PROTRADERS FX ERROR:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
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

if (require.main === module) {

  app.listen(
    PORT,
    () => {

      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        "PORT:",
        PORT
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
