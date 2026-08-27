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
  (process.env.BASE_URL || "https://www.protradersfx.com")
    .replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret-change-this";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const DERIV_AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const DERIV_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API =
  "https://api.derivws.com";

const COOKIE_NAME =
  "protraders_session";


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
   HOME
========================================================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(ROOT, "index.html")
  );

});


/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

  res.status(200).json({

    ok: true,

    service:
      "protraders-fx",

    time:
      new Date().toISOString()

  });

});


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

      const name =
        part
          .slice(0, index)
          .trim();

      const value =
        part
          .slice(index + 1)
          .trim();

      if (name) {
        cookies[name] =
          decodeURIComponent(value);
      }

    });

  return cookies;
}


function setSessionCookie(res, value, maxAge) {

  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");

  res.setHeader(
    "Set-Cookie",
    cookie
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );

}


/* =========================================================
   ENCRYPTED SERVER SESSION
========================================================= */

/*
 * The Deriv access token is NEVER returned to app.js.
 *
 * It is encrypted before being placed inside the
 * HttpOnly session cookie.
 *
 * Browser JavaScript cannot read the cookie.
 *
 * SESSION_SECRET is required to decrypt it.
 */

function encryptionKey() {

  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();

}


function encryptSession(payload) {

  const iv =
    crypto.randomBytes(12);

  const key =
    encryptionKey();

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  const plaintext =
    JSON.stringify(payload);

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
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
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
      Buffer.from(
        parts[0],
        "base64url"
      );

    const tag =
      Buffer.from(
        parts[1],
        "base64url"
      );

    const encrypted =
      Buffer.from(
        parts[2],
        "base64url"
      );

    const decipher =
      crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        iv
      );

    decipher.setAuthTag(tag);

    const plaintext =
      Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString("utf8");

    return JSON.parse(
      plaintext
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
   GET CURRENT SESSION
========================================================= */

function getSession(req) {

  const cookies =
    parseCookies(req);

  const value =
    cookies[COOKIE_NAME];

  if (!value) {
    return null;
  }

  const session =
    decryptSession(value);

  if (!session) {
    return null;
  }

  if (
    session.expiresAt &&
    Date.now() >= session.expiresAt
  ) {
    return null;
  }

  return session;
}


/* =========================================================
   SAVE SESSION
========================================================= */

function saveSession(res, session) {

  const encrypted =
    encryptSession(session);

  const maxAge =
    Math.max(
      60,
      Math.floor(
        (session.expiresAt - Date.now()) /
        1000
      )
    );

  setSessionCookie(
    res,
    encrypted,
    maxAge
  );

}


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function requireAuth(req, res, next) {

  const session =
    getSession(req);

  if (!session) {

    return res.status(401).json({

      ok: false,

      authenticated: false,

      error:
        "Authentication required"

    });

  }

  req.session =
    session;

  next();

}


/* =========================================================
   PKCE
========================================================= */

function base64UrlEncode(buffer) {

  return Buffer
    .from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

}


function createCodeVerifier() {

  return base64UrlEncode(
    crypto.randomBytes(48)
  );

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

function signState(data) {

  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(data)
    .digest("hex");

}


function createState(verifier) {

  const timestamp =
    Date.now().toString();

  const nonce =
    crypto.randomBytes(16)
      .toString("hex");

  const data =
    `${timestamp}:${nonce}:${verifier}`;

  const signature =
    signState(data);

  return base64UrlEncode(
    Buffer.from(
      `${data}:${signature}`
    )
  );

}


function decodeState(state) {

  try {

    const decoded =
      Buffer
        .from(
          state,
          "base64url"
        )
        .toString("utf8");

    const parts =
      decoded.split(":");

    if (parts.length !== 4) {
      return null;
    }

    const timestamp =
      parts[0];

    const nonce =
      parts[1];

    const verifier =
      parts[2];

    const signature =
      parts[3];

    const data =
      `${timestamp}:${nonce}:${verifier}`;

    const expected =
      signState(data);

    if (
      signature.length !==
      expected.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return null;
    }

    const age =
      Date.now() -
      Number(timestamp);

    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age > 10 * 60 * 1000
    ) {
      return null;
    }

    return {
      verifier
    };

  } catch (error) {

    console.error(
      "STATE ERROR:",
      error.message
    );

    return null;
  }

}


/* =========================================================
   OAUTH START
========================================================= */

function startOAuth(req, res, signup) {

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

    const state =
      createState(
        verifier
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

        state,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"

      });

    if (signup) {

      params.set(
        "prompt",
        "registration"
      );

    }

    const authorizationUrl =
      `${DERIV_AUTH_URL}?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH"
    );

    console.log(
      "Callback:",
      CALLBACK_URL
    );

    return res.redirect(
      authorizationUrl
    );

  } catch (error) {

    console.error(
      "OAUTH START ERROR:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Unable to start OAuth"

    });

  }

}


/* =========================================================
   LOGIN
========================================================= */

app.get(
  "/api/deriv/login",
  (req, res) => {

    startOAuth(
      req,
      res,
      false
    );

  }
);


/* =========================================================
   CREATE ACCOUNT
========================================================= */

app.get(
  "/api/deriv/signup",
  (req, res) => {

    startOAuth(
      req,
      res,
      true
    );

  }
);


/* =========================================================
   OAUTH CALLBACK
========================================================= */

app.get(
  "/oauth/callback",
  async (req, res) => {

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
        "DERIV ERROR:",
        error,
        error_description
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

      return res.redirect(
        "/?oauth=error&message=No%20authorization%20code"
      );

    }


    /* -----------------------------------------------------
       STATE
    ----------------------------------------------------- */

    if (!state) {

      return res.redirect(
        "/?oauth=error&message=Missing%20OAuth%20state"
      );

    }


    const stateData =
      decodeState(
        state
      );


    if (!stateData) {

      return res.redirect(
        "/?oauth=error&message=Invalid%20OAuth%20state"
      );

    }


    /* -----------------------------------------------------
       TOKEN EXCHANGE
    ----------------------------------------------------- */

    try {

      console.log(
        "PROTRADERS FX EXCHANGING CODE"
      );

      const tokenResponse =
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
              new URLSearchParams({

                grant_type:
                  "authorization_code",

                client_id:
                  CLIENT_ID,

                code:
                  String(code),

                redirect_uri:
                  CALLBACK_URL,

                code_verifier:
                  stateData.verifier

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
          tokenData
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            tokenData.error_description ||
            tokenData.error ||
            "Token exchange failed"
          )}`
        );

      }


      const accessToken =
        tokenData.access_token;


      /*
       * NEVER send accessToken to the browser.
       */


      const expiresIn =
        Number(
          tokenData.expires_in ||
          3600
        );


      const expiresAt =
        Date.now() +
        Math.max(
          60,
          expiresIn - 60
        ) *
        1000;


      /* ---------------------------------------------------
         GET AUTHENTICATED ACCOUNTS
      --------------------------------------------------- */

      const accountsResponse =
        await derivFetch(
          "/trading/v1/options/accounts",
          accessToken
        );


      if (!accountsResponse.ok) {

        console.error(
          "ACCOUNT LOOKUP FAILED:",
          accountsResponse.data
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            "Authentication succeeded but account data could not be loaded"
          )}`
        );

      }


      const accounts =
        extractAccounts(
          accountsResponse.data
        );


      if (!accounts.length) {

        console.error(
          "NO OPTIONS ACCOUNTS FOUND"
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            "No Deriv trading account was returned"
          )}`
        );

      }


      /*
       * Prefer an active demo account.
       * Otherwise use the first active account.
       */

      let selected =
        accounts.find(
          (account) =>
            account.status === "active" &&
            account.account_type === "demo"
        );


      if (!selected) {

        selected =
          accounts.find(
            (account) =>
              account.status === "active"
          );

      }


      if (!selected) {

        selected =
          accounts[0];

      }


      const session = {

        authenticated:
          true,

        accountId:
          selected.account_id ||
          selected.loginid ||
          null,

        balance:
          selected.balance ??
          null,

        currency:
          selected.currency ||
          null,

        accountType:
          selected.account_type ||
          null,

        status:
          selected.status ||
          null,

        expiresAt,

        accessToken

      };


      /*
       * Encrypted HttpOnly cookie.
       *
       * app.js cannot read accessToken.
       */

      saveSession(
        res,
        session
      );


      console.log(
        "PROTRADERS FX AUTHENTICATED:",
        session.accountId
      );


      return res.redirect(
        "/?oauth=success"
      );


    } catch (error) {

      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      return res.redirect(
        `/?oauth=error&message=${encodeURIComponent(
          "Authentication could not be completed"
        )}`
      );

    }

  }
);


/* =========================================================
   DERIV REST HELPER
========================================================= */

async function derivFetch(
  endpoint,
  accessToken,
  options = {}
) {

  const headers = {

    "Authorization":
      `Bearer ${accessToken}`,

    "Deriv-App-ID":
      CLIENT_ID,

    ...(options.headers || {})

  };


  const response =
    await fetch(
      `${DERIV_API}${endpoint}`,
      {
        ...options,
        headers
      }
    );


  const text =
    await response.text();

  let data;

  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    data = {
      raw: text
    };

  }


  return {

    ok:
      response.ok,

    status:
      response.status,

    data

  };

}


/* =========================================================
   EXTRACT ACCOUNTS
========================================================= */

function extractAccounts(data) {

  if (!data) {
    return [];
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  if (
    data.data &&
    typeof data.data === "object"
  ) {
    return [
      data.data
    ];
  }

  if (Array.isArray(data.accounts)) {
    return data.accounts;
  }

  return [];

}


/* =========================================================
   AUTH STATUS
========================================================= */

app.get(
  "/api/auth/status",
  (req, res) => {

    const session =
      getSession(req);


    if (!session) {

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
          null

      });

    }


    return res.status(200).json({

      ok: true,

      authenticated:
        true,

      accountId:
        session.accountId,

      balance:
        session.balance,

      currency:
        session.currency,

      accountType:
        session.accountType,

      status:
        session.status,

      expiresAt:
        session.expiresAt

    });

  }
);


/* =========================================================
   AUTHENTICATED ACCOUNT
========================================================= */

app.get(
  "/api/account",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await derivFetch(
          "/trading/v1/options/accounts",
          req.session.accessToken
        );


      if (!result.ok) {

        if (
          result.status === 401
        ) {

          clearSessionCookie(
            res
          );

        }

        return res.status(
          result.status
        ).json({

          ok: false,

          authenticated:
            result.status !== 401,

          error:
            "Unable to load account",

          details:
            result.data

        });

      }


      const accounts =
        extractAccounts(
          result.data
        );


      let selected =
        accounts.find(
          (account) =>
            account.account_id ===
            req.session.accountId
        );


      if (!selected) {

        selected =
          accounts.find(
            (account) =>
              account.status === "active" &&
              account.account_type === "demo"
          );

      }


      if (!selected) {
        selected = accounts[0];
      }


      if (!selected) {

        return res.status(404).json({

          ok: false,

          authenticated:
            true,

          error:
            "No account found"

        });

      }


      /*
       * Refresh the encrypted session
       * with the latest account data.
       */

      req.session.accountId =
        selected.account_id ||
        selected.loginid ||
        req.session.accountId;

      req.session.balance =
        selected.balance ??
        req.session.balance ??
        null;

      req.session.currency =
        selected.currency ||
        req.session.currency ||
        null;

      req.session.accountType =
        selected.account_type ||
        req.session.accountType ||
        null;

      req.session.status =
        selected.status ||
        req.session.status ||
        null;


      saveSession(
        res,
        req.session
      );


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          req.session.accountId,

        balance:
          req.session.balance,

        currency:
          req.session.currency,

        accountType:
          req.session.accountType,

        status:
          req.session.status

      });


    } catch (error) {

      console.error(
        "ACCOUNT API ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          true,

        error:
          "Account request failed"

      });

    }

  }
);


/* =========================================================
   BALANCE
========================================================= */

/*
 * The new Deriv balance endpoint is a WebSocket
 * account endpoint. The Options account REST
 * response also supplies balance data for the
 * authenticated Options account.
 *
 * We refresh the account before returning balance.
 */

app.get(
  "/api/account/balance",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await derivFetch(
          "/trading/v1/options/accounts",
          req.session.accessToken
        );


      if (!result.ok) {

        if (
          result.status === 401
        ) {

          clearSessionCookie(
            res
          );

        }

        return res.status(
          result.status
        ).json({

          ok: false,

          authenticated:
            result.status !== 401,

          error:
            "Unable to retrieve balance"

        });

      }


      const accounts =
        extractAccounts(
          result.data
        );


      const account =
        accounts.find(
          (item) =>
            (
              item.account_id ||
              item.loginid
            ) ===
            req.session.accountId
        ) ||
        accounts[0];


      if (!account) {

        return res.status(404).json({

          ok: false,

          authenticated:
            true,

          error:
            "Account not found"

        });

      }


      req.session.balance =
        account.balance ??
        null;

      req.session.currency =
        account.currency ||
        null;


      saveSession(
        res,
        req.session
      );


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          account.account_id ||
          account.loginid ||
          req.session.accountId,

        balance:
          account.balance ??
          null,

        currency:
          account.currency ||
          null

      });


    } catch (error) {

      console.error(
        "BALANCE ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          true,

        error:
          "Balance request failed"

      });

    }

  }
);


/* =========================================================
   AUTHENTICATED ACCOUNT LIST
========================================================= */

app.get(
  "/api/accounts",
  requireAuth,
  async (req, res) => {

    try {

      const result =
        await derivFetch(
          "/trading/v1/options/accounts",
          req.session.accessToken
        );


      if (!result.ok) {

        return res.status(
          result.status
        ).json({

          ok: false,

          error:
            "Unable to retrieve accounts"

        });

      }


      const accounts =
        extractAccounts(
          result.data
        );


      /*
       * Only safe account information is
       * exposed to the frontend.
       *
       * accessToken is NEVER returned.
       */

      const safeAccounts =
        accounts.map(
          (account) => ({

            accountId:
              account.account_id ||
              account.loginid ||
              null,

            balance:
              account.balance ??
              null,

            currency:
              account.currency ||
              null,

            accountType:
              account.account_type ||
              null,

            status:
              account.status ||
              null

          })
        );


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accounts:
          safeAccounts

      });


    } catch (error) {

      console.error(
        "ACCOUNTS ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        error:
          "Unable to retrieve accounts"

      });

    }

  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.get(
  "/api/logout",
  (req, res) => {

    clearSessionCookie(
      res
    );

    return res.redirect(
      "/"
    );

  }
);


/* =========================================================
   TRADING FEATURES
========================================================= */

/*
 * These routes provide the authenticated
 * feature structure for the ProTraders FX
 * dashboard.
 *
 * Actual trading execution must use the
 * authenticated Deriv WebSocket/OTP flow.
 */

app.get(
  "/api/trading/features",
  (req, res) => {

    const session =
      getSession(req);


    return res.status(200).json({

      ok: true,

      authenticated:
        Boolean(session),

      features: [

        {
          id: "manual",
          name: "Manual Trade",
          enabled: Boolean(session)
        },

        {
          id: "bots",
          name: "Create Bots",
          enabled: Boolean(session)
        },

        {
          id: "bulk",
          name: "Bulk Create Bots",
          enabled: Boolean(session)
        },

        {
          id: "ai",
          name: "AI Scanner",
          enabled: Boolean(session)
        },

        {
          id: "analysis",
          name: "AI Analysis",
          enabled: Boolean(session)
        },

        {
          id: "open-trades",
          name: "Open Trades",
          enabled: Boolean(session)
        },

        {
          id: "history",
          name: "History",
          enabled: Boolean(session)
        },

        {
          id: "risk",
          name: "Risk",
          enabled: Boolean(session)
        }

      ]

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
        "protraders-fx",

      authenticated:
        Boolean(
          getSession(req)
        )

    });

  }
);


/* =========================================================
   FRONTEND JS
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
   CSS
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
   TRACKER
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
      "SERVER ERROR:",
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
