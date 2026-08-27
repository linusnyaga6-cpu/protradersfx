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
  "CHANGE-THIS-IN-VERCEL";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const AUTH_URL =
  "https://auth.deriv.com/oauth2/auth";

const TOKEN_URL =
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


/* =========================================================
   ENCRYPTED SESSION
========================================================= */

/*
 * The access token is NEVER returned to app.js.
 *
 * The browser only receives an encrypted,
 * HttpOnly cookie.
 *
 * The server decrypts the token when it needs
 * to communicate with Deriv.
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
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}


function decryptSession(value) {

  try {

    if (!value) {
      return null;
    }

    const parts =
      value.split(".");

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
        getEncryptionKey(),
        iv
      );

    decipher.setAuthTag(tag);

    const decrypted =
      Buffer.concat([
        decipher.update(
          encrypted
        ),
        decipher.final()
      ]);

    return JSON.parse(
      decrypted.toString("utf8")
    );

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
  session
) {

  const encrypted =
    encryptSession(session);

  const maxAge =
    Math.max(
      60,
      Math.floor(
        (session.expiresAt -
          Date.now()) /
        1000
      )
    );

  const cookie =
    [
      `${SESSION_COOKIE}=${encodeURIComponent(encrypted)}`,
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
    [
      `${SESSION_COOKIE}=`,
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

  return decryptSession(
    cookies[SESSION_COOKIE]
  );
}


/* =========================================================
   DERIV API HELPERS
========================================================= */

async function derivRequest(
  endpoint,
  token,
  options = {}
) {

  const headers = {
    "Authorization":
      `Bearer ${token}`,

    "Deriv-App-ID":
      String(CLIENT_ID),

    "Accept":
      "application/json"
  };

  if (options.body) {

    headers[
      "Content-Type"
    ] =
      "application/json";
  }

  const response =
    await fetch(
      `${DERIV_API}${endpoint}`,
      {
        method:
          options.method || "GET",

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
      text
        ? JSON.parse(text)
        : {};

  } catch {

    data = {
      raw: text
    };
  }

  return {
    response,
    data
  };
}


/* =========================================================
   GET AUTHENTICATED DERIV ACCOUNTS
========================================================= */

async function getDerivAccounts(token) {

  return derivRequest(
    "/trading/v1/options/accounts",
    token
  );
}


/* =========================================================
   BUILD ACCOUNT RESPONSE
========================================================= */

function normalizeAccounts(data) {

  let accounts = [];

  if (
    data &&
    Array.isArray(data.data)
  ) {

    accounts =
      data.data;

  } else if (
    data &&
    data.data &&
    typeof data.data === "object"
  ) {

    accounts = [
      data.data
    ];
  }

  return accounts
    .filter(Boolean)
    .map((account) => {

      return {

        accountId:
          account.account_id ||
          account.accountId ||
          null,

        balance:
          account.balance ??
          null,

        currency:
          account.currency ||
          null,

        accountType:
          account.account_type ||
          account.accountType ||
          null,

        status:
          account.status ||
          null,

        group:
          account.group ||
          null
      };
    });
}


/* =========================================================
   SELECT ACTIVE ACCOUNT
========================================================= */

function selectAccount(
  accounts
) {

  if (!accounts.length) {
    return null;
  }

  return (
    accounts.find(
      (account) =>
        account.status ===
        "active"
    ) ||
    accounts.find(
      (account) =>
        account.accountType ===
        "demo"
    ) ||
    accounts[0]
  );
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
            null
        });
      }


      if (
        !session.accessToken ||
        !session.expiresAt
      ) {

        clearSessionCookie(res);

        return res.json({

          ok: true,

          authenticated:
            false,

          accountId:
            null,

          balance:
            null,

          currency:
            null
        });
      }


      /*
       * OAuth tokens are short lived.
       */

      if (
        Date.now() >=
        session.expiresAt
      ) {

        clearSessionCookie(res);

        return res.json({

          ok: true,

          authenticated:
            false,

          expired:
            true,

          accountId:
            null,

          balance:
            null,

          currency:
            null
        });
      }


      const result =
        await getDerivAccounts(
          session.accessToken
        );


      /*
       * Token rejected by Deriv.
       */

      if (
        result.response.status ===
          401 ||
        result.response.status ===
          403
      ) {

        console.error(
          "DERIV SESSION REJECTED:",
          result.data
        );

        clearSessionCookie(res);

        return res.json({

          ok: true,

          authenticated:
            false,

          accountId:
            null,

          balance:
            null,

          currency:
            null
        });
      }


      if (
        !result.response.ok
      ) {

        console.error(
          "DERIV ACCOUNT REQUEST FAILED:",
          result.data
        );

        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            "Unable to retrieve Deriv account"
        });
      }


      const accounts =
        normalizeAccounts(
          result.data
        );

      const account =
        selectAccount(
          accounts
        );


      return res.json({

        ok: true,

        authenticated:
          true,

        accountId:
          account
            ? account.accountId
            : null,

        balance:
          account
            ? account.balance
            : null,

        currency:
          account
            ? account.currency
            : null,

        accountType:
          account
            ? account.accountType
            : null,

        status:
          account
            ? account.status
            : null,

        accounts:
          accounts.map(
            (item) => ({

              accountId:
                item.accountId,

              balance:
                item.balance,

              currency:
                item.currency,

              accountType:
                item.accountType,

              status:
                item.status
            })
          ),

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
   AUTHENTICATED ACCOUNT DATA
========================================================= */

app.get(
  "/api/account",
  async (req, res) => {

    try {

      const session =
        getSession(req);

      if (
        !session ||
        !session.accessToken
      ) {

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Not authenticated"
        });
      }


      if (
        Date.now() >=
        session.expiresAt
      ) {

        clearSessionCookie(res);

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Session expired"
        });
      }


      const result =
        await getDerivAccounts(
          session.accessToken
        );


      if (
        !result.response.ok
      ) {

        if (
          result.response.status ===
            401 ||
          result.response.status ===
            403
        ) {

          clearSessionCookie(res);

          return res.status(401).json({

            ok: false,

            authenticated:
              false,

            error:
              "Deriv authentication expired"
          });
        }


        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            "Deriv account request failed"
        });
      }


      const accounts =
        normalizeAccounts(
          result.data
        );

      const account =
        selectAccount(
          accounts
        );


      return res.json({

        ok: true,

        authenticated:
          true,

        account:
          account || null,

        accounts
      });

    } catch (error) {

      console.error(
        "ACCOUNT API ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          false,

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

    return res.json({

      ok: true,

      authenticated:
        false
    });
  }
);


/* =========================================================
   PKCE
========================================================= */

function base64UrlEncode(
  buffer
) {

  return Buffer
    .from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}


function createCodeVerifier() {

  return base64UrlEncode(
    crypto.randomBytes(64)
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


function createState(
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
    crypto
      .createHmac(
        "sha256",
        SESSION_SECRET
      )
      .update(data)
      .digest("hex");

  return base64UrlEncode(
    Buffer.from(
      `${data}:${signature}`
    )
  );
}


function decodeState(
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
      crypto
        .createHmac(
          "sha256",
          SESSION_SECRET
        )
        .update(data)
        .digest("hex");


    if (
      signature.length !==
      expected.length
    ) {

      return null;
    }


    if (
      !crypto.timingSafeEqual(
        Buffer.from(
          signature
        ),
        Buffer.from(
          expected
        )
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
      age >
        10 * 60 * 1000
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

function startOAuth(
  req,
  res,
  signup = false
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
      `${AUTH_URL}?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH:"
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
        "/?oauth=error&message=Missing%20OAuth%20state"
      );
    }


    const stateData =
      decodeState(
        String(state)
      );


    if (!stateData) {

      console.error(
        "INVALID OAUTH STATE"
      );

      return res.redirect(
        "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
      );
    }


    /* -----------------------------------------------------
       TOKEN EXCHANGE
    ----------------------------------------------------- */

    try {

      const body =
        new URLSearchParams({

          grant_type:
            "authorization_code",

          client_id:
            CLIENT_ID,

          code:
            String(code),

          code_verifier:
            stateData.verifier,

          redirect_uri:
            CALLBACK_URL
        });


      const tokenResponse =
        await fetch(
          TOKEN_URL,
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


      /*
       * Deriv OAuth tokens are short-lived.
       * Store expiry time rather than trusting
       * a hard-coded duration.
       */

      const expiresIn =
        Number(
          tokenData.expires_in
        ) || 3600;


      const expiresAt =
        Date.now() +
        expiresIn * 1000;


      /* ---------------------------------------------------
         SAVE AUTHENTICATED SESSION
      --------------------------------------------------- */

      setSessionCookie(
        res,
        {
          accessToken:
            tokenData.access_token,

          expiresAt
        }
      );


      console.log(
        "PROTRADERS FX: TOKEN STORED IN SECURE SESSION"
      );


      /* ---------------------------------------------------
         VERIFY ACCOUNT BEFORE RETURNING
      --------------------------------------------------- */

      const accountResult =
        await getDerivAccounts(
          tokenData.access_token
        );


      if (
        accountResult.response.status ===
          401 ||
        accountResult.response.status ===
          403
      ) {

        console.error(
          "TOKEN AUTHENTICATED BUT ACCOUNT ACCESS FAILED:",
          accountResult.data
        );

        clearSessionCookie(
          res
        );

        return res.redirect(
          `/?oauth=error&message=${encodeURIComponent(
            "Deriv authorised the application, but account access was not granted"
          )}`
        );
      }


      if (
        !accountResult.response.ok
      ) {

        console.error(
          "ACCOUNT LOOKUP FAILED:",
          accountResult.data
        );

        /*
         * Keep the authenticated session.
         *
         * The frontend can retry /api/auth/status.
         */

        return res.redirect(
          "/?oauth=success"
        );
      }


      const accounts =
        normalizeAccounts(
          accountResult.data
        );

      const account =
        selectAccount(
          accounts
        );


      console.log(
        "PROTRADERS FX AUTHENTICATED ACCOUNT:",
        account
          ? account.accountId
          : "none"
      );


      /*
       * IMPORTANT:
       *
       * The access token is NOT put in:
       *
       * - URL
       * - localStorage
       * - sessionStorage
       * - JavaScript
       *
       * It stays inside the encrypted HttpOnly
       * session cookie.
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
   AUTHENTICATED OTP
========================================================= */

/*
 * This is needed later by the trading engine.
 *
 * The frontend asks our server for an OTP.
 * The Deriv OAuth token NEVER reaches app.js.
 */

app.post(
  "/api/deriv/otp",
  async (req, res) => {

    try {

      const session =
        getSession(req);


      if (
        !session ||
        !session.accessToken
      ) {

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Not authenticated"
        });
      }


      const accountId =
        String(
          req.body.accountId ||
          ""
        ).trim();


      if (!accountId) {

        return res.status(400).json({

          ok: false,

          error:
            "accountId is required"
        });
      }


      const result =
        await derivRequest(
          `/trading/v1/options/accounts/${encodeURIComponent(
            accountId
          )}/otp`,
          session.accessToken,
          {
            method:
              "POST"
          }
        );


      if (
        result.response.status ===
          401 ||
        result.response.status ===
          403
      ) {

        clearSessionCookie(
          res
        );

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Deriv authentication expired"
        });
      }


      if (
        !result.response.ok
      ) {

        console.error(
          "OTP ERROR:",
          result.data
        );

        return res.status(
          result.response.status
        ).json({

          ok: false,

          error:
            "Unable to create trading session",

          details:
            result.data
        });
      }


      /*
       * The returned WebSocket URL/OTP is
       * deliberately returned only for the
       * authenticated request.
       *
       * The OAuth access token remains server-side.
       */

      return res.json({

        ok: true,

        authenticated:
          true,

        data:
          result.data.data ||
          result.data
      });

    } catch (error) {

      console.error(
        "OTP ROUTE ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        error:
          "Unable to create trading session"
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
        "protraders-fx"
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
