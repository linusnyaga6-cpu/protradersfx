"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   CONFIG
========================================================= */

const BASE_URL =
  (process.env.BASE_URL ||
    "https://www.protradersfx.com").replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "CHANGE_THIS_SESSION_SECRET_PROTRADERS_FX";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API_URL =
  "https://api.derivws.com";

const SESSION_COOKIE =
  "__Host-protraders_session";

const OAUTH_COOKIE =
  "__Host-protraders_oauth";


/* =========================================================
   SECURITY
========================================================= */

app.use((req, res, next) => {

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  res.setHeader(
    "X-Frame-Options",
    "SAMEORIGIN"
  );

  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  next();
});


/* =========================================================
   STATIC FRONTEND
========================================================= */

const ROOT = __dirname;

app.use(
  express.static(ROOT, {
    index: false
  })
);


/* =========================================================
   BASIC HELPERS
========================================================= */

function safeString(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value);
}


function base64UrlEncode(buffer) {
  return Buffer
    .from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}


function base64UrlDecode(value) {
  return Buffer
    .from(
      String(value)
        .replace(/-/g, "+")
        .replace(/_/g, "/"),
      "base64"
    );
}


function randomString(bytes = 32) {
  return base64UrlEncode(
    crypto.randomBytes(bytes)
  );
}


/* =========================================================
   COOKIE HELPERS
========================================================= */

function parseCookies(req) {

  const header =
    req.headers.cookie || "";

  const cookies = {};

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

      if (key) {
        cookies[key] =
          decodeURIComponent(value);
      }
    });

  return cookies;
}


function serializeCookie(
  name,
  value,
  options = {}
) {

  let output =
    `${name}=${encodeURIComponent(value)}`;

  if (options.maxAge !== undefined) {
    output +=
      `; Max-Age=${Math.floor(options.maxAge)}`;
  }

  if (options.expires) {
    output +=
      `; Expires=${options.expires.toUTCString()}`;
  }

  if (options.path) {
    output +=
      `; Path=${options.path}`;
  }

  if (options.httpOnly) {
    output +=
      "; HttpOnly";
  }

  if (options.secure) {
    output +=
      "; Secure";
  }

  if (options.sameSite) {
    output +=
      `; SameSite=${options.sameSite}`;
  }

  return output;
}


function setCookie(
  res,
  name,
  value,
  maxAge
) {

  res.append(
    "Set-Cookie",
    serializeCookie(
      name,
      value,
      {
        maxAge,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    )
  );
}


function clearCookie(
  res,
  name
) {

  res.append(
    "Set-Cookie",
    serializeCookie(
      name,
      "",
      {
        maxAge: 0,
        expires: new Date(0),
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    )
  );
}


/* =========================================================
   ENCRYPTION
   ========================================================= */

/*
 * The OAuth access token is NEVER returned to app.js.
 *
 * It is encrypted before being placed inside the
 * HttpOnly Secure session cookie.
 *
 * JavaScript cannot read this cookie.
 */

function getEncryptionKey() {

  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();
}


function encryptSession(data) {

  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  const plaintext =
    JSON.stringify(data);

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        "utf8"
      ),
      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    base64UrlEncode(iv),
    base64UrlEncode(tag),
    base64UrlEncode(encrypted)
  ].join(".");
}


function decryptSession(value) {

  try {

    const parts =
      String(value).split(".");

    if (parts.length !== 3) {
      return null;
    }

    const iv =
      base64UrlDecode(parts[0]);

    const tag =
      base64UrlDecode(parts[1]);

    const encrypted =
      base64UrlDecode(parts[2]);

    const decipher =
      crypto.createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        iv
      );

    decipher.setAuthTag(tag);

    const decrypted =
      Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString("utf8");

    return JSON.parse(
      decrypted
    );

  } catch (error) {

    console.error(
      "SESSION DECRYPT ERROR:",
      error.message
    );

    return null;
  }
}


/* =========================================================
   SESSION
========================================================= */

function createSessionCookie(
  accessToken,
  expiresIn
) {

  const now =
    Date.now();

  const expiresAt =
    now +
    (
      Number(expiresIn || 3600) *
      1000
    );

  const session = {

    accessToken,

    createdAt:
      now,

    expiresAt
  };

  return encryptSession(
    session
  );
}


function getSession(req) {

  const cookies =
    parseCookies(req);

  const raw =
    cookies[SESSION_COOKIE];

  if (!raw) {
    return null;
  }

  const session =
    decryptSession(raw);

  if (!session) {
    return null;
  }

  if (
    !session.accessToken ||
    !session.expiresAt
  ) {
    return null;
  }

  /*
   * Give ourselves a small safety window.
   */

  if (
    Date.now() >=
    Number(session.expiresAt) - 15000
  ) {
    return null;
  }

  return session;
}


/* =========================================================
   PKCE
========================================================= */

function createCodeVerifier() {

  return randomString(48);
}


function createCodeChallenge(
  verifier
) {

  return base64UrlEncode(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}


/* =========================================================
   OAUTH STATE
========================================================= */

function createOAuthState(
  verifier,
  mode
) {

  const state =
    randomString(32);

  const payload = {

    state,

    verifier,

    mode:

      mode === "signup"
        ? "signup"
        : "login",

    createdAt:
      Date.now()
  };

  return payload;
}


function verifyOAuthState(
  payload
) {

  if (!payload) {
    return false;
  }

  if (
    !payload.state ||
    !payload.verifier
  ) {
    return false;
  }

  const age =
    Date.now() -
    Number(payload.createdAt);

  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > 10 * 60 * 1000
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   HOME
========================================================= */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );
  }
);


/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.status(200).json({

      ok: true,

      service:
        "protraders-fx",

      time:
        new Date().toISOString()
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
        Boolean(CLIENT_ID),

      baseUrl:
        BASE_URL,

      callback:
        CALLBACK_URL
    });
  }
);


/* =========================================================
   AUTH STATUS
========================================================= */

app.get(
  "/api/deriv/session",
  async (req, res) => {

    try {

      const session =
        getSession(req);

      if (!session) {

        clearCookie(
          res,
          SESSION_COOKIE
        );

        return res.status(200).json({

          ok: true,

          authenticated:
            false,

          accountId:
            null,

          balance:
            null,

          currency:
            null,

          accountType:
            null,

          status:
            null,

          accounts: [],

          expiresAt:
            null
        });
      }


      const accounts =
        await getDerivAccounts(
          session.accessToken
        );


      if (!accounts.ok) {

        /*
         * Token has probably expired
         * or been revoked.
         */

        if (
          accounts.status ===
            401 ||
          accounts.status ===
            403
        ) {

          clearCookie(
            res,
            SESSION_COOKIE
          );

          return res.status(200).json({

            ok: true,

            authenticated:
              false,

            accountId:
              null,

            balance:
              null,

            currency:
              null,

            accountType:
              null,

            status:
              null,

            accounts: [],

            expiresAt:
              null
          });
        }


        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            "Unable to retrieve Deriv account data"
        });
      }


      const normalised =
        normaliseAccounts(
          accounts.data
        );


      const selected =
        selectAccount(
          normalised
        );


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          selected
            ? selected.accountId
            : null,

        balance:
          selected
            ? selected.balance
            : null,

        currency:
          selected
            ? selected.currency
            : null,

        accountType:
          selected
            ? selected.accountType
            : null,

        status:
          selected
            ? selected.status
            : null,

        accounts:
          normalised,

        expiresAt:
          session.expiresAt
      });

    } catch (error) {

      console.error(
        "SESSION API ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          false,

        error:
          "Unable to read authentication session"
      });
    }
  }
);


/* =========================================================
   DERIV ACCOUNTS API
========================================================= */

async function getDerivAccounts(
  accessToken
) {

  try {

    const response =
      await fetch(
        `${DERIV_API_URL}/trading/v1/options/accounts`,
        {
          method: "GET",

          headers: {

            "Authorization":
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              CLIENT_ID,

            "Content-Type":
              "application/json",

            "Accept":
              "application/json"
          }
        }
      );


    const text =
      await response.text();


    let data;

    try {

      data =
        JSON.parse(
          text
        );

    } catch {

      data = {
        raw: text
      };
    }


    if (!response.ok) {

      console.error(
        "DERIV ACCOUNTS ERROR:",
        response.status,
        data
      );

      return {

        ok: false,

        status:
          response.status,

        data
      };
    }


    return {

      ok: true,

      status:
        response.status,

      data
    };

  } catch (error) {

    console.error(
      "DERIV ACCOUNTS REQUEST ERROR:",
      error
    );

    return {

      ok: false,

      status: 500,

      data: null
    };
  }
}


/* =========================================================
   NORMALISE ACCOUNTS
========================================================= */

function normaliseAccounts(
  response
) {

  let list = [];


  if (
    Array.isArray(response)
  ) {

    list =
      response;

  } else if (
    response &&
    Array.isArray(
      response.data
    )
  ) {

    list =
      response.data;

  } else if (
    response &&
    Array.isArray(
      response.accounts
    )
  ) {

    list =
      response.accounts;

  } else if (
    response &&
    response.data &&
    typeof response.data ===
      "object"
  ) {

    list =
      Object.values(
        response.data
      ).filter(
        (item) =>
          item &&
          typeof item ===
            "object"
      );
  }


  return list
    .map(
      (account) => {

        const accountId =
          account.accountId ??
          account.account_id ??
          account.id ??
          null;

        const balance =
          account.balance ??
          account.available_balance ??
          account.availableBalance ??
          null;

        const currency =
          account.currency ??
          account.currency_code ??
          null;

        const accountType =
          account.accountType ??
          account.account_type ??
          (
            account.is_demo === true
              ? "demo"
              : null
          );

        const status =
          account.status ??
          (
            account.active === true
              ? "active"
              : null
          );


        return {

          accountId:
            accountId !== null
              ? String(accountId)
              : null,

          balance:
            balance !== null
              ? String(balance)
              : null,

          currency:
            currency !== null
              ? String(currency)
              : null,

          accountType:
            accountType !== null
              ? String(accountType)
              : null,

          status:
            status !== null
              ? String(status)
              : null
        };
      }
    )
    .filter(
      (account) =>
        account.accountId
    );
}


/* =========================================================
   SELECT ACCOUNT
========================================================= */

function selectAccount(
  accounts
) {

  if (
    !accounts.length
  ) {
    return null;
  }


  /*
   * Prefer active demo account first.
   * This is safer for the initial trading
   * interface.
   */

  const demo =
    accounts.find(
      (account) =>
        (
          String(
            account.accountType
          ).toLowerCase() ===
          "demo"
        ) &&
        (
          !account.status ||
          String(
            account.status
          ).toLowerCase() ===
          "active"
        )
    );


  if (demo) {
    return demo;
  }


  const active =
    accounts.find(
      (account) =>
        (
          !account.status ||
          String(
            account.status
          ).toLowerCase() ===
          "active"
        )
    );


  return active ||
    accounts[0];
}


/* =========================================================
   LOGIN
========================================================= */

function startOAuth(
  req,
  res,
  mode = "login"
) {

  try {

    if (!CLIENT_ID) {

      return res.status(500).json({

        ok: false,

        error:
          "DERIV_CLIENT_ID is not configured"
      });
    }


    const verifier =
      createCodeVerifier();


    const challenge =
      createCodeChallenge(
        verifier
      );


    const oauth =
      createOAuthState(
        verifier,
        mode
      );


    const encryptedOAuth =
      encryptSession(
        oauth
      );


    /*
     * Short-lived HttpOnly cookie.
     * This contains the PKCE verifier,
     * never the Deriv access token.
     */

    setCookie(
      res,
      OAUTH_COOKIE,
      encryptedOAuth,
      10 * 60
    );


    const params =
      new URLSearchParams({

        response_type:
          "code",

        client_id:
          CLIENT_ID,

        redirect_uri:
          CALLBACK_URL,

        scope:
          "trade account_manage",

        state:
          oauth.state,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"
      });


    if (
      mode === "signup"
    ) {

      params.set(
        "prompt",
        "registration"
      );
    }


    const url =
      `${DERIV_AUTH_URL}?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH:",
      mode
    );

    console.log(
      "CALLBACK:",
      CALLBACK_URL
    );


    return res.redirect(
      url
    );

  } catch (error) {

    console.error(
      "OAUTH START ERROR:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Unable to start Deriv authentication"
    });
  }
}


/* =========================================================
   LOGIN ROUTE
========================================================= */

app.get(
  "/api/deriv/login",
  (req, res) => {

    return startOAuth(
      req,
      res,
      "login"
    );
  }
);


/* =========================================================
   SIGNUP ROUTE
========================================================= */

app.get(
  "/api/deriv/signup",
  (req, res) => {

    return startOAuth(
      req,
      res,
      "signup"
    );
  }
);


/* =========================================================
   OAUTH CALLBACK
========================================================= */

app.get(
  "/oauth/callback",
  async (req, res) => {

    try {

      const {
        code,
        state,
        error,
        error_description
      } = req.query;


      console.log(
        "PROTRADERS FX OAUTH CALLBACK"
      );


      /* -----------------------------------------------------
         DERIV ERROR
      ----------------------------------------------------- */

      if (error) {

        console.error(
          "DERIV OAUTH ERROR:",
          error,
          error_description
        );

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            error_description ||
            error
          )}`
        );
      }


      /* -----------------------------------------------------
         CODE
      ----------------------------------------------------- */

      if (!code) {

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          "/?oauth=error&message=No%20authorization%20code%20returned"
        );
      }


      /* -----------------------------------------------------
         STATE
      ----------------------------------------------------- */

      if (!state) {

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          "/?oauth=error&message=OAuth%20state%20missing"
        );
      }


      /* -----------------------------------------------------
         READ OAUTH COOKIE
      ----------------------------------------------------- */

      const cookies =
        parseCookies(req);

      const oauthCookie =
        cookies[OAUTH_COOKIE];


      if (!oauthCookie) {

        console.error(
          "OAUTH COOKIE MISSING"
        );

        return res.redirect(
          "/?oauth=error&message=OAuth%20session%20expired"
        );
      }


      const oauth =
        decryptSession(
          oauthCookie
        );


      if (
        !verifyOAuthState(
          oauth
        )
      ) {

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
        );
      }


      if (
        oauth.state !==
        String(state)
      ) {

        console.error(
          "OAUTH STATE MISMATCH"
        );

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          "/?oauth=error&message=OAuth%20state%20mismatch"
        );
      }


      /* -----------------------------------------------------
         EXCHANGE CODE
      ----------------------------------------------------- */

      console.log(
        "PROTRADERS FX EXCHANGING OAUTH CODE"
      );


      const tokenResponse =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method: "POST",

            headers: {

              "Content-Type":
                "application/x-www-form-urlencoded",

              "Accept":
                "application/json"
            },

            body:
              new URLSearchParams({

                grant_type:
                  "authorization_code",

                client_id:
                  CLIENT_ID,

                code:
                  String(code),

                code_verifier:
                  oauth.verifier,

                redirect_uri:
                  CALLBACK_URL

              }).toString()
          }
        );


      const tokenText =
        await tokenResponse.text();


      let tokenData;

      try {

        tokenData =
          JSON.parse(
            tokenText
          );

      } catch {

        tokenData = {
          raw: tokenText
        };
      }


      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {

        console.error(
          "TOKEN EXCHANGE FAILED:",
          tokenResponse.status,
          tokenData
        );

        clearCookie(
          res,
          OAUTH_COOKIE
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            tokenData.error_description ||
            tokenData.error ||
            "Deriv token exchange failed"
          )}`
        );
      }


      /* -----------------------------------------------------
         TOKEN SUCCESS
      ----------------------------------------------------- */

      const accessToken =
        String(
          tokenData.access_token
        );


      const expiresIn =
        Number(
          tokenData.expires_in ||
          3600
        );


      /*
       * Create encrypted HttpOnly session.
       *
       * The token is NOT placed into:
       *
       * - URL
       * - HTML
       * - JavaScript
       * - localStorage
       * - sessionStorage
       */

      const sessionCookie =
        createSessionCookie(
          accessToken,
          expiresIn
        );


      setCookie(
        res,
        SESSION_COOKIE,
        sessionCookie,
        expiresIn
      );


      clearCookie(
        res,
        OAUTH_COOKIE
      );


      /* -----------------------------------------------------
         VERIFY ACCOUNT
      ----------------------------------------------------- */

      const accounts =
        await getDerivAccounts(
          accessToken
        );


      if (
        !accounts.ok
      ) {

        console.error(
          "AUTHENTICATED BUT ACCOUNT REQUEST FAILED:",
          accounts
        );

        /*
         * Keep the authenticated session.
         * The frontend can retry /api/deriv/session.
         */

        return res.redirect(
          "/?oauth=success"
        );
      }


      const normalised =
        normaliseAccounts(
          accounts.data
        );


      console.log(
        "PROTRADERS FX AUTHENTICATED ACCOUNTS:",
        normalised.map(
          (account) => ({
            accountId:
              account.accountId,

            accountType:
              account.accountType,

            currency:
              account.currency
          })
        )
      );


      /*
       * Never log the access token.
       */


      return res.redirect(
        "/?oauth=success"
      );

    } catch (error) {

      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      clearCookie(
        res,
        OAUTH_COOKIE
      );

      return res.redirect(
        "/?oauth=error&message=Authentication%20could%20not%20be%20completed"
      );
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.get(
  "/api/deriv/logout",
  (req, res) => {

    clearCookie(
      res,
      SESSION_COOKIE
    );

    clearCookie(
      res,
      OAUTH_COOKIE
    );

    return res.status(200).json({

      ok: true,

      authenticated:
        false
    });
  }
);


/* =========================================================
   API ROOT
========================================================= */

app.get(
  "/api",
  (req, res) => {

    res.status(200).json({

      ok: true,

      service:
        "protraders-fx"
    });
  }
);


/* =========================================================
   TRACKING
========================================================= */

app.post(
  "/api/track",
  (req, res) => {

    res.status(200).json({
      ok: true
    });
  }
);


app.get(
  "/api/track",
  (req, res) => {

    res.status(200).json({
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

    res.status(200).json({

      ok: true,

      service:
        "protraders-fx"
    });
  }
);


/* =========================================================
   APP.JS
========================================================= */

app.get(
  "/app.js",
  (req, res) => {

    res.type(
      "application/javascript"
    );

    res.sendFile(
      path.join(
        ROOT,
        "app.js"
      )
    );
  }
);


/* =========================================================
   STYLE.CSS
========================================================= */

app.get(
  "/style.css",
  (req, res) => {

    res.type(
      "text/css"
    );

    res.sendFile(
      path.join(
        ROOT,
        "style.css"
      )
    );
  }
);


/* =========================================================
   TRACKER.JS
========================================================= */

app.get(
  "/tracker.js",
  (req, res) => {

    res.type(
      "application/javascript"
    );

    res.sendFile(
      path.join(
        ROOT,
        "tracker.js"
      )
    );
  }
);


/* =========================================================
   EXPRESS-INTEGRATION.JS
========================================================= */

app.get(
  "/express-integration.js",
  (req, res) => {

    res.type(
      "application/javascript"
    );

    res.sendFile(
      path.join(
        ROOT,
        "express-integration.js"
      )
    );
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
   404
========================================================= */

app.use(
  (req, res) => {

    res.status(404).json({

      ok: false,

      error:
        "Not found",

      path:
        req.path
    });
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

    res.status(500).json({

      ok: false,

      error:
        "Internal server error"
    });
  }
);


/* =========================================================
   VERCEL
========================================================= */

module.exports = app;


/* =========================================================
   LOCAL
========================================================= */

if (
  require.main === module
) {

  app.listen(
    PORT,
    () => {

      console.log(
        `ProTraders FX running on port ${PORT}`
      );
    }
  );
}
