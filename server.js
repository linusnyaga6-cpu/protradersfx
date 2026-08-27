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
  process.env.BASE_URL || "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

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

const DERIV_API_URL =
  "https://api.derivws.com";


/* =========================================================
   IN-MEMORY AUTH SESSION STORE
========================================================= */

const sessions = new Map();

const SESSION_TTL =
  7 * 24 * 60 * 60 * 1000;


/* =========================================================
   EXPRESS
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

  next();
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

      const key =
        part
          .slice(0, index)
          .trim();

      const value =
        part
          .slice(index + 1)
          .trim();

      cookies[key] =
        decodeURIComponent(value);
    });

  return cookies;
}


function setSessionCookie(res, sessionId) {

  res.setHeader(
    "Set-Cookie",
    [
      `protraders_session=${encodeURIComponent(sessionId)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${Math.floor(
        SESSION_TTL / 1000
      )}`
    ].join("; ")
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    [
      "protraders_session=",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );
}


function getSession(req) {

  const cookies =
    parseCookies(req);

  const sessionId =
    cookies.protraders_session;

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
    ...session
  };
}


/* =========================================================
   SESSION ID
========================================================= */

function createSessionId() {

  return crypto
    .randomBytes(32)
    .toString("hex");
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


function createOAuthState(
  verifier
) {

  const timestamp =
    Date.now().toString();

  const nonce =
    crypto
      .randomBytes(16)
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


function decodeOAuthState(
  state
) {

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

    if (
      parts.length !== 4
    ) {
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
      verifier,
      nonce
    };

  } catch (error) {

    console.error(
      "OAUTH STATE ERROR:",
      error
    );

    return null;
  }
}


/* =========================================================
   STATIC FRONTEND
========================================================= */

const ROOT =
  __dirname;

app.use(
  express.static(
    ROOT,
    {
      index: false
    }
  )
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
   PUBLIC CONFIG
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
   START OAUTH
========================================================= */

function startOAuth(
  req,
  res,
  signup
) {

  try {

    if (!CLIENT_ID) {

      return res
        .status(500)
        .json({

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


    if (signup) {

      params.set(
        "prompt",
        "registration"
      );
    }


    const authorizationUrl =
      `${DERIV_AUTH_URL}?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH REDIRECT"
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

    return res
      .status(500)
      .json({

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

    return startOAuth(
      req,
      res,
      false
    );
  }
);


/* =========================================================
   SIGNUP
========================================================= */

app.get(
  "/api/deriv/signup",
  (req, res) => {

    return startOAuth(
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
        "DERIV OAUTH ERROR:",
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
        "/?oauth=error&message=OAuth%20state%20missing"
      );
    }


    const stateData =
      decodeOAuthState(
        String(state)
      );


    if (!stateData) {

      return res.redirect(
        "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
      );
    }


    /* -----------------------------------------------------
       TOKEN EXCHANGE
    ----------------------------------------------------- */

    try {

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


      /* ---------------------------------------------------
         TOKEN NEVER SENT TO BROWSER
      --------------------------------------------------- */

      const accessToken =
        tokenData.access_token;

      const expiresIn =
        Number(
          tokenData.expires_in
        ) || 3600;


      /* ---------------------------------------------------
         CREATE SERVER SESSION
      --------------------------------------------------- */

      const sessionId =
        createSessionId();


      sessions.set(
        sessionId,
        {

          accessToken,

          tokenType:
            tokenData.token_type ||
            "Bearer",

          expiresAt:
            Date.now() +
            Math.max(
              expiresIn - 60,
              60
            ) *
              1000,

          createdAt:
            Date.now(),

          accounts: null,

          selectedAccountId:
            null
        }
      );


      setSessionCookie(
        res,
        sessionId
      );


      console.log(
        "PROTRADERS FX AUTHENTICATED"
      );


      /* ---------------------------------------------------
         IMPORTANT:
         Redirect WITHOUT the token.
      --------------------------------------------------- */

      return res.redirect(
        "/?oauth=success"
      );


    } catch (error) {

      console.error(
        "TOKEN EXCHANGE ERROR:",
        error
      );

      return res.redirect(
        `/?oauth=error&message=${encodeURIComponent(
          "Unable to complete Deriv authentication"
        )}`
      );
    }
  }
);


/* =========================================================
   DERIV REST HELPER
========================================================= */

async function derivRequest(
  session,
  endpoint,
  options = {}
) {

  const headers = {

    "Authorization":
      `Bearer ${session.accessToken}`,

    "Deriv-App-ID":
      CLIENT_ID,

    "Content-Type":
      "application/json",

    ...(options.headers || {})
  };


  const response =
    await fetch(
      `${DERIV_API_URL}${endpoint}`,
      {

        method:
          options.method ||
          "GET",

        headers,

        body:
          options.body
            ? JSON.stringify(
                options.body
              )
            : undefined
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


  if (
    !response.ok
  ) {

    const message =
      data?.errors?.[0]?.message ||
      data?.error ||
      "Deriv API request failed";

    const err =
      new Error(
        message
      );

    err.status =
      response.status;

    err.data =
      data;

    throw err;
  }


  return data;
}


/* =========================================================
   NORMALIZE ACCOUNT DATA
========================================================= */

function normalizeAccounts(
  data
) {

  let source =
    data?.data ??
    data?.accounts ??
    data;


  if (
    !Array.isArray(source)
  ) {

    if (
      source &&
      typeof source ===
        "object"
    ) {

      source =
        Object.values(
          source
        );
    }
  }


  if (
    !Array.isArray(source)
  ) {

    return [];
  }


  return source
    .map(
      (account) => {

        const accountId =
          account.accountId ||
          account.account_id ||
          account.id ||
          account.loginid ||
          null;

        const balance =
          account.balance ??
          account.amount ??
          null;

        const currency =
          account.currency ||
          "USD";

        const accountType =
          account.accountType ||
          account.account_type ||
          (
            String(
              accountId || ""
            ).startsWith("VRT")
              ? "demo"
              : String(
                  accountId || ""
                ).startsWith("DOT")
                ? "demo"
                : "real"
          );

        return {

          accountId:
            accountId
              ? String(
                  accountId
                )
              : null,

          balance:
            balance === null
              ? null
              : String(
                  balance
                ),

          currency:
            String(
              currency
            ),

          accountType:
            String(
              accountType
            ).toLowerCase(),

          status:
            account.status ||
            "active"
        };
      }
    )
    .filter(
      (account) =>
        account.accountId
    );
}


/* =========================================================
   FETCH AUTHENTICATED ACCOUNTS
========================================================= */

async function fetchAccounts(
  session
) {

  const data =
    await derivRequest(
      session,
      "/trading/v1/options/accounts"
    );

  return normalizeAccounts(
    data
  );
}


/* =========================================================
   AUTHENTICATED SESSION
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


    try {

      const accounts =
        await fetchAccounts(
          session
        );


      if (
        accounts.length === 0
      ) {

        return res.status(200).json({

          ok: true,

          authenticated:
            true,

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
            session.expiresAt
        });
      }


      let selected =
        null;


      if (
        session.selectedAccountId
      ) {

        selected =
          accounts.find(
            (account) =>
              account.accountId ===
              session.selectedAccountId
          );
      }


      if (!selected) {

        selected =
          accounts.find(
            (account) =>
              account.accountType ===
              "demo"
          ) ||
          accounts[0];
      }


      session.accounts =
        accounts;

      session.selectedAccountId =
        selected.accountId;


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          selected.accountId,

        balance:
          selected.balance,

        currency:
          selected.currency,

        accountType:
          selected.accountType,

        status:
          selected.status,

        accounts,

        expiresAt:
          session.expiresAt
      });


    } catch (error) {

      console.error(
        "SESSION ACCOUNT ERROR:",
        error
      );


      if (
        error.status === 401
      ) {

        sessions.delete(
          session.id
        );

        clearSessionCookie(
          res
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

          accounts:
            [],

          expiresAt:
            null
        });
      }


      return res.status(502).json({

        ok: false,

        authenticated:
          true,

        error:
          "Unable to retrieve Deriv account"
      });
    }
  }
);


/* =========================================================
   ACCOUNT SELECTION
========================================================= */

app.post(
  "/api/deriv/account",
  async (req, res) => {

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


    const requestedId =
      String(
        req.body?.accountId ||
        ""
      ).trim();


    if (!requestedId) {

      return res.status(400).json({

        ok: false,

        error:
          "accountId is required"
      });
    }


    try {

      const accounts =
        await fetchAccounts(
          session
        );


      const account =
        accounts.find(
          (item) =>
            item.accountId ===
            requestedId
        );


      if (!account) {

        return res.status(404).json({

          ok: false,

          error:
            "Account not found"
        });
      }


      session.accounts =
        accounts;

      session.selectedAccountId =
        account.accountId;


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          account.accountId,

        balance:
          account.balance,

        currency:
          account.currency,

        accountType:
          account.accountType,

        status:
          account.status,

        accounts,

        expiresAt:
          session.expiresAt
      });


    } catch (error) {

      console.error(
        "ACCOUNT SELECT ERROR:",
        error
      );

      return res.status(502).json({

        ok: false,

        error:
          "Unable to select Deriv account"
      });
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.get(
  "/api/deriv/logout",
  (req, res) => {

    const session =
      getSession(req);


    if (session) {

      sessions.delete(
        session.id
      );
    }


    clearSessionCookie(
      res
    );


    return res.redirect(
      "/"
    );
  }
);


/* =========================================================
   AUTHENTICATED ACCOUNT BALANCE
========================================================= */

app.get(
  "/api/deriv/balance",
  async (req, res) => {

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


    try {

      const accounts =
        await fetchAccounts(
          session
        );


      let account =
        null;


      if (
        session.selectedAccountId
      ) {

        account =
          accounts.find(
            (item) =>
              item.accountId ===
              session.selectedAccountId
          );
      }


      if (!account) {

        account =
          accounts.find(
            (item) =>
              item.accountType ===
              "demo"
          ) ||
          accounts[0];
      }


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          account?.accountId ||
          null,

        balance:
          account?.balance ||
          null,

        currency:
          account?.currency ||
          null,

        accountType:
          account?.accountType ||
          null,

        status:
          account?.status ||
          null,

        expiresAt:
          session.expiresAt
      });


    } catch (error) {

      console.error(
        "BALANCE ERROR:",
        error
      );


      return res.status(502).json({

        ok: false,

        authenticated:
          true,

        error:
          "Unable to retrieve balance"
      });
    }
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

module.exports =
  app;


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
        `ProTraders FX running on port ${PORT}`
      );
    }
  );
}
