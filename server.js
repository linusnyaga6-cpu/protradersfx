"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const AFFILIATE_PARAM =
  process.env.DERIV_AFFILIATE_PARAM || "";

const DERIV_AUTHORIZE_URL =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_SIGNUP_URL =
  "https://oauth.deriv.com/oauth2/signup";

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| API CONFIG
|--------------------------------------------------------------------------
*/

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    baseUrl: BASE_URL,
    callback: CALLBACK_URL,
    oauthConfigured: Boolean(CLIENT_ID),
  });
});

/*
|--------------------------------------------------------------------------
| DERIV LOGIN
|--------------------------------------------------------------------------
*/

app.get("/api/deriv/login", (req, res) => {
  try {
    const state = crypto.randomBytes(24).toString("hex");

    const params = new URLSearchParams();

    params.set("app_id", CLIENT_ID);
    params.set("redirect_uri", CALLBACK_URL);
    params.set("state", state);

    if (AFFILIATE_PARAM) {
      params.set("affiliate_token", AFFILIATE_PARAM);
    }

    const loginUrl =
      `${DERIV_AUTHORIZE_URL}?${params.toString()}`;

    res.redirect(302, loginUrl);
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      ok: false,
      error: "Unable to start login",
    });
  }
});

/*
|--------------------------------------------------------------------------
| DERIV SIGN UP
|--------------------------------------------------------------------------
*/

app.get("/api/deriv/signup", (req, res) => {
  try {
    const params = new URLSearchParams();

    params.set("app_id", CLIENT_ID);
    params.set("redirect_uri", CALLBACK_URL);

    if (AFFILIATE_PARAM) {
      params.set("affiliate_token", AFFILIATE_PARAM);
    }

    const signupUrl =
      `${DERIV_SIGNUP_URL}?${params.toString()}`;

    res.redirect(302, signupUrl);
  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    res.status(500).json({
      ok: false,
      error: "Unable to start signup",
    });
  }
});

/*
|--------------------------------------------------------------------------
| OAUTH CALLBACK
|--------------------------------------------------------------------------
*/

app.get("/oauth/callback", (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const message =
      error_description ||
      error ||
      "OAuth authorization failed";

    return res.status(400).send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>ProTraders FX</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #05070b;
            color: #fff;
            font-family: Arial, sans-serif;
          }
          .box {
            max-width: 520px;
            padding: 35px;
            text-align: center;
          }
          h1 {
            margin-bottom: 12px;
          }
          p {
            color: #aeb6c4;
          }
          a {
            color: #fff;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Login Error</h1>
          <p>${escapeHtml(message)}</p>
          <p><a href="/">Return to ProTraders FX</a></p>
        </div>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>ProTraders FX</title>
      </head>
      <body>
        <h2>Authorization code missing</h2>
        <a href="/">Return to ProTraders FX</a>
      </body>
      </html>
    `);
  }

  /*
   * We deliberately do not exchange the OAuth code here yet.
   * The important part is that the Vercel function remains stable
   * and the callback endpoint is available.
   */

  res.redirect(
    302,
    `/?oauth=success&code=${encodeURIComponent(code)}`
  );
});

/*
|--------------------------------------------------------------------------
| TRACKING
|--------------------------------------------------------------------------
*/

app.post("/api/track", (req, res) => {
  res.status(200).json({
    ok: true,
  });
});

/*
|--------------------------------------------------------------------------
| ANALYTICS
|--------------------------------------------------------------------------
*/

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    visits: 0,
    message: "Analytics endpoint ready",
  });
});

/*
|--------------------------------------------------------------------------
| FAVICON
|--------------------------------------------------------------------------
*/

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

/*
|--------------------------------------------------------------------------
| STATIC FRONTEND
|--------------------------------------------------------------------------
*/

const publicPath = path.join(process.cwd(), "public");

app.use(express.static(publicPath));

/*
|--------------------------------------------------------------------------
| FRONTEND FALLBACK
|--------------------------------------------------------------------------
*/

app.get("*", (req, res) => {
  const indexPath = path.join(publicPath, "index.html");

  res.sendFile(indexPath, (error) => {
    if (error) {
      console.error("FRONTEND ERROR:", error);

      res.status(200).send(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport"
                content="width=device-width,initial-scale=1">
          <title>ProTraders FX</title>
          <style>
            body {
              margin: 0;
              background: #05070b;
              color: #fff;
              font-family: Arial, sans-serif;
              display: grid;
              place-items: center;
              min-height: 100vh;
            }
            .box {
              text-align: center;
              padding: 30px;
            }
            p {
              color: #9da6b5;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>PROTRADERS FX</h1>
            <p>Trading platform loading...</p>
          </div>
        </body>
        </html>
      `);
    }
  });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
});

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
|--------------------------------------------------------------------------
| VERCEL EXPORT
|--------------------------------------------------------------------------
*/

module.exports = app;
