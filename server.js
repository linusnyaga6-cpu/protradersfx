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
    "https://www.protradersfx.com").replace(/\/$/, "");

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


/* =========================================================
   SERVER-SIDE SESSION STORE
========================================================= */

/*
 * IMPORTANT:
 *
 * The Deriv access token is NEVER sent to the browser.
 *
 * The browser receives only a random session ID in an
 * HttpOnly cookie.
 *
 * The actual access token remains in this server-side
 * session store.
 *
 * Vercel functions can be restarted, so this is an
 * in-memory session store. For persistent login across
 * cold starts, a database/KV store should later be added.
 */

const sessions = new Map();

const SESSION_COOKIE =
  "protraders_session";


/* =========================================================
   SESSION CLEANUP
========================================================= */

function cleanupSessions() {

  const now =
    Date.now();

  for (
    const [sessionId, session] of sessions.entries()
  ) {

    if (
      !session ||
      !session.expiresAt ||
      session.expiresAt <= now
    ) {

      sessions.delete(
        sessionId
      );
    }
  }
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
   COOKIE PARSER
========================================================= */

function getCookies(req) {

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


/* =========================================================
   SET SESSION COOKIE
========================================================= */

function setSessionCookie(
  res,
  sessionId
) {

  const cookie =
    [
      `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=86400"
    ].join("; ");

  res.setHeader(
    "Set-Cookie",
    cookie
  );
}


/* =========================================================
   CLEAR SESSION COOKIE
========================================================= */

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


/* =========================================================
   GET CURRENT SESSION
========================================================= */

function getSession(req) {

  cleanupSessions();

  const cookies =
    getCookies(req);

  const sessionId =
    cookies[SESSION_COOKIE];

  if (!sessionId) {
    return null;
  }

  const session =
    sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (
    session.expiresAt <=
    Date.now()
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


/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use(
  (req, res, next) => {

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
  }
);


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
   PKCE
========================================================= */

function base64UrlEncode(
  value
) {

  return Buffer
    .from(value)
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

function createState(
  verifier
) {

  const timestamp =
    Date.now().toString();

  const data =
    `${timestamp}:${verifier}`;

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
      parts.length !== 3
    ) {

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
      error
    );

    return null;
  }
}


/* =========================================================
   OAUTH START
========================================================= */

function startOAuth(
  req,
  res
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
      createState(
        verifier
      );

    const params =
      new URLSearchParams();

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

    /*
     * trade is required to retrieve Options accounts
     * and to use the authenticated trading API.
     */

    params.set(
      "scope",
      "trade account_manage"
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

    const authorizationUrl =
      `${DERIV_AUTH_URL}?${params.toString()}`;

    console.log(
      "======================================"
    );

    console.log(
      "PROTRADERS FX OAUTH START"
    );

    console.log(
      "CLIENT ID:",
      CLIENT_ID
    );

    console.log(
      "CALLBACK:",
      CALLBACK_URL
    );

    console.log(
      "======================================"
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
  startOAuth
);


/* =========================================================
   SIGNUP
========================================================= */

app.get(
  "/api/deriv/signup",
  (req, res) => {

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
        createState(
          verifier
        );

      const params =
        new URLSearchParams();

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
        "scope",
        "trade account_manage"
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

      params.set(
        "prompt",
        "registration"
      );

      const signupUrl =
        `${DERIV_AUTH_URL}?${params.toString()}`;

      return res.redirect(
        signupUrl
      );

    } catch (error) {

      console.error(
        "SIGNUP ERROR:",
        error
      );

      return res
        .status(500)
        .json({

          ok: false,

          error:
            "Unable to start signup"

        });
    }
  }
);


/* =========================================================
   DERIV API HELPER
========================================================= */

async function derivRequest(
  endpoint,
  options,
  accessToken
) {

  const requestOptions =
    options || {};

  const headers = {
    ...(requestOptions.headers || {}),

    "Authorization":
      `Bearer ${accessToken}`,

    "Deriv-App-ID":
      CLIENT_ID,

    "Content-Type":
      "application/json"
  };

  const response =
    await fetch(
      `${DERIV_API}${endpoint}`,
      {
        ...requestOptions,
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
   GET ACCOUNTS FROM DERIV
========================================================= */

async function getAccounts(
  accessToken
) {

  const result =
    await derivRequest(
      "/trading/v1/options/accounts",
      {
        method: "GET"
      },
      accessToken
    );

  if (
    !result.response.ok
  ) {

    const message =
      result.data
        ?.errors
        ?.map(
          (e) =>
            e.message
        )
        .join("; ") ||
      "Unable to retrieve accounts";

    throw new Error(
      message
    );
  }

  return result.data;
}


/* =========================================================
   FIND ACCOUNT ID
========================================================= */

function extractAccounts(
  data
) {

  if (
    Array.isArray(data)
  ) {

    return data;
  }

  if (
    Array.isArray(data?.data)
  ) {

    return data.data;
  }

  if (
    Array.isArray(data?.accounts)
  ) {

    return data.accounts;
  }

  return [];
}


function findPreferredAccount(
  data
) {

  const accounts =
    extractAccounts(
      data
    );

  if (
    accounts.length === 0
  ) {

    return null;
  }

  /*
   * Prefer demo accounts first.
   * This means the dashboard can immediately show
   * the user's normal trading account without touching
   * a real account automatically.
   */

  const demo =
    accounts.find(
      (account) => {

        const text =
          JSON.stringify(
            account
          ).toLowerCase();

        return (
          text.includes("demo") ||
          text.includes("virtual")
        );
      }
    );

  return (
    demo ||
    accounts[0]
  );
}


/* =========================================================
   EXTRACT ACCOUNT ID
========================================================= */

function extractAccountId(
  account
) {

  if (!account) {
    return null;
  }

  return (
    account.account_id ||
    account.accountId ||
    account.loginid ||
    account.login_id ||
    account.id ||
    null
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
      "PROTRADERS FX OAUTH CALLBACK"
    );


    /* -----------------------------------------
       DERIV ERROR
    ----------------------------------------- */

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


    /* -----------------------------------------
       CODE
    ----------------------------------------- */

    if (!code) {

      return res.redirect(
        "/?oauth=error&message=No%20authorization%20code%20returned"
      );
    }


    /* -----------------------------------------
       STATE
    ----------------------------------------- */

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


    const verifier =
      stateData.verifier;


    /* -----------------------------------------
       EXCHANGE CODE
    ----------------------------------------- */

    try {

      console.log(
        "Exchanging authorization code..."
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
                  verifier

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


      /* -----------------------------------------
         TOKEN NEVER SENT TO BROWSER
      ----------------------------------------- */

      const accessToken =
        tokenData.access_token;

      const expiresIn =
        Number(
          tokenData.expires_in ||
          3600
        );


      /* -----------------------------------------
         CREATE SERVER SESSION
      ----------------------------------------- */

      const sessionId =
        createSessionId();


      const session = {

        accessToken,

        authenticated: true,

        createdAt:
          Date.now(),

        expiresAt:
          Date.now() +
          Math.max(
            60,
            expiresIn
          ) *
          1000,

        accountId:
          null,

        balance:
          null,

        currency:
          null,

        accounts:
          [],

        account:
          null

      };


      sessions.set(
        sessionId,
        session
      );


      setSessionCookie(
        res,
        sessionId
      );


      /* -----------------------------------------
         GET USER ACCOUNTS
      ----------------------------------------- */

      try {

        console.log(
          "Retrieving Deriv accounts..."
        );

        const accountsData =
          await getAccounts(
            accessToken
          );

        const accounts =
          extractAccounts(
            accountsData
          );

        const account =
          findPreferredAccount(
            accountsData
          );

        const accountId =
          extractAccountId(
            account
          );


        session.accounts =
          accounts;

        session.account =
          account;

        session.accountId =
          accountId;


        console.log(
          "DERIV ACCOUNT:",
          accountId
        );


        /* ---------------------------------------
           GET BALANCE
        --------------------------------------- */

        if (accountId) {

          try {

            const balance =
              await getDerivBalance(
                accessToken,
                accountId
              );

            if (balance) {

              session.balance =
                balance.balance;

              session.currency =
                balance.currency;
            }

          } catch (balanceError) {

            console.error(
              "BALANCE ERROR:",
              balanceError
            );
          }
        }

      } catch (accountError) {

        console.error(
          "ACCOUNT RETRIEVAL ERROR:",
          accountError
        );
      }


      console.log(
        "======================================"
      );

      console.log(
        "PROTRADERS FX AUTHENTICATED"
      );

      console.log(
        "ACCOUNT:",
        session.accountId
      );

      console.log(
        "BALANCE:",
        session.balance
      );

      console.log(
        "CURRENCY:",
        session.currency
      );

      console.log(
        "TOKEN STORED SERVER-SIDE: YES"
      );

      console.log(
        "======================================"
      );


      /* -----------------------------------------
         RETURN TO SITE
      ----------------------------------------- */

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
   BALANCE VIA AUTHENTICATED WEBSOCKET
========================================================= */

async function getDerivBalance(
  accessToken,
  accountId
) {

  /*
   * Step 1:
   * Request an authenticated WebSocket URL.
   */

  const otpResult =
    await derivRequest(
      `/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      {
        method: "POST"
      },
      accessToken
    );


  if (
    !otpResult.response.ok
  ) {

    const message =
      otpResult.data
        ?.errors
        ?.map(
          (e) =>
            e.message
        )
        .join("; ") ||
      "Unable to obtain WebSocket authentication";

    throw new Error(
      message
    );
  }


  const wsUrl =
    otpResult.data
      ?.data
      ?.url;


  if (!wsUrl) {

    throw new Error(
      "Deriv did not return a WebSocket URL"
    );
  }


  /*
   * Step 2:
   * Connect to the authenticated WebSocket.
   *
   * Node 18+ / current Vercel runtimes expose WebSocket.
   */

  if (
    typeof WebSocket ===
    "undefined"
  ) {

    throw new Error(
      "WebSocket is not available in this Node runtime"
    );
  }


  return new Promise(
    (resolve, reject) => {

      let settled =
        false;

      let socket;

      const timeout =
        setTimeout(
          () => {

            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            try {

              if (socket) {
                socket.close();
              }

            } catch {}

            reject(
              new Error(
                "Deriv balance request timed out"
              )
            );

          },
          10000
        );


      try {

        socket =
          new WebSocket(
            wsUrl
          );

      } catch (error) {

        clearTimeout(
          timeout
        );

        reject(
          error
        );

        return;
      }


      socket.onopen =
        () => {

          try {

            socket.send(
              JSON.stringify({
                balance: 1,
                req_id: 1
              })
            );

          } catch (error) {

            clearTimeout(
              timeout
            );

            if (!settled) {

              settled =
                true;

              reject(
                error
              );
            }
          }
        };


      socket.onmessage =
        (event) => {

          try {

            const message =
              JSON.parse(
                typeof event.data ===
                "string"
                  ? event.data
                  : String(
                      event.data
                    )
              );


            if (
              message.error
            ) {

              clearTimeout(
                timeout
              );

              if (!settled) {

                settled =
                  true;

                try {
                  socket.close();
                } catch {}

                reject(
                  new Error(
                    message.error.message ||
                    "Deriv balance error"
                  )
                );
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

              if (!settled) {

                settled =
                  true;

                const balance =
                  message.balance || {};

                try {
                  socket.close();
                } catch {}

                resolve({
                  balance:
                    balance.balance ??
                    null,

                  currency:
                    balance.currency ??
                    null
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


      socket.onerror =
        (error) => {

          clearTimeout(
            timeout
          );

          if (!settled) {

            settled =
              true;

            reject(
              new Error(
                "Deriv WebSocket connection failed"
              )
            );
          }
        };

    }
  );
}


/* =========================================================
   AUTHENTICATION STATUS
========================================================= */

app.get(
  "/api/deriv/status",
  async (req, res) => {

    const session =
      getSession(
        req
      );


    if (
      !session ||
      !session.data.accessToken
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


    const data =
      session.data;


    /*
     * Refresh account information if we don't have it.
     */

    if (
      !data.accountId
    ) {

      try {

        const accountsData =
          await getAccounts(
            data.accessToken
          );

        const accounts =
          extractAccounts(
            accountsData
          );

        const account =
          findPreferredAccount(
            accountsData
          );

        const accountId =
          extractAccountId(
            account
          );

        data.accounts =
          accounts;

        data.account =
          account;

        data.accountId =
          accountId;

      } catch (error) {

        console.error(
          "STATUS ACCOUNT ERROR:",
          error
        );
      }
    }


    /*
     * Refresh balance.
     */

    if (
      data.accountId
    ) {

      try {

        const balance =
          await getDerivBalance(
            data.accessToken,
            data.accountId
          );

        if (balance) {

          data.balance =
            balance.balance;

          data.currency =
            balance.currency;
        }

      } catch (error) {

        console.error(
          "STATUS BALANCE ERROR:",
          error
        );
      }
    }


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

      expiresAt:
        data.expiresAt

    });
  }
);


/* =========================================================
   ACCOUNTS
========================================================= */

app.get(
  "/api/deriv/accounts",
  async (req, res) => {

    const session =
      getSession(
        req
      );


    if (
      !session ||
      !session.data.accessToken
    ) {

      return res.status(401).json({

        ok: false,

        authenticated:
          false,

        error:
          "Not authenticated"

      });
    }


    try {

      const data =
        await getAccounts(
          session.data.accessToken
        );

      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        data

      });

    } catch (error) {

      console.error(
        "ACCOUNTS ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          true,

        error:
          error.message ||
          "Unable to retrieve accounts"

      });
    }
  }
);


/* =========================================================
   BALANCE
========================================================= */

app.get(
  "/api/deriv/balance",
  async (req, res) => {

    const session =
      getSession(
        req
      );


    if (
      !session ||
      !session.data.accessToken
    ) {

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


    try {

      if (
        !data.accountId
      ) {

        const accountsData =
          await getAccounts(
            data.accessToken
          );

        const account =
          findPreferredAccount(
            accountsData
          );

        data.account =
          account;

        data.accountId =
          extractAccountId(
            account
          );
      }


      if (
        !data.accountId
      ) {

        return res.status(404).json({

          ok: false,

          authenticated:
            true,

          error:
            "No Deriv trading account found"

        });
      }


      const balance =
        await getDerivBalance(
          data.accessToken,
          data.accountId
        );


      data.balance =
        balance.balance;

      data.currency =
        balance.currency;


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          data.accountId,

        balance:
          data.balance,

        currency:
          data.currency

      });

    } catch (error) {

      console.error(
        "BALANCE ENDPOINT ERROR:",
        error
      );

      return res.status(500).json({

        ok: false,

        authenticated:
          true,

        accountId:
          data.accountId,

        error:
          error.message ||
          "Unable to retrieve balance"

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
      getSession(
        req
      );

    if (session) {

      sessions.delete(
        session.id
      );
    }

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
  (
    err,
    req,
    res,
    next
  ) => {

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
