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
  process.env.BASE_URL ||
  "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret-change-this";

const PORT =
  process.env.PORT ||
  3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const DERIV_API_BASE =
  "https://api.derivws.com";

const DERIV_AUTH_BASE =
  "https://auth.deriv.com";


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
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {

  res.status(200).json({

    ok: true,

    oauthConfigured:
      Boolean(CLIENT_ID),

    baseUrl:
      BASE_URL,

    callback:
      CALLBACK_URL

  });

});


/* =========================================================
   COOKIE HELPERS
========================================================= */

const SESSION_COOKIE =
  "protraders_session";


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

      if (!key) {
        return;
      }

      cookies[key] =
        decodeURIComponent(value);

    });

  return cookies;
}


/* =========================================================
   ENCRYPTION
========================================================= */

function deriveKey() {

  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();

}


function encryptSession(data) {

  const iv =
    crypto.randomBytes(12);

  const key =
    deriveKey();

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

    const key =
      deriveKey();

    const decipher =
      crypto.createDecipheriv(
        "aes-256-gcm",
        key,
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


function setSessionCookie(res, session) {

  const encrypted =
    encryptSession(session);

  res.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${encodeURIComponent(encrypted)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=3600"
    ].join("; ")
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


function createCodeChallenge(verifier) {

  return base64UrlEncode(
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


/* =========================================================
   OAUTH STATE
========================================================= */

function createState(verifier) {

  const timestamp =
    Date.now().toString();

  const random =
    crypto
      .randomBytes(16)
      .toString("hex");

  const data =
    `${timestamp}:${random}:${verifier}`;

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

    const random =
      parts[1];

    const verifier =
      parts[2];

    const signature =
      parts[3];

    if (
      !timestamp ||
      !random ||
      !verifier ||
      !signature
    ) {
      return null;
    }

    const data =
      `${timestamp}:${random}:${verifier}`;

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
   OAUTH LOGIN
========================================================= */

function startOAuth(req, res) {

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

    const authorizationUrl =
      `${DERIV_AUTH_BASE}/oauth2/auth?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH START"
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
   DERIV REST HELPER
========================================================= */

async function derivFetch(
  endpoint,
  token,
  options = {}
) {

  const headers = {

    "Authorization":
      `Bearer ${token}`,

    "Deriv-App-ID":
      CLIENT_ID,

    "Content-Type":
      "application/json",

    ...(options.headers || {})

  };

  const response =
    await fetch(
      `${DERIV_API_BASE}${endpoint}`,
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
      JSON.parse(text);

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
   GET OPTIONS ACCOUNTS
========================================================= */

async function getOptionsAccounts(
  token
) {

  return derivFetch(
    "/trading/v1/options/accounts",
    token,
    {
      method: "GET"
    }
  );

}


/* =========================================================
   GET BALANCE USING AUTHENTICATED
   DERIV WEBSOCKET
========================================================= */

async function getBalance(
  token
) {

  const accountsResult =
    await getOptionsAccounts(
      token
    );

  if (
    !accountsResult.response.ok
  ) {

    return {

      ok: false,

      status:
        accountsResult.response.status,

      data:
        accountsResult.data

    };

  }


  const accountData =
    accountsResult.data &&
    accountsResult.data.data;


  let accounts = [];

  if (
    Array.isArray(accountData)
  ) {

    accounts =
      accountData;

  } else if (
    accountData &&
    Array.isArray(
      accountData.accounts
    )
  ) {

    accounts =
      accountData.accounts;

  } else if (
    accountData &&
    typeof accountData === "object"
  ) {

    accounts =
      Object.values(
        accountData
      ).filter(
        (item) =>
          item &&
          typeof item === "object"
      );

  }


  const firstAccount =
    accounts[0] || null;


  if (!firstAccount) {

    return {

      ok: true,

      accountId:
        null,

      balance:
        null,

      currency:
        null,

      accounts: []

    };

  }


  /*
   * If the account endpoint already
   * supplies a balance, use it.
   */

  const existingBalance =
    firstAccount.balance ??
    firstAccount.balance_amount ??
    null;

  const existingCurrency =
    firstAccount.currency ??
    null;

  const accountId =
    firstAccount.account_id ??
    firstAccount.accountId ??
    firstAccount.id ??
    firstAccount.loginid ??
    null;


  if (
    existingBalance !== null
  ) {

    return {

      ok: true,

      accountId,

      balance:
        existingBalance,

      currency:
        existingCurrency,

      accounts

    };

  }


  /*
   * The new Deriv API uses an
   * authenticated WebSocket for
   * account balance.
   *
   * First request an OTP.
   */

  if (!accountId) {

    return {

      ok: false,

      error:
        "Deriv returned an account but no account ID",

      accounts

    };

  }


  const otpResult =
    await derivFetch(
      `/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      token,
      {
        method: "POST"
      }
    );


  if (
    !otpResult.response.ok
  ) {

    return {

      ok: false,

      status:
        otpResult.response.status,

      error:
        "Unable to obtain authenticated WebSocket URL",

      details:
        otpResult.data,

      accounts

    };

  }


  const wsUrl =
    otpResult.data &&
    otpResult.data.data &&
    otpResult.data.data.url;


  if (!wsUrl) {

    return {

      ok: false,

      error:
        "Deriv did not return an authenticated WebSocket URL",

      details:
        otpResult.data,

      accounts

    };

  }


  /*
   * Node 18+ / modern Vercel runtimes
   * expose WebSocket.
   */

  if (
    typeof WebSocket ===
    "undefined"
  ) {

    return {

      ok: false,

      error:
        "Server WebSocket support is unavailable",

      accounts

    };

  }


  return new Promise(
    (resolve) => {

      let finished =
        false;

      let ws;

      const timeout =
        setTimeout(
          () => {

            if (finished) {
              return;
            }

            finished = true;

            try {

              if (ws) {
                ws.close();
              }

            } catch {}

            resolve({

              ok: false,

              error:
                "Timed out waiting for Deriv balance",

              accounts

            });

          },
          10000
        );


      try {

        ws =
          new WebSocket(
            wsUrl
          );


        ws.onopen =
          () => {

            ws.send(
              JSON.stringify({

                balance: 1,

                subscribe: 0,

                req_id: 1001

              })
            );

          };


        ws.onmessage =
          (event) => {

            try {

              const message =
                JSON.parse(
                  event.data
                );


              if (
                message.error
              ) {

                clearTimeout(
                  timeout
                );

                if (!finished) {

                  finished = true;

                  try {
                    ws.close();
                  } catch {}

                  resolve({

                    ok: false,

                    error:
                      message.error.message ||
                      "Deriv balance error",

                    details:
                      message.error,

                    accounts

                  });

                }

                return;
              }


              if (
                message.msg_type ===
                "balance"
              ) {

                clearTimeout(
                  timeout
                );

                if (!finished) {

                  finished = true;

                  try {
                    ws.close();
                  } catch {}


                  const balance =
                    message.balance ||
                    {};


                  resolve({

                    ok: true,

                    accountId:
                      balance.loginid ||
                      accountId,

                    balance:
                      balance.balance ??
                      null,

                    currency:
                      balance.currency ||
                      existingCurrency ||
                      null,

                    accounts

                  });

                }

              }

            } catch (error) {

              console.error(
                "BALANCE MESSAGE ERROR:",
                error
              );

            }

          };


        ws.onerror =
          (error) => {

            console.error(
              "DERIV BALANCE WS ERROR:",
              error
            );

            if (!finished) {

              clearTimeout(
                timeout
              );

              finished = true;

              resolve({

                ok: false,

                error:
                  "Authenticated Deriv WebSocket failed",

                accounts

              });

            }

          };


        ws.onclose =
          () => {

            if (!finished) {

              clearTimeout(
                timeout
              );

              finished = true;

              resolve({

                ok: false,

                error:
                  "Deriv closed the authenticated balance connection",

                accounts

              });

            }

          };


      } catch (error) {

        clearTimeout(
          timeout
        );

        if (!finished) {

          finished = true;

          resolve({

            ok: false,

            error:
              error.message,

            accounts

          });

        }

      }

    }
  );

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
      "PROTRADERS FX CALLBACK RECEIVED"
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
        "/?oauth=error&message=No%20authorization%20code%20returned"
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
      decodeState(
        state
      );


    if (!stateData) {

      return res.redirect(
        "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
      );

    }


    /* -----------------------------------------------------
       EXCHANGE CODE
    ----------------------------------------------------- */

    try {

      console.log(
        "PROTRADERS FX: EXCHANGING CODE"
      );


      const tokenResponse =
        await fetch(
          `${DERIV_AUTH_BASE}/oauth2/token`,
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


      /*
       * IMPORTANT:
       *
       * The access token is NEVER
       * returned to the browser.
       *
       * It is encrypted into an
       * HttpOnly cookie which JavaScript
       * cannot read.
       */

      const expiresIn =
        Number(
          tokenData.expires_in ||
          3600
        );


      const expiresAt =
        Date.now() +
        expiresIn * 1000;


      const session = {

        accessToken:
          tokenData.access_token,

        tokenType:
          tokenData.token_type ||
          "Bearer",

        expiresAt

      };


      setSessionCookie(
        res,
        session
      );


      console.log(
        "PROTRADERS FX OAUTH SUCCESS"
      );


      /*
       * Do not put token in URL.
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
          "Unable to complete authentication"
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

    const session =
      getSession(req);


    if (
      !session ||
      !session.accessToken
    ) {

      return res.status(200).json({

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
      session.expiresAt &&
      Date.now() >=
        session.expiresAt
    ) {

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

        expired:
          true

      });

    }


    try {

      const result =
        await getBalance(
          session.accessToken
        );


      if (!result.ok) {

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

          dataError:
            result.error ||
            "Unable to retrieve account data"

        });

      }


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          result.accountId,

        balance:
          result.balance,

        currency:
          result.currency,

        expiresAt:
          session.expiresAt

      });

    } catch (error) {

      console.error(
        "AUTH STATUS ERROR:",
        error
      );

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

        dataError:
          "Unable to retrieve account data"

      });

    }

  }
);


/* =========================================================
   ACCOUNT
========================================================= */

app.get(
  "/api/account",
  async (req, res) => {

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
      session.expiresAt &&
      Date.now() >=
        session.expiresAt
    ) {

      clearSessionCookie(
        res
      );

      return res.status(401).json({

        ok: false,

        authenticated:
          false,

        error:
          "Session expired"

      });

    }


    try {

      const result =
        await getOptionsAccounts(
          session.accessToken
        );


      if (
        !result.response.ok
      ) {

        if (
          result.response.status ===
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
              "Deriv authentication expired"

          });

        }


        return res.status(
          result.response.status
        ).json({

          ok: false,

          authenticated:
            true,

          error:
            "Unable to retrieve accounts",

          details:
            result.data

        });

      }


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accounts:
          result.data.data ||
          result.data

      });

    } catch (error) {

      console.error(
        "ACCOUNT ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          true,

        error:
          "Unable to retrieve account"

      });

    }

  }
);


/* =========================================================
   BALANCE
========================================================= */

app.get(
  "/api/account/balance",
  async (req, res) => {

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
      session.expiresAt &&
      Date.now() >=
        session.expiresAt
    ) {

      clearSessionCookie(
        res
      );

      return res.status(401).json({

        ok: false,

        authenticated:
          false,

        error:
          "Session expired"

      });

    }


    try {

      const result =
        await getBalance(
          session.accessToken
        );


      if (!result.ok) {

        return res.status(502).json({

          ok: false,

          authenticated:
            true,

          error:
            result.error ||
            "Unable to retrieve balance",

          details:
            result.details ||
            null

        });

      }


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          result.accountId,

        balance:
          result.balance,

        currency:
          result.currency,

        expiresAt:
          session.expiresAt

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
          "Unable to retrieve balance"

      });

    }

  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.get(
  "/api/auth/logout",
  (req, res) => {

    clearSessionCookie(
      res
    );

    return res.redirect(
      "/"
    );

  }
);


app.post(
  "/api/auth/logout",
  (req, res) => {

    clearSessionCookie(
      res
    );

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
