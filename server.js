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
  "CHANGE_THIS_SESSION_SECRET";

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

const SESSION_COOKIE =
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

      cookies[name] =
        decodeURIComponent(value);
    });

  return cookies;
}


/* =========================================================
   ENCRYPTION
========================================================= */

function encryptionKey() {

  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();
}


function encrypt(value) {

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

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(value),
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


function decrypt(value) {

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

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString("utf8");

  } catch (error) {

    console.error(
      "SESSION DECRYPT ERROR:",
      error.message
    );

    return null;
  }
}


function setSessionCookie(
  res,
  token,
  expiresAt
) {

  const payload =
    JSON.stringify({
      token,
      expiresAt
    });

  const encrypted =
    encrypt(payload);

  const maxAge =
    Math.max(
      0,
      Math.floor(
        (expiresAt - Date.now()) / 1000
      )
    );

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(
      encrypted
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}


function clearSessionCookie(res) {

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}


function getSession(req) {

  const cookies =
    parseCookies(req);

  const encrypted =
    cookies[SESSION_COOKIE];

  if (!encrypted) {
    return null;
  }

  const raw =
    decrypt(encrypted);

  if (!raw) {
    return null;
  }

  try {

    const session =
      JSON.parse(raw);

    if (
      !session.token ||
      !session.expiresAt
    ) {
      return null;
    }

    if (
      Date.now() >=
      Number(session.expiresAt)
    ) {
      return null;
    }

    return session;

  } catch {
    return null;
  }
}


/* =========================================================
   PKCE
========================================================= */

function base64Url(buffer) {

  return Buffer
    .from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}


function createVerifier() {

  return base64Url(
    crypto.randomBytes(48)
  );
}


function createChallenge(
  verifier
) {

  return base64Url(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}


function signState(data) {

  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(data)
    .digest("hex");
}


function createState(
  verifier
) {

  const timestamp =
    Date.now().toString();

  const data =
    `${timestamp}:${verifier}`;

  const signature =
    signState(data);

  return base64Url(
    Buffer.from(
      `${data}:${signature}`
    )
  );
}


function verifyState(state) {

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

    if (parts.length !== 3) {
      return null;
    }

    const timestamp =
      parts[0];

    const verifier =
      parts[1];

    const signature =
      parts[2];

    const data =
      `${timestamp}:${verifier}`;

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
      "STATE VERIFY ERROR:",
      error.message
    );

    return null;
  }
}


/* =========================================================
   DERIV API
========================================================= */

async function derivRequest(
  endpoint,
  token,
  options = {}
) {

  const response =
    await fetch(
      `${DERIV_API}${endpoint}`,
      {
        method:
          options.method || "GET",

        headers: {
          "Authorization":
            `Bearer ${token}`,

          "Deriv-App-ID":
            CLIENT_ID,

          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {})
        },

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

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
  };
}


/* =========================================================
   GET ACCOUNTS
========================================================= */

async function getAccounts(
  token
) {

  return derivRequest(
    "/trading/v1/options/accounts",
    token
  );
}


/* =========================================================
   NORMALIZE ACCOUNTS
========================================================= */

function normalizeAccounts(
  response
) {

  if (
    !response ||
    !response.data
  ) {
    return [];
  }

  const data =
    response.data;

  let accounts = [];

  if (
    Array.isArray(data)
  ) {

    accounts =
      data;

  } else if (
    Array.isArray(data.data)
  ) {

    accounts =
      data.data;

  } else if (
    Array.isArray(
      data.accounts
    )
  ) {

    accounts =
      data.accounts;
  }

  return accounts.map(
    (account) => {

      const accountId =
        account.account_id ||
        account.accountId ||
        account.loginid ||
        account.login_id ||
        null;

      return {

        accountId,

        balance:
          account.balance !==
          undefined
            ? account.balance
            : null,

        currency:
          account.currency ||
          null,

        accountType:
          account.account_type ||
          account.accountType ||
          account.type ||
          null,

        status:
          account.status ||
          null,

        group:
          account.group ||
          null
      };
    }
  );
}


/* =========================================================
   SELECT DEFAULT ACCOUNT
========================================================= */

function selectAccount(
  accounts,
  requestedId
) {

  if (!accounts.length) {
    return null;
  }

  if (requestedId) {

    const requested =
      accounts.find(
        (account) =>
          account.accountId ===
          requestedId
      );

    if (requested) {
      return requested;
    }
  }

  const demo =
    accounts.find(
      (account) =>
        String(
          account.accountType
        ).toLowerCase() ===
        "demo"
    );

  if (demo) {
    return demo;
  }

  return accounts[0];
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

    res.json({

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
   OAUTH LOGIN
========================================================= */

function startOAuth(
  req,
  res,
  signup = false
) {

  try {

    const verifier =
      createVerifier();

    const challenge =
      createChallenge(
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

    const url =
      `${DERIV_AUTH_URL}?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH REDIRECT:",
      CALLBACK_URL
    );

    res.redirect(url);

  } catch (error) {

    console.error(
      "OAUTH START ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        "Unable to start authentication"
    });
  }
}


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

    try {

      const {
        code,
        state,
        error,
        error_description
      } = req.query;


      /* ---------------------------------------------------
         DERIV DENIED ACCESS
      --------------------------------------------------- */

      if (error) {

        console.error(
          "DERIV AUTH ERROR:",
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


      /* ---------------------------------------------------
         CODE
      --------------------------------------------------- */

      if (!code) {

        return res.redirect(
          "/?oauth=error&message=No%20authorization%20code"
        );
      }


      /* ---------------------------------------------------
         STATE
      --------------------------------------------------- */

      if (!state) {

        return res.redirect(
          "/?oauth=error&message=Missing%20OAuth%20state"
        );
      }


      const stateData =
        verifyState(state);


      if (!stateData) {

        return res.redirect(
          "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
        );
      }


      /* ---------------------------------------------------
         TOKEN EXCHANGE
      --------------------------------------------------- */

      console.log(
        "PROTRADERS FX: exchanging OAuth code"
      );


      const tokenResponse =
        await fetch(
          DERIV_TOKEN_URL,
          {
            method: "POST",

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
          raw:
            tokenText
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


      const expiresIn =
        Number(
          tokenData.expires_in
        ) || 3600;


      const expiresAt =
        Date.now() +
        (
          expiresIn *
          1000
        );


      /* ---------------------------------------------------
         VERIFY TOKEN BY GETTING ACCOUNTS
      --------------------------------------------------- */

      console.log(
        "PROTRADERS FX: checking authenticated accounts"
      );


      const accountsResponse =
        await getAccounts(
          accessToken
        );


      if (
        !accountsResponse.ok
      ) {

        console.error(
          "ACCOUNT REQUEST FAILED:",
          accountsResponse
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            "Authentication succeeded but account access failed"
          )}`
        );
      }


      const accounts =
        normalizeAccounts(
          accountsResponse
        );


      if (!accounts.length) {

        console.error(
          "NO DERIV ACCOUNTS RETURNED"
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            "No trading accounts were returned by Deriv"
          )}`
        );
      }


      /* ---------------------------------------------------
         SAVE ENCRYPTED SERVER SESSION
      --------------------------------------------------- */

      setSessionCookie(
        res,
        accessToken,
        expiresAt
      );


      const selected =
        selectAccount(
          accounts,
          null
        );


      console.log(
        "PROTRADERS FX AUTHENTICATED:",
        selected
          ? selected.accountId
          : "unknown"
      );


      /*
       * IMPORTANT:
       *
       * The access token is NOT placed
       * in the URL.
       *
       * The frontend receives only:
       *
       * /?oauth=success
       *
       * The HttpOnly cookie is sent
       * automatically with subsequent
       * requests to ProTraders FX.
       */

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
          "Unable to complete Deriv authentication"
        )}`
      );
    }
  }
);


/* =========================================================
   AUTH STATUS
========================================================= */

app.get(
  "/api/auth/status",
  async (req, res) => {

    try {

      const session =
        getSession(req);


      if (!session) {

        return res.json({

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


      const accountsResponse =
        await getAccounts(
          session.token
        );


      if (
        accountsResponse.status ===
        401
      ) {

        clearSessionCookie(
          res
        );

        return res.json({

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


      if (
        !accountsResponse.ok
      ) {

        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            "Unable to retrieve Deriv account data"
        });
      }


      const accounts =
        normalizeAccounts(
          accountsResponse
        );


      const requestedAccount =
        req.query.accountId ||
        null;


      const selected =
        selectAccount(
          accounts,
          requestedAccount
        );


      return res.json({

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

        accounts,

        expiresAt:
          session.expiresAt
      });


    } catch (error) {

      console.error(
        "AUTH STATUS ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          false,

        error:
          "Unable to check authentication"
      });
    }
  }
);


/* =========================================================
   ACCOUNT DATA
========================================================= */

app.get(
  "/api/account",
  async (req, res) => {

    try {

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


      const response =
        await getAccounts(
          session.token
        );


      if (
        response.status ===
        401
      ) {

        clearSessionCookie(
          res
        );

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Deriv session expired"
        });
      }


      if (
        !response.ok
      ) {

        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            "Unable to retrieve account data"
        });
      }


      const accounts =
        normalizeAccounts(
          response
        );


      const selected =
        selectAccount(
          accounts,
          req.query.accountId ||
            null
        );


      return res.json({

        ok: true,

        authenticated:
          true,

        account:
          selected,

        accounts,

        expiresAt:
          session.expiresAt
      });


    } catch (error) {

      console.error(
        "ACCOUNT API ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        error:
          "Unable to retrieve account"
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

    clearSessionCookie(
      res
    );

    res.redirect(
      "/?logout=success"
    );
  }
);


/* =========================================================
   TRACKING
========================================================= */

app.post(
  "/api/track",
  (req, res) => {

    res.json({
      ok: true
    });
  }
);


app.get(
  "/api/track",
  (req, res) => {

    res.json({
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

    res.json({

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

    res.json({

      ok: true,

      service:
        "protraders-fx"
    });
  }
);


/* =========================================================
   FRONTEND FILES
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
