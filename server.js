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

const OAUTH_AUTHORIZE =
  "https://auth.deriv.com/oauth2/auth";

const OAUTH_TOKEN =
  "https://auth.deriv.com/oauth2/token";

const ROOT = __dirname;

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  res.end(JSON.stringify(data));
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );
  res.end(body);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

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

function randomString() {
  return crypto
    .randomBytes(32)
    .toString("base64url");
}

function challenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const item of header.split(";")) {
    const parts = item.trim().split("=");

    if (parts[0] === name) {
      return decodeURIComponent(
        parts.slice(1).join("=")
      );
    }
  }

  return null;
}

function setCookie(res, name, value, maxAge) {
  res.setHeader(
    "Set-Cookie",
    name +
      "=" +
      encodeURIComponent(value) +
      "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
      maxAge
  );
}

function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    name +
      "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}

function createOAuthState(state, verifier) {
  const payload = base64url(
    JSON.stringify({
      state,
      verifier,
      created: Date.now()
    })
  );

  return payload + "." + sign(payload);
}

function readOAuthState(req) {
  const value = getCookie(
    req,
    "protraders_oauth"
  );

  if (!value) {
    return null;
  }

  const parts = value.split(".");

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
        Number(data.created || 0) >
      10 * 60 * 1000
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function createOAuthUrl(state, verifier) {
  const params = new URLSearchParams();

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
    state
  );

  params.set(
    "code_challenge",
    challenge(verifier)
  );

  params.set(
    "code_challenge_method",
    "S256"
  );

  return (
    OAUTH_AUTHORIZE +
    "?" +
    params.toString()
  );
}

function contentType(file) {
  const ext = path
    .extname(file)
    .toLowerCase();

  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
  };

  return (
    map[ext] ||
    "application/octet-stream"
  );
}

function serveFile(res, filename) {
  try {
    if (!fs.existsSync(filename)) {
      return false;
    }

    const stat =
      fs.statSync(filename);

    if (!stat.isFile()) {
      return false;
    }

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      contentType(filename)
    );

    res.end(
      fs.readFileSync(filename)
    );

    return true;
  } catch (error) {
    console.error(
      "STATIC FILE ERROR:",
      error
    );

    return false;
  }
}

async function exchangeCode(
  code,
  verifier
) {
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
    code
  );

  body.set(
    "redirect_uri",
    CALLBACK_URL
  );

  body.set(
    "code_verifier",
    verifier
  );

  const response =
    await fetch(
      OAUTH_TOKEN,
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
      "Token exchange failed"
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
    const url = new URL(
      req.url,
      BASE_URL
    );

    const pathname =
      url.pathname;

    console.log(
      "[PROTRADERS FX]",
      req.method,
      pathname
    );

    /* HEALTH */

    if (
      pathname === "/health"
    ) {
      return json(res, 200, {
        ok: true,
        service: "protraders-fx",
        time:
          new Date().toISOString()
      });
    }

    /* CONFIG */

    if (
      pathname === "/api/config"
    ) {
      return json(res, 200, {
        ok: true,
        oauthConfigured:
          Boolean(CLIENT_ID),
        baseUrl: BASE_URL,
        callback:
          CALLBACK_URL
      });
    }

    /* AUTH STATUS */

    if (
      pathname === "/api/auth/status"
    ) {
      return json(res, 200, {
        authenticated:
          Boolean(
            getCookie(
              req,
              "protraders_session"
            )
          ),
        provider:
          getCookie(
            req,
            "protraders_session"
          )
            ? "deriv"
            : null
      });
    }

    /* LOGIN */

    if (
      pathname ===
      "/api/deriv/login"
    ) {
      const state =
        randomString();

      const verifier =
        randomString();

      const oauthState =
        createOAuthState(
          state,
          verifier
        );

      setCookie(
        res,
        "protraders_oauth",
        oauthState,
        600
      );

      return redirect(
        res,
        createOAuthUrl(
          state,
          verifier
        )
      );
    }

    /* SIGNUP */

    if (
      pathname ===
      "/api/deriv/signup"
    ) {
      const state =
        randomString();

      const verifier =
        randomString();

      const oauthState =
        createOAuthState(
          state,
          verifier
        );

      setCookie(
        res,
        "protraders_oauth",
        oauthState,
        600
      );

      return redirect(
        res,
        createOAuthUrl(
          state,
          verifier
        )
      );
    }

    /* OAUTH CALLBACK */

    if (
      pathname ===
      "/oauth/callback"
    ) {
      const error =
        url.searchParams.get(
          "error"
        );

      if (error) {
        clearCookie(
          res,
          "protraders_oauth"
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
        return html(
          res,
          400,
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Missing authorization code or state.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      const oauth =
        readOAuthState(req);

      if (!oauth) {
        return html(
          res,
          400,
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Authorization session expired.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      if (
        oauth.state !==
        returnedState
      ) {
        return html(
          res,
          400,
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Authorization state mismatch.</p><a href='/api/deriv/login'>Login again</a></body></html>"
        );
      }

      try {
        const token =
          await exchangeCode(
            code,
            oauth.verifier
          );

        const session =
          base64url(
            JSON.stringify({
              authenticated: true,
              provider: "deriv",
              expires:
                Date.now() +
                Number(
                  token.expires_in ||
                    3600
                ) *
                  1000
            })
          );

        setCookie(
          res,
          "protraders_session",
          session,
          Number(
            token.expires_in ||
              3600
          )
        );

        clearCookie(
          res,
          "protraders_oauth"
        );

        return redirect(
          res,
          "/"
        );
      } catch (error) {
        console.error(
          "OAUTH TOKEN ERROR:",
          error
        );

        clearCookie(
          res,
          "protraders_oauth"
        );

        return html(
          res,
          400,
          "<!doctype html><html><body><h2>Authorization failed</h2><p>Deriv authorization could not be completed.</p><a href='/api/deriv/login'>Try again</a></body></html>"
        );
      }
    }

    /* LOGOUT */

    if (
      pathname ===
      "/api/deriv/logout"
    ) {
      clearCookie(
        res,
        "protraders_session"
      );

      return redirect(
        res,
        "/"
      );
    }

    /* TRACK */

    if (
      pathname ===
      "/api/track"
    ) {
      return json(res, 200, {
        ok: true
      });
    }

    /* ANALYTICS */

    if (
      pathname ===
      "/api/analytics"
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
      pathname ===
      "/favicon.ico"
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

    /* STATIC FILES */

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

    /* FRONTEND FALLBACK */

    if (
      pathname.indexOf(
        "/api/"
      ) !== 0
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
      "[PROTRADERS FX FATAL ERROR]",
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
