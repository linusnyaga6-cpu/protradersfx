```javascript
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const CALLBACK_URL =
  BASE_URL + "/oauth/callback";

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const ROOT = __dirname;


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


function randomToken(bytes) {
  return base64url(
    crypto.randomBytes(bytes)
  );
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


function makeCookie(name, value, maxAge) {
  return (
    name +
    "=" +
    encodeURIComponent(value) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
    maxAge
  );
}


function clearCookie(name) {
  return (
    name +
    "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}


function parseCookies(req) {
  const result = {};
  const header = req.headers.cookie || "";

  header.split(";").forEach(function (item) {
    const index = item.indexOf("=");

    if (index === -1) {
      return;
    }

    const name = item
      .slice(0, index)
      .trim();

    const value = item
      .slice(index + 1)
      .trim();

    if (name) {
      try {
        result[name] =
          decodeURIComponent(value);
      } catch {
        result[name] = value;
      }
    }
  });

  return result;
}


function json(res, status, data) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.end(
    JSON.stringify(data)
  );
}


function redirect(res, location) {
  res.statusCode = 302;

  res.setHeader(
    "Location",
    location
  );

  res.end();
}


/* =========================================================
   OAUTH STATE
   ========================================================= */

function createOAuthState() {
  const verifier =
    randomToken(64);

  const state =
    randomToken(32);

  const payload =
    base64url(
      JSON.stringify({
        state: state,
        verifier: verifier,
        createdAt: Date.now()
      })
    );

  const signature =
    sign(payload);

  return {
    state: state,
    verifier: verifier,
    cookie:
      payload + "." + signature
  };
}


function readOAuthState(req) {
  const cookies =
    parseCookies(req);

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

  if (signature !== expected) {
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
      Number(data.createdAt || 0) >
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
   DERIV LOGIN
   ========================================================= */

function startLogin(req, res) {

  if (!CLIENT_ID) {
    return json(
      res,
      500,
      {
        ok: false,
        error:
          "DERIV_CLIENT_ID_NOT_CONFIGURED"
      }
    );
  }

  try {

    const oauth =
      createOAuthState();

    const challenge =
      base64url(
        crypto
          .createHash("sha256")
          .update(oauth.verifier)
          .digest()
      );

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
      CALLBACK_URL
    );

    params.set(
      "state",
      oauth.state
    );

    params.set(
      "code_challenge",
      challenge
    );

    params.set(
      "code_challenge_method",
      "S256"
    );

    res.setHeader(
      "Set-Cookie",
      makeCookie(
        "protraders_oauth",
        oauth.cookie,
        600
      )
    );

    console.log(
      "PROTRADERS FX: STARTING DERIV LOGIN"
    );

    console.log(
      "PROTRADERS FX CALLBACK:",
      CALLBACK_URL
    );

    return redirect(
      res,
      DERIV_AUTH_URL +
      "?" +
      params.toString()
    );

  } catch (error) {

    console.error(
      "DERIV LOGIN ERROR:",
      error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          "DERIV_LOGIN_FAILED"
      }
    );
  }
}


/* =========================================================
   OAUTH TOKEN EXCHANGE
   ========================================================= */

async function handleCallback(req, res) {

  const query =
    req.query || {};

  if (query.error) {

    res.setHeader(
      "Set-Cookie",
      clearCookie(
        "protraders_oauth"
      )
    );

    return redirect(
      res,
      "/?oauth_error=" +
      encodeURIComponent(
        String(query.error)
      )
    );
  }


  const code =
    query.code;

  const returnedState =
    query.state;

  if (
    !code ||
    !returnedState
  ) {

    return json(
      res,
      400,
      {
        ok: false,
        error:
          "MISSING_OAUTH_PARAMETERS"
      }
    );
  }


  const oauth =
    readOAuthState(req);

  if (!oauth) {

    return json(
      res,
      400,
      {
        ok: false,
        error:
          "OAUTH_SESSION_EXPIRED"
      }
    );
  }


  if (
    oauth.state !==
    String(returnedState)
  ) {

    return json(
      res,
      400,
      {
        ok: false,
        error:
          "OAUTH_STATE_MISMATCH"
      }
    );
  }


  try {

    const body =
      new URLSearchParams();

    body.set(
      "grant_type",
      "authorization_code"
    );

    body.set(
      "client_id",
      CLIENT_ID
    );

    body.set(
      "code",
      String(code)
    );

    body.set(
      "code_verifier",
      oauth.verifier
    );

    body.set(
      "redirect_uri",
      CALLBACK_URL
    );


    console.log(
      "PROTRADERS FX: EXCHANGING DERIV CODE"
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
            body.toString()
        }
      );


    const text =
      await response.text();

    let token;

    try {
      token =
        JSON.parse(text);
    } catch {
      token = {};
    }


    if (
      !response.ok ||
      !token.access_token
    ) {

      console.error(
        "DERIV TOKEN EXCHANGE FAILED:",
        response.status,
        token
      );

      res.setHeader(
        "Set-Cookie",
        clearCookie(
          "protraders_oauth"
        )
      );

      return redirect(
        res,
        "/?oauth_error=token_exchange_failed"
      );
    }


    /*
     * Store only a signed session marker.
     * The access token is NOT sent to the browser.
     */

    const sessionPayload =
      base64url(
        JSON.stringify({
          authenticated: true,
          provider: "deriv",
          createdAt: Date.now(),
          expiresIn:
            Number(
              token.expires_in || 3600
            )
        })
      );

    const session =
      sessionPayload +
      "." +
      sign(sessionPayload);


    res.setHeader(
      "Set-Cookie",
      [
        makeCookie(
          "protraders_session",
          session,
          Number(
            token.expires_in || 3600
          )
        ),

        clearCookie(
          "protraders_oauth"
        )
      ]
    );


    console.log(
      "PROTRADERS FX: DERIV LOGIN SUCCESSFUL"
    );


    return redirect(
      res,
      "/?trading=1"
    );

  } catch (error) {

    console.error(
      "OAUTH CALLBACK ERROR:",
      error
    );

    return redirect(
      res,
      "/?oauth_error=oauth_failed"
    );
  }
}


/* =========================================================
   AUTH STATUS
   ========================================================= */

function authStatus(req, res) {

  const cookies =
    parseCookies(req);

  const raw =
    cookies.protraders_session;

  if (!raw) {

    return json(
      res,
      200,
      {
        authenticated: false,
        provider: null
      }
    );
  }


  const parts =
    raw.split(".");

  if (parts.length !== 2) {

    return json(
      res,
      200,
      {
        authenticated: false,
        provider: null
      }
    );
  }


  const payload =
    parts[0];

  const signature =
    parts[1];


  if (
    sign(payload) !==
    signature
  ) {

    return json(
      res,
      200,
      {
        authenticated: false,
        provider: null
      }
    );
  }


  try {

    const session =
      JSON.parse(
        Buffer
          .from(
            payload,
            "base64url"
          )
          .toString("utf8")
      );

    return json(
      res,
      200,
      {
        authenticated:
          session.authenticated === true,

        provider:
          session.provider || null
      }
    );

  } catch {

    return json(
      res,
      200,
      {
        authenticated: false,
        provider: null
      }
    );
  }
}


/* =========================================================
   STATIC FILES
   ========================================================= */

function contentType(file) {

  const ext =
    path.extname(file)
      .toLowerCase();

  const types = {
    ".html":
      "text/html; charset=utf-8",

    ".js":
      "application/javascript; charset=utf-8",

    ".css":
      "text/css; charset=utf-8",

    ".json":
      "application/json; charset=utf-8",

    ".svg":
      "image/svg+xml",

    ".png":
      "image/png",

    ".jpg":
      "image/jpeg",

    ".jpeg":
      "image/jpeg",

    ".ico":
      "image/x-icon",

    ".webp":
      "image/webp"
  };

  return (
    types[ext] ||
    "application/octet-stream"
  );
}


function sendFile(res, file) {

  fs.readFile(
    file,
    function (error, data) {

      if (error) {

        console.error(
          "STATIC FILE ERROR:",
          file,
          error
        );

        return json(
          res,
          404,
          {
            ok: false,
            error:
              "FILE_NOT_FOUND"
          }
        );
      }


      res.statusCode = 200;

      res.setHeader(
        "Content-Type",
        contentType(file)
      );

      res.setHeader(
        "Cache-Control",
        "no-cache"
      );

      res.end(data);
    }
  );
}


/* =========================================================
   MAIN VERCEL HANDLER
   ========================================================= */

async function handler(req, res) {

  try {

    const url =
      new URL(
        req.url,
        BASE_URL
      );

    const pathname =
      url.pathname;

    req.query =
      Object.fromEntries(
        url.searchParams.entries()
      );


    /* -----------------------------------------
       HEALTH
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/health"
    ) {

      return json(
        res,
        200,
        {
          ok: true,
          service:
            "protraders-fx",
          time:
            new Date().toISOString(),
          oauthConfigured:
            Boolean(CLIENT_ID),
          baseUrl:
            BASE_URL,
          callback:
            CALLBACK_URL
        }
      );
    }


    /* -----------------------------------------
       CONFIG
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/config"
    ) {

      return json(
        res,
        200,
        {
          ok: true,
          oauthConfigured:
            Boolean(CLIENT_ID),
          baseUrl:
            BASE_URL,
          callback:
            CALLBACK_URL
        }
      );
    }


    /* -----------------------------------------
       AUTH STATUS
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/auth/status"
    ) {

      return authStatus(
        req,
        res
      );
    }


    if (
      req.method === "GET" &&
      pathname === "/api/session"
    ) {

      return authStatus(
        req,
        res
      );
    }


    /* -----------------------------------------
       LOGIN
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/deriv/login"
    ) {

      return startLogin(
        req,
        res
      );
    }


    /* -----------------------------------------
       SIGNUP
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/deriv/signup"
    ) {

      return startLogin(
        req,
        res
      );
    }


    /* -----------------------------------------
       LOGOUT
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/deriv/logout"
    ) {

      res.setHeader(
        "Set-Cookie",
        clearCookie(
          "protraders_session"
        )
      );

      return redirect(
        res,
        "/"
      );
    }


    /* -----------------------------------------
       OAUTH CALLBACK
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/oauth/callback"
    ) {

      return await handleCallback(
        req,
        res
      );
    }


    /* -----------------------------------------
       TRACKING
       ----------------------------------------- */

    if (
      req.method === "POST" &&
      pathname === "/api/track"
    ) {

      return json(
        res,
        200,
        {
          ok: true
        }
      );
    }


    /* -----------------------------------------
       ANALYTICS
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/api/analytics"
    ) {

      return json(
        res,
        200,
        {
          ok: true,
          service:
            "protraders-fx",
          time:
            new Date().toISOString()
        }
      );
    }


    /* -----------------------------------------
       FAVICON
       ----------------------------------------- */

    if (
      req.method === "GET" &&
      pathname === "/favicon.ico"
    ) {

      res.statusCode = 204;

      return res.end();
    }


    /* -----------------------------------------
       FRONTEND FILE
       ----------------------------------------- */

    let requested =
      pathname === "/"
        ? "index.html"
        : pathname.replace(
            /^\/+/,
            ""
          );


    requested =
      path.normalize(
        requested
      );


    if (
      requested === ".." ||
      requested.startsWith(
        ".." + path.sep
      )
    ) {

      return json(
        res,
        403,
        {
          ok: false,
          error:
            "FORBIDDEN"
        }
      );
    }


    const file =
      path.join(
        ROOT,
        requested
      );


    if (
      fs.existsSync(file) &&
      fs.statSync(file).isFile()
    ) {

      return sendFile(
        res,
        file
      );
    }


    /* -----------------------------------------
       UNKNOWN ROUTE
       ----------------------------------------- */

    return json(
      res,
      404,
      {
        ok: false,
        error:
          "NOT_FOUND",
        path:
          pathname
      }
    );

  } catch (error) {

    console.error(
      "PROTRADERS FX HANDLER ERROR:",
      error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          "INTERNAL_SERVER_ERROR"
      }
    );
  }
}


/* =========================================================
   VERCEL EXPORT
   ========================================================= */

module.exports = handler;


/* =========================================================
   LOCAL DEVELOPMENT
   ========================================================= */

if (
  require.main === module
) {

  const http =
    require("http");

  const PORT =
    Number(
      process.env.PORT || 3000
    );

  http
    .createServer(handler)
    .listen(
      PORT,
      function () {

        console.log(
          "PROTRADERS FX SERVER RUNNING"
        );

        console.log(
          "http://localhost:" +
          PORT
        );
      }
    );
}
```
