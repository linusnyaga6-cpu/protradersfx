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

const DERIV_AUTHORIZE =
  "https://oauth.deriv.com/oauth2/authorize";

const DERIV_TOKEN =
  "https://oauth.deriv.com/oauth2/token";

const ROOT = __dirname;

function send(res, status, type, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

function json(res, status, data) {
  send(
    res,
    status,
    "application/json; charset=utf-8",
    JSON.stringify(data)
  );
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

function cookieValue(req, name) {
  const header = req.headers.cookie || "";

  const cookies = header.split(";");

  for (const item of cookies) {
    const parts = item.trim().split("=");

    if (parts[0] === name) {
      return decodeURIComponent(
        parts.slice(1).join("=")
      );
    }
  }

  return null;
}

function encode(value) {
  return Buffer.from(value)
    .toString("base64url");
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

function createState() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function createVerifier() {
  return crypto
    .randomBytes(32)
    .toString("base64url");
}

function createChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function oauthCookie(state, verifier) {
  const data = JSON.stringify({
    state,
    verifier,
    time: Date.now()
  });

  const payload = encode(data);
  const signature = sign(payload);

  return payload + "." + signature;
}

function readOAuthCookie(req) {
  const raw = cookieValue(
    req,
    "protraders_oauth"
  );

  if (!raw) {
    return null;
  }

  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];

  if (sign(payload) !== signature) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(
        payload,
        "base64url"
      ).toString("utf8")
    );

    if (
      Date.now() -
        Number(data.time || 0) >
      10 * 60 * 1000
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function sessionCookie(tokenData) {
  const data = JSON.stringify({
    authenticated: true,
    provider: "deriv",
    access_token:
      tokenData.access_token || null,
    refresh_token:
      tokenData.refresh_token || null,
    token_type:
      tokenData.token_type || null,
    expires_in:
      tokenData.expires_in || null,
    time: Date.now()
  });

  const payload = encode(data);
  const signature = sign(payload);

  return payload + "." + signature;
}

function readSession(req) {
  const raw = cookieValue(
    req,
    "protraders_session"
  );

  if (!raw) {
    return null;
  }

  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payload = parts[0];
  const signature = parts[1];

  if (sign(payload) !== signature) {
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

function oauthUrl(state, verifier) {
  const challenge =
    createChallenge(verifier);

  const params =
    new URLSearchParams();

  params.set(
    "client_id",
    CLIENT_ID
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

  return (
    DERIV_AUTHORIZE +
    "?" +
    params.toString()
  );
}

function mime(file) {
  const ext =
    path.extname(file)
      .toLowerCase();

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webp": "image/webp"
  };

  return (
    types[ext] ||
    "application/octet-stream"
  );
}

function serveFile(res, file) {
  if (!fs.existsSync(file)) {
    return false;
  }

  try {
    const stat = fs.statSync(file);

    if (!stat.isFile()) {
      return false;
    }

    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      mime(file)
    );

    res.end(
      fs.readFileSync(file)
    );

    return true;
  } catch (error) {
    console.error(
      "FILE ERROR:",
      error
    );

    return false;
  }
}

async function exchangeCode(
  code,
  verifier
) {
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
    verifier
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

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: "invalid_response",
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      data.error_description ||
      data.error ||
      "Deriv token exchange failed"
    );
  }

  if (data.error) {
    throw new Error(
      data.error_description ||
      data.error
    );
  }

  return data;
}

async function handler(req, res) {
  try {
    const url =
      new URL(
        req.url,
        BASE_URL
      );

    const pathname =
      url.pathname;

    console.log(
      "PROTRADERS FX:",
      req.method,
      pathname
    );

    /* HEALTH */

    if (
      req.method === "GET" &&
      pathname === "/health"
    ) {
      return json(res, 200, {
        ok: true,
        service: "protraders-fx",
        time:
          new Date().toISOString(),
        oauthConfigured:
          Boolean(CLIENT_ID),
        baseUrl: BASE_URL,
        callback: CALLBACK_URL
      });
    }

    /* CONFIG */

    if (
      req.method === "GET" &&
      pathname === "/api/config"
    ) {
      return json(res, 200, {
        ok: true,
        oauthConfigured:
          Boolean(CLIENT_ID),
        baseUrl: BASE_URL,
        callback: CALLBACK_URL
      });
    }

    /* AUTH STATUS */

    if (
      req.method === "GET" &&
      pathname === "/api/auth/status"
    ) {
      const session =
        readSession(req);

      return json(res, 200, {
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

    /* LOGIN */

    if (
      req.method === "GET" &&
      pathname === "/api/deriv/login"
    ) {
      const state =
        createState();

      const verifier =
        createVerifier();

      const cookie =
        oauthCookie(
          state,
          verifier
        );

      res.setHeader(
        "Set-Cookie",
        makeCookie(
          "protraders_oauth",
          cookie,
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

      return redirect(
        res,
        oauthUrl(
          state,
          verifier
        )
      );
    }

    /* SIGNUP */

    if (
      req.method === "GET" &&
      pathname === "/api/deriv/signup"
    ) {
      const state =
        createState();

      const verifier =
        createVerifier();

      const cookie =
        oauthCookie(
          state,
          verifier
        );

      res.setHeader(
        "Set-Cookie",
        makeCookie(
          "protraders_oauth",
          cookie,
          600
        )
      );

      return redirect(
        res,
        oauthUrl(
          state,
          verifier
        )
      );
    }

    /* OAUTH CALLBACK */

    if (
      req.method === "GET" &&
      pathname === "/oauth/callback"
    ) {
      const error =
        url.searchParams.get(
          "error"
        );

      if (error) {
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
              error
            )
        );
      }

      const code =
        url.searchParams.get(
          "code"
        );

      const returnedState =
        url.searchParams.get(
          "state"
        );

      if (
        !code ||
        !returnedState
      ) {
        return send(
          res,
          400,
          "text/html; charset=utf-8",
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Missing authorization code or state.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      const oauth =
        readOAuthCookie(req);

      if (!oauth) {
        return send(
          res,
          400,
          "text/html; charset=utf-8",
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Your authorization session expired.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      if (
        oauth.state !==
        returnedState
      ) {
        return send(
          res,
          400,
          "text/html; charset=utf-8",
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Invalid authorization state.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      try {
        console.log(
          "PROTRADERS FX EXCHANGING CODE"
        );

        const tokenData =
          await exchangeCode(
            code,
            oauth.verifier
          );

        const session =
          sessionCookie(
            tokenData
          );

        res.setHeader(
          "Set-Cookie",
          [
            makeCookie(
              "protraders_session",
              session,
              604800
            ),
            clearCookie(
              "protraders_oauth"
            )
          ]
        );

        console.log(
          "PROTRADERS FX LOGIN SUCCESSFUL"
        );

        return redirect(
          res,
          "/"
        );
      } catch (error) {
        console.error(
          "OAUTH ERROR:",
          error
        );

        res.setHeader(
          "Set-Cookie",
          clearCookie(
            "protraders_oauth"
          )
        );

        return send(
          res,
          400,
          "text/html; charset=utf-8",
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Deriv authorization could not be completed.</p><a href='/api/deriv/login'>Try again</a></body></html>"
        );
      }
    }

    /* LOGOUT */

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

    /* TRACK */

    if (
      req.method === "POST" &&
      pathname === "/api/track"
    ) {
      return json(res, 200, {
        ok: true
      });
    }

    /* ANALYTICS */

    if (
      req.method === "GET" &&
      pathname === "/api/analytics"
    ) {
      return json(res, 200, {
        ok: true,
        service:
          "protraders-fx",
        time:
          new Date().toISOString()
      });
    }

    /* FAVICON */

    if (
      req.method === "GET" &&
      pathname === "/favicon.ico"
    ) {
      const favicon =
        path.join(
          ROOT,
          "favicon.ico"
        );

      if (
        serveFile(
          res,
          favicon
        )
      ) {
        return;
      }

      res.statusCode = 204;
      return res.end();
    }

    /* FRONTEND */

    let requested =
      pathname === "/"
        ? "index.html"
        : pathname.replace(
            /^\/+/,
            ""
          );

    if (
      requested.includes("..")
    ) {
      return json(
        res,
        400,
        {
          ok: false,
          error: "BAD_PATH"
        }
      );
    }

    const file =
      path.join(
        ROOT,
        requested
      );

    if (
      serveFile(
        res,
        file
      )
    ) {
      return;
    }

    /* SPA FALLBACK */

    if (
      pathname.indexOf(
        "/api/"
      ) !== 0 &&
      pathname !==
        "/oauth/callback"
    ) {
      const index =
        path.join(
          ROOT,
          "index.html"
        );

      if (
        serveFile(
          res,
          index
        )
      ) {
        return;
      }
    }

    return json(
      res,
      404,
      {
        ok: false,
        error: "NOT_FOUND",
        path: pathname
      }
    );
  } catch (error) {
    console.error(
      "PROTRADERS FX SERVER ERROR:",
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

module.exports = handler;
