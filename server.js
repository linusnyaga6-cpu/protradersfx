"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

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

app.disable("x-powered-by");

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

/* =========================================================
   HELPERS
   ========================================================= */

function encode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function randomString() {
  return encode(crypto.randomBytes(32));
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";

  header.split(";").forEach(function (item) {
    const index = item.indexOf("=");

    if (index === -1) {
      return;
    }

    const name = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  });

  return cookies;
}

function makeCookie(name, value, maxAge) {
  return [
    name + "=" + encodeURIComponent(value),
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ].join("; ");
}

function makeSignedValue(data) {
  const payload = encode(JSON.stringify(data));
  const signature = sign(payload);

  return payload + "." + signature;
}

function readSignedValue(value) {
  if (!value) {
    return null;
  }

  const parts = value.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return null;
  }

  try {
    if (!crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    return JSON.parse(decode(payload));
  } catch {
    return null;
  }
}

/* =========================================================
   HTML ERROR PAGE
   ========================================================= */

function errorPage(title, message, buttonText, buttonUrl) {
  return (
    "<!doctype html>" +
    "<html>" +
    "<head>" +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>" + title + "</title>" +
    "<style>" +
    "html,body{margin:0;min-height:100%;background:#070b12;color:#fff;font-family:Arial,sans-serif}" +
    "body{min-height:100vh;display:flex;align-items:center;justify-content:center}" +
    ".box{width:min(460px,88%);padding:35px;background:#0d141f;border:1px solid #263244;text-align:center;box-sizing:border-box}" +
    "h2{margin-top:0}" +
    "p{color:#aeb8c7;line-height:1.6}" +
    "a{display:inline-block;margin-top:18px;padding:12px 22px;background:#16c784;color:#04140d;font-weight:700;text-decoration:none}" +
    "</style>" +
    "</head>" +
    "<body>" +
    '<div class="box">' +
    "<h2>" + title + "</h2>" +
    "<p>" + message + "</p>" +
    '<a href="' + buttonUrl + '">' +
    buttonText +
    "</a>" +
    "</div>" +
    "</body>" +
    "</html>"
  );
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", function (req, res) {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString(),
    oauthConfigured: Boolean(DERIV_CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });
});

/* =========================================================
   CONFIG
   ========================================================= */

app.get("/api/config", function (req, res) {
  res.status(200).json({
    ok: true,
    oauthConfigured: Boolean(DERIV_CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });
});

/* =========================================================
   OAUTH START
   ========================================================= */

function startOAuth(req, res) {
  try {
    const state = randomString();
    const verifier = randomString();

    const challenge = encode(
      crypto
        .createHash("sha256")
        .update(verifier)
        .digest()
    );

    const stateValue = makeSignedValue({
      state: state,
      verifier: verifier,
      created: Date.now()
    });

    res.setHeader(
      "Set-Cookie",
      makeCookie(
        "protraders_oauth",
        stateValue,
        600
      )
    );

    const params = new URLSearchParams();

    params.set("client_id", DERIV_CLIENT_ID);
    params.set("redirect_uri", CALLBACK_URL);
    params.set("response_type", "code");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");

    const url =
      DERIV_AUTHORIZE_URL +
      "?" +
      params.toString();

    console.log("PROTRADERS FX OAUTH START");
    console.log("CALLBACK:", CALLBACK_URL);

    return res.redirect(302, url);
  } catch (error) {
    console.error("OAUTH START ERROR:", error);

    return res
      .status(500)
      .send(
        errorPage(
          "Login Error",
          "Unable to start Deriv authorization.",
          "RETURN",
          "/"
        )
      );
  }
}

app.get("/api/deriv/login", startOAuth);
app.get("/api/deriv/signup", startOAuth);

/* =========================================================
   OAUTH CALLBACK
   ========================================================= */

app.get("/oauth/callback", async function (req, res) {
  const code = req.query.code;
  const returnedState = req.query.state;
  const oauthError = req.query.error;

  console.log("PROTRADERS FX OAUTH CALLBACK");

  if (oauthError) {
    console.error(
      "DERIV OAUTH ERROR:",
      oauthError,
      req.query.error_description || ""
    );

    res.setHeader(
      "Set-Cookie",
      makeCookie("protraders_oauth", "", 0)
    );

    return res.redirect(
      302,
      "/?oauth_error=" +
        encodeURIComponent(oauthError)
    );
  }

  if (!code || !returnedState) {
    return res
      .status(400)
      .send(
        errorPage(
          "Authorization Failed",
          "The authorization response was incomplete.",
          "LOGIN AGAIN",
          "/api/deriv/login"
        )
      );
  }

  const cookies = parseCookies(req);
  const oauth = readSignedValue(
    cookies.protraders_oauth
  );

  if (!oauth) {
    return res
      .status(400)
      .send(
        errorPage(
          "Authorization Failed",
          "Your authorization session expired. Please start again.",
          "LOGIN AGAIN",
          "/api/deriv/login"
        )
      );
  }

  if (
    Date.now() -
      Number(oauth.created || 0) >
    10 * 60 * 1000
  ) {
    return res
      .status(400)
      .send(
        errorPage(
          "Authorization Expired",
          "Your authorization session expired.",
          "LOGIN AGAIN",
          "/api/deriv/login"
        )
      );
  }

  if (oauth.state !== returnedState) {
    console.error("OAUTH STATE MISMATCH");

    return res
      .status(400)
      .send(
        errorPage(
          "Authorization Failed",
          "The authorization state could not be verified.",
          "LOGIN AGAIN",
          "/api/deriv/login"
        )
      );
  }

  try {
    const params = new URLSearchParams();

    params.set(
      "grant_type",
      "authorization_code"
    );

    params.set("code", code);
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

    const response = await fetch(
      DERIV_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text
      };
    }

    if (!response.ok || data.error) {
      console.error(
        "TOKEN EXCHANGE FAILED:",
        data
      );

      return res
        .status(400)
        .send(
          errorPage(
            "Authorization Failed",
            "Deriv authorization could not be completed.",
            "TRY AGAIN",
            "/api/deriv/login"
          )
        );
    }

    const session = makeSignedValue({
      authenticated: true,
      provider: "deriv",
      access_token:
        data.access_token || null,
      refresh_token:
        data.refresh_token || null,
      token_type:
        data.token_type || null,
      expires_in:
        data.expires_in || null,
      created: Date.now()
    });

    res.setHeader(
      "Set-Cookie",
      [
        makeCookie(
          "protraders_session",
          session,
          604800
        ),
        makeCookie(
          "protraders_oauth",
          "",
          0
        )
      ]
    );

    console.log(
      "PROTRADERS FX DERIV LOGIN SUCCESSFUL"
    );

    return res.redirect(302, "/");
  } catch (error) {
    console.error(
      "OAUTH CALLBACK ERROR:",
      error
    );

    return res
      .status(500)
      .send(
        errorPage(
          "Authorization Error",
          "Unable to complete Deriv authorization.",
          "LOGIN AGAIN",
          "/api/deriv/login"
        )
      );
  }
});

/* =========================================================
   AUTH STATUS
   ========================================================= */

app.get("/api/auth/status", function (req, res) {
  const cookies = parseCookies(req);

  const session = readSignedValue(
    cookies.protraders_session
  );

  res.status(200).json({
    authenticated: Boolean(
      session &&
      session.authenticated === true
    ),
    provider:
      session && session.provider
        ? session.provider
        : null
  });
});

/* =========================================================
   LOGOUT
   ========================================================= */

app.get("/api/deriv/logout", function (req, res) {
  res.setHeader(
    "Set-Cookie",
    makeCookie(
      "protraders_session",
      "",
      0
    )
  );

  return res.redirect(302, "/");
});

/* =========================================================
   TRACK
   ========================================================= */

app.post("/api/track", function (req, res) {
  res.status(200).json({
    ok: true
  });
});

/* =========================================================
   ANALYTICS
   ========================================================= */

app.get("/api/analytics", function (req, res) {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

/* =========================================================
   FAVICON
   ========================================================= */

app.get("/favicon.ico", function (req, res) {
  res.status(204).end();
});

/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
  express.static(ROOT, {
    index: false,
    dotfiles: "ignore"
  })
);

/* =========================================================
   FRONT PAGE
   ========================================================= */

app.get("/", function (req, res) {
  res.sendFile(
    path.join(ROOT, "index.html"),
    function (error) {
      if (error) {
        console.error(
          "INDEX ERROR:",
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
});

/* =========================================================
   404
   ========================================================= */

app.use(function (req, res) {
  res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
    path: req.path
  });
});

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(function (
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

  res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR"
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
  const PORT =
    process.env.PORT || 3000;

  app.listen(
    PORT,
    function () {
      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        "http://localhost:" +
          PORT
      );

      console.log(
        "OAUTH CALLBACK: " +
          CALLBACK_URL
      );
    }
  );
}
