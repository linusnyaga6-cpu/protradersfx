"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   CONFIG
========================================================= */

const BASE_URL =
  process.env.BASE_URL || "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-production-session-secret-change-me";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const OAUTH_AUTHORIZE_URL =
  "https://auth.deriv.com/oauth2/auth";

const OAUTH_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API_URL =
  "https://api.derivws.com/trading/v1/options/ws/public";


/* =========================================================
   SERVER-SIDE SESSION STORE
========================================================= */

/*
 * IMPORTANT:
 *
 * The Deriv access token is NEVER sent to the browser.
 *
 * The browser receives only an opaque session ID.
 *
 * The token remains in this server-side Map.
 *
 * Vercel serverless instances can restart, so this is an
 * in-memory session store. The OAuth flow itself is fully
 * server-side and the session cookie does not contain the
 * Deriv token.
 */

const sessions = new Map();

const oauthStates = new Map();

const SESSION_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

const OAUTH_STATE_MAX_AGE =
  10 * 60 * 1000;


/* =========================================================
   SECURITY HEADERS
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
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
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
   COOKIE HELPERS
========================================================= */

function parseCookies(req) {

  const header =
    req.headers.cookie;

  if (!header) {
    return {};
  }

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

      cookies[name] =
        decodeURIComponent(value);
    });

  return cookies;
}


function setSessionCookie(
  res,
  sessionId
) {

  const parts = [
    `ptfx_session=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.floor(
      SESSION_MAX_AGE / 1000
    )}`
  ];

  res.setHeader(
    "Set-Cookie",
    parts.join("; ")
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    [
      "ptfx_session=",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );
}


/* =========================================================
   SESSION HELPERS
========================================================= */

function createSession(data) {

  const sessionId =
    crypto.randomBytes(32)
      .toString("hex");

  sessions.set(
    sessionId,
    {
      ...data,
      createdAt: Date.now(),
      expiresAt:
        Date.now() +
        SESSION_MAX_AGE
    }
  );

  return sessionId;
}


function getSession(req) {

  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.ptfx_session;

  if (!sessionId) {
    return null;
  }

  const session =
    sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (
    Date.now() >
    session.expiresAt
  ) {

    sessions.delete(
      sessionId
    );

    return null;
  }

  return {
    id: sessionId,
    data: session
  };
}


function destroySession(req) {

  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.ptfx_session;

  if (sessionId) {
    sessions.delete(
      sessionId
    );
  }
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

function createOAuthState(
  verifier
) {

  const stateId =
    crypto.randomBytes(32)
      .toString("hex");

  oauthStates.set(
    stateId,
    {
      verifier,
      createdAt: Date.now()
    }
  );

  return stateId;
}


function consumeOAuthState(
  state
) {

  if (!state) {
    return null;
  }

  const record =
    oauthStates.get(state);

  if (!record) {
    return null;
  }

  oauthStates.delete(state);

  if (
    Date.now() -
      record.createdAt >
    OAUTH_STATE_MAX_AGE
  ) {
    return null;
  }

  return record;
}


/* =========================================================
   CLEAN EXPIRED DATA
========================================================= */

function cleanupStores() {

  const now =
    Date.now();

  for (
    const [
      sessionId,
      session
    ] of sessions
  ) {

    if (
      now >
      session.expiresAt
    ) {
      sessions.delete(
        sessionId
      );
    }
  }


  for (
    const [
      state,
      record
    ] of oauthStates
  ) {

    if (
      now -
        record.createdAt >
      OAUTH_STATE_MAX_AGE
    ) {
      oauthStates.delete(
        state
      );
    }
  }
}

setInterval(
  cleanupStores,
  60 * 1000
);


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
          null,

        status:
          null,

        accounts:
          [],

        expiresAt:
          null
      });
    }


    const data =
      session.data;


    /*
     * Return only safe account information.
     *
     * NEVER return access_token.
     */

    return res.status(200).json({

      ok: true,

      authenticated:
        true,

      accountId:
        data.accountId || null,

      balance:
        data.balance ?? null,

      currency:
        data.currency || null,

      accountType:
        data.accountType || null,

      status:
        data.status || null,

      accounts:
        Array.isArray(data.accounts)
          ? data.accounts
          : [],

      expiresAt:
        data.expiresAt
    });
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.get(
  "/api/deriv/logout",
  (req, res) => {

    destroySession(req);

    clearSessionCookie(res);

    return res.redirect(
      "/?logout=success"
    );
  }
);


app.post(
  "/api/deriv/logout",
  (req, res) => {

    destroySession(req);

    clearSessionCookie(res);

    return res.status(200).json({

      ok: true,

      authenticated:
        false
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
   OAUTH START
========================================================= */

function startOAuth(
  req,
  res
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


    const state =
      createOAuthState(
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


    const authorizationUrl =
      `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH START"
    );

    console.log(
      "CLIENT ID:",
      CLIENT_ID
    );

    console.log(
      "REDIRECT URI:",
      CALLBACK_URL
    );

    console.log(
      "AUTHORIZATION URL:",
      authorizationUrl
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
  startOAuth
);


/* =========================================================
   SIGNUP
========================================================= */

app.get(
  "/api/deriv/signup",
  startOAuth
);


/* =========================================================
   TOKEN EXCHANGE
========================================================= */

async function exchangeCode(
  code,
  verifier
) {

  const body =
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
        verifier
    });


  console.log(
    "PROTRADERS FX TOKEN EXCHANGE START"
  );


  const response =
    await fetch(
      OAUTH_TOKEN_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded",

          "Accept":
            "application/json"
        },

        body:
          body.toString()
      }
    );


  const text =
    await response.text();


  let data;

  try {

    data =
      JSON.parse(text);

  } catch {

    data = {
      raw: text
    };
  }


  console.log(
    "TOKEN RESPONSE STATUS:",
    response.status
  );


  if (
    !response.ok
  ) {

    console.error(
      "TOKEN EXCHANGE FAILED:",
      data
    );

    throw new Error(
      data.error_description ||
      data.error ||
      "Token exchange failed"
    );
  }


  if (
    !data.access_token
  ) {

    console.error(
      "TOKEN RESPONSE DID NOT CONTAIN ACCESS TOKEN:",
      data
    );

    throw new Error(
      "No access token returned by Deriv"
    );
  }


  console.log(
    "PROTRADERS FX ACCESS TOKEN RECEIVED"
  );


  return data;
}


/* =========================================================
   DERIV ACCOUNT REQUEST
========================================================= */

async function getAccountData(
  accessToken
) {

  /*
   * Deriv's authenticated account information
   * is requested with the OAuth bearer token.
   *
   * We try the current REST account endpoint first.
   */

  const endpoints = [

    "https://api.derivws.com/trading/v1/options/accounts",

    "https://api.derivws.com/trading/v1/options/account",

    "https://api.derivws.com/trading/v1/options/balance"
  ];


  let lastError = null;


  for (
    const endpoint of endpoints
  ) {

    try {

      console.log(
        "PROTRADERS FX ACCOUNT REQUEST:",
        endpoint
      );


      const response =
        await fetch(
          endpoint,
          {

            method:
              "GET",

            headers: {

              "Authorization":
                `Bearer ${accessToken}`,

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
          JSON.parse(text);

      } catch {

        data = {
          raw: text
        };
      }


      console.log(
        "ACCOUNT RESPONSE STATUS:",
        response.status
      );


      if (
        response.ok
      ) {

        return normalizeAccounts(
          data
        );
      }


      lastError =
        new Error(
          data.message ||
          data.error ||
          `Account request failed: ${response.status}`
        );


    } catch (error) {

      lastError =
        error;

      console.error(
        "ACCOUNT REQUEST ERROR:",
        error
      );
    }
  }


  /*
   * If REST account discovery is unavailable,
   * return an empty account set rather than
   * exposing the access token.
   */

  console.error(
    "ALL ACCOUNT ENDPOINTS FAILED:",
    lastError
  );


  return {

    accounts: [],

    accountId: null,

    balance: null,

    currency: null,

    accountType: null,

    status: null
  };
}


/* =========================================================
   NORMALIZE ACCOUNT RESPONSE
========================================================= */

function normalizeAccounts(
  data
) {

  console.log(
    "PROTRADERS FX NORMALIZING ACCOUNT DATA"
  );


  let rawAccounts = [];


  if (
    Array.isArray(data)
  ) {

    rawAccounts =
      data;

  } else if (
    Array.isArray(data.accounts)
  ) {

    rawAccounts =
      data.accounts;

  } else if (
    Array.isArray(
      data.data
    )
  ) {

    rawAccounts =
      data.data;

  } else if (
    data.account
  ) {

    rawAccounts =
      [data.account];

  } else if (
    data.data &&
    typeof data.data ===
      "object"
  ) {

    rawAccounts =
      [data.data];

  } else if (
    data.accountId ||
    data.loginid ||
    data.login
  ) {

    rawAccounts =
      [data];
  }


  const accounts =
    rawAccounts
      .map(
        (account) => {

          if (
            !account ||
            typeof account !==
              "object"
          ) {
            return null;
          }


          const accountId =
            account.accountId ||
            account.account_id ||
            account.loginid ||
            account.login ||
            account.id ||
            null;


          const balance =
            account.balance ??
            account.available_balance ??
            account.amount ??
            null;


          const currency =
            account.currency ||
            account.currency_code ||
            null;


          let accountType =
            account.accountType ||
            account.account_type ||
            null;


          if (
            !accountType &&
            typeof accountId ===
              "string"
          ) {

            if (
              accountId.startsWith(
                "VRTC"
              )
            ) {
              accountType =
                "demo";
            }

            if (
              accountId.startsWith(
                "DOT"
              )
            ) {
              accountType =
                "demo";
            }

            if (
              accountId.startsWith(
                "CR"
              ) ||
              accountId.startsWith(
                "MTR"
              ) ||
              accountId.startsWith(
                "MF"
              )
            ) {
              accountType =
                "real";
            }
          }


          const status =
            account.status ||
            "active";


          return {

            accountId,

            balance,

            currency,

            accountType,

            status
          };
        }
      )
      .filter(
        Boolean
      );


  const primary =
    accounts[0] ||
    null;


  return {

    accounts,

    accountId:
      primary
        ? primary.accountId
        : null,

    balance:
      primary
        ? primary.balance
        : null,

    currency:
      primary
        ? primary.currency
        : null,

    accountType:
      primary
        ? primary.accountType
        : null,

    status:
      primary
        ? primary.status
        : null
  };
}


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
      "================================================"
    );

    console.log(
      "PROTRADERS FX OAUTH CALLBACK"
    );

    console.log(
      "================================================"
    );


    /* -----------------------------------------------------
       DERIV REJECTED AUTHORIZATION
    ----------------------------------------------------- */

    if (error) {

      console.error(
        "DERIV OAUTH ERROR:",
        error,
        error_description
      );


      return res.redirect(
        `/?oauth=error&message=${encodeURIComponent(
          error_description ||
          error ||
          "Deriv authorization failed"
        )}`
      );
    }


    /* -----------------------------------------------------
       CODE
    ----------------------------------------------------- */

    if (!code) {

      console.error(
        "OAUTH CALLBACK: NO CODE"
      );


      return res.redirect(
        "/?oauth=error&message=No%20authorization%20code%20returned"
      );
    }


    /* -----------------------------------------------------
       STATE
    ----------------------------------------------------- */

    const oauthState =
      consumeOAuthState(
        state
      );


    if (!oauthState) {

      console.error(
        "OAUTH CALLBACK: INVALID STATE"
      );


      return res.redirect(
        "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
      );
    }


    try {

      /* ---------------------------------------------------
         EXCHANGE CODE
      --------------------------------------------------- */

      const token =
        await exchangeCode(
          code,
          oauthState.verifier
        );


      const accessToken =
        token.access_token;


      /*
       * IMPORTANT:
       *
       * accessToken remains server-side.
       *
       * It is NEVER included in:
       *
       * - URL
       * - redirect
       * - JSON response
       * - browser cookie
       */


      /* ---------------------------------------------------
         ACCOUNT DATA
      --------------------------------------------------- */

      const accountData =
        await getAccountData(
          accessToken
        );


      console.log(
        "PROTRADERS FX ACCOUNT DATA:",
        {
          accountId:
            accountData.accountId,

          balance:
            accountData.balance,

          currency:
            accountData.currency,

          accountType:
            accountData.accountType,

          accounts:
            accountData.accounts.length
        }
      );


      /* ---------------------------------------------------
         CREATE SERVER SESSION
      --------------------------------------------------- */

      const sessionId =
        createSession({

          accessToken,

          tokenType:
            token.token_type ||
            "Bearer",

          refreshToken:
            token.refresh_token ||
            null,

          accountId:
            accountData.accountId,

          balance:
            accountData.balance,

          currency:
            accountData.currency,

          accountType:
            accountData.accountType,

          status:
            accountData.status,

          accounts:
            accountData.accounts,

          tokenExpiresIn:
            token.expires_in ||
            null
        });


      setSessionCookie(
        res,
        sessionId
      );


      console.log(
        "PROTRADERS FX SERVER SESSION CREATED"
      );


      console.log(
        "SESSION ACCOUNT:",
        accountData.accountId
      );


      console.log(
        "SESSION BALANCE:",
        accountData.balance
      );


      /* ---------------------------------------------------
         RETURN TO WEBSITE
      --------------------------------------------------- */

      return res.redirect(
        "/?oauth=success"
      );


    } catch (error) {

      console.error(
        "PROTRADERS FX OAUTH CALLBACK ERROR:",
        error
      );


      return res.redirect(
        `/?oauth=error&message=${encodeURIComponent(
          error.message ||
          "Unable to complete Deriv authentication"
        )}`
      );
    }
  }
);


/* =========================================================
   AUTHENTICATED ACCOUNT API
========================================================= */

app.get(
  "/api/deriv/account",
  (req, res) => {

    const session =
      getSession(req);


    if (!session) {

      return res.status(401).json({

        ok: false,

        authenticated:
          false,

        error:
          "Not authenticated"
      });
    }


    const data =
      session.data;


    return res.status(200).json({

      ok: true,

      authenticated:
        true,

      accountId:
        data.accountId,

      balance:
        data.balance,

      currency:
        data.currency,

      accountType:
        data.accountType,

      status:
        data.status,

      accounts:
        data.accounts || [],

      expiresAt:
        data.expiresAt
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
   FRONTEND JAVASCRIPT
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
   FRONTEND CSS
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
   LOCAL DEVELOPMENT
========================================================= */

if (
  require.main === module
) {

  app.listen(
    PORT,
    () => {

      console.log(
        "========================================"
      );

      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        `PORT: ${PORT}`
      );

      console.log(
        `BASE URL: ${BASE_URL}`
      );

      console.log(
        `CALLBACK: ${CALLBACK_URL}`
      );

      console.log(
        "========================================"
      );
    }
  );
}
