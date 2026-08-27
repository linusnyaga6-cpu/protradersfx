"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   CONFIGURATION
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

const ROOT = __dirname;

const OAUTH_AUTHORIZE_URL =
  "https://auth.deriv.com/oauth2/auth";

const OAUTH_TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

const DERIV_API_URL =
  "https://api.derivws.com";

const REDIRECT_URI =
  `${BASE_URL}/oauth/callback`;


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
   COOKIE HELPERS
========================================================= */

const SESSION_COOKIE =
  "protraders_session";

const OAUTH_COOKIE =
  "protraders_oauth";


function parseCookies(req) {

  const header =
    req.headers.cookie || "";

  const cookies = {};

  header
    .split(";")
    .forEach(part => {

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


function setCookie(
  res,
  name,
  value,
  options = {}
) {

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/"
  ];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure !== false) {
    parts.push("Secure");
  }

  parts.push(
    `SameSite=${options.sameSite || "Lax"}`
  );

  if (options.maxAge !== undefined) {
    parts.push(
      `Max-Age=${options.maxAge}`
    );
  }

  res.append(
    "Set-Cookie",
    parts.join("; ")
  );
}


function clearCookie(res, name) {

  setCookie(
    res,
    name,
    "",
    {
      maxAge: 0
    }
  );
}


/* =========================================================
   ENCRYPTION
========================================================= */

function getEncryptionKey() {

  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();
}


function encryptObject(object) {

  const iv =
    crypto.randomBytes(12);

  const key =
    getEncryptionKey();

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  const plaintext =
    JSON.stringify(object);

  const encrypted =
    Buffer.concat([
      cipher.update(
        plaintext,
        "utf8"
      ),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}


function decryptObject(value) {

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

    const authTag =
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

    decipher.setAuthTag(
      authTag
    );

    const decrypted =
      Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

    return JSON.parse(
      decrypted.toString("utf8")
    );

  } catch (error) {

    console.error(
      "COOKIE DECRYPT ERROR:",
      error.message
    );

    return null;
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


function createState() {

  return base64UrlEncode(
    crypto.randomBytes(32)
  );
}


/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(
  express.static(ROOT, {
    index: false
  })
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
      service: "protraders-fx",
      time: new Date().toISOString()
    });

  }
);


/* =========================================================
   CONFIG
========================================================= */

app.get(
  "/api/config",
  (req, res) => {

    const cookies =
      parseCookies(req);

    const session =
      decryptObject(
        cookies[SESSION_COOKIE]
      );

    res.status(200).json({

      ok: true,

      baseUrl:
        BASE_URL,

      oauthConfigured:
        Boolean(CLIENT_ID),

      callback:
        REDIRECT_URI,

      authenticated:
        Boolean(
          session &&
          session.accessToken
        )

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
      service: "protraders-fx"
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
      createState();


    /*
     * Store the verifier and state
     * in an encrypted HTTP-only cookie.
     *
     * The verifier must survive the
     * redirect to Deriv.
     */

    const oauthSession =
      encryptObject({

        verifier,

        state,

        createdAt:
          Date.now()

      });


    setCookie(
      res,
      OAUTH_COOKIE,
      oauthSession,
      {
        maxAge: 600,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    );


    const params =
      new URLSearchParams({

        response_type:
          "code",

        client_id:
          CLIENT_ID,

        redirect_uri:
          REDIRECT_URI,

        scope:
          "trade",

        state,

        code_challenge:
          challenge,

        code_challenge_method:
          "S256"

      });


    /*
     * Signup must explicitly request
     * the registration screen.
     */

    if (
      req.path ===
      "/api/deriv/signup"
    ) {

      params.set(
        "prompt",
        "registration"
      );

    }


    const authorizationUrl =
      `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH START"
    );

    console.log(
      "REDIRECT URI:",
      REDIRECT_URI
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
   OAUTH TOKEN EXCHANGE
========================================================= */

async function exchangeCodeForToken(
  code,
  verifier
) {

  const body =
    new URLSearchParams({

      grant_type:
        "authorization_code",

      client_id:
        CLIENT_ID,

      code,

      code_verifier:
        verifier,

      redirect_uri:
        REDIRECT_URI

    });


  const response =
    await fetch(
      OAUTH_TOKEN_URL,
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

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      `Deriv token server returned invalid JSON: ${text}`
    );

  }


  if (
    !response.ok ||
    !data.access_token
  ) {

    console.error(
      "DERIV TOKEN ERROR:",
      data
    );

    throw new Error(
      data.error_description ||
      data.error ||
      "Token exchange failed"
    );

  }


  return data;
}


/* =========================================================
   GET DERIV ACCOUNTS
========================================================= */

async function getAccounts(
  accessToken
) {

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

    throw new Error(
      `Invalid accounts response: ${text}`
    );

  }


  if (!response.ok) {

    console.error(
      "DERIV ACCOUNTS ERROR:",
      data
    );

    throw new Error(
      data.message ||
      data.error ||
      "Unable to retrieve Deriv account"
    );

  }


  return data;
}


/* =========================================================
   EXTRACT ACCOUNT ID
========================================================= */

function findAccountId(
  data
) {

  /*
   * Deriv may return different
   * structures depending on the
   * current API response.
   */

  if (
    data &&
    Array.isArray(
      data.accounts
    ) &&
    data.accounts.length
  ) {

    const account =
      data.accounts[0];

    return (
      account.account_id ||
      account.accountId ||
      account.id ||
      account.loginid ||
      null
    );

  }


  if (
    data &&
    data.account
  ) {

    return (
      data.account.account_id ||
      data.account.accountId ||
      data.account.id ||
      data.account.loginid ||
      null
    );

  }


  return null;
}


/* =========================================================
   GET OTP FOR WEBSOCKET
========================================================= */

async function getWebSocketUrl(
  accessToken,
  accountId
) {

  const response =
    await fetch(
      `${DERIV_API_URL}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {

        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            CLIENT_ID,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({})

      }
    );


  const text =
    await response.text();


  let data;

  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      `Invalid OTP response: ${text}`
    );

  }


  if (!response.ok) {

    console.error(
      "DERIV OTP ERROR:",
      data
    );

    throw new Error(
      data.message ||
      data.error ||
      "Unable to authenticate trading connection"
    );

  }


  return (
    data.websocket_url ||
    data.ws_url ||
    data.url ||
    (
      data.data &&
      (
        data.data.websocket_url ||
        data.data.ws_url ||
        data.data.url
      )
    ) ||
    null
  );
}


/* =========================================================
   GET BALANCE THROUGH DERIV WEBSOCKET
========================================================= */

async function getBalance(
  websocketUrl
) {

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

      let socket;

      let finished = false;


      const timeout =
        setTimeout(
          () => {

            if (finished) {
              return;
            }

            finished = true;

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
          15000
        );


      function finish(
        error,
        result
      ) {

        if (finished) {
          return;
        }

        finished = true;

        clearTimeout(
          timeout
        );

        try {

          if (socket) {
            socket.close();
          }

        } catch {}

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }

      }


      try {

        socket =
          new WebSocket(
            websocketUrl
          );


        socket.addEventListener(
          "open",
          () => {

            socket.send(
              JSON.stringify({
                balance: 1,
                subscribe: 1
              })
            );

          }
        );


        socket.addEventListener(
          "message",
          event => {

            try {

              const raw =
                typeof event.data ===
                "string"
                  ? event.data
                  : Buffer
                      .from(
                        event.data
                      )
                      .toString();

              const data =
                JSON.parse(raw);


              if (
                data.error
              ) {

                finish(
                  new Error(
                    data.error.message ||
                    "Deriv balance error"
                  )
                );

                return;

              }


              if (
                data.balance
              ) {

                finish(
                  null,
                  data.balance
                );

              }

            } catch (error) {

              finish(
                error
              );

            }

          }
        );


        socket.addEventListener(
          "error",
          () => {

            finish(
              new Error(
                "Deriv WebSocket connection failed"
              )
            );

          }
        );


        socket.addEventListener(
          "close",
          () => {

            if (!finished) {

              finish(
                new Error(
                  "Deriv WebSocket closed before balance was received"
                )
              );

            }

          }
        );


      } catch (error) {

        finish(
          error
        );

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


    /* -----------------------------------------
       DERIV ERROR
    ----------------------------------------- */

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


      return res.status(400).send(`

<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>ProTraders FX</title>

</head>

<body style="
margin:0;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
">

<div style="
max-width:500px;
padding:35px;
text-align:center;
">

<h2>Authentication Error</h2>

<p style="
color:#9aa5b5;
">

${String(
  error_description ||
  error
)}

</p>

<a
href="/"
style="
display:inline-block;
margin-top:20px;
padding:12px 20px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
"
>
RETURN TO PROTRADERS FX
</a>

</div>

</body>

</html>

`);

    }


    /* -----------------------------------------
       REQUIRE CODE + STATE
    ----------------------------------------- */

    if (
      !code ||
      !state
    ) {

      return res.status(400).send(`

<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>ProTraders FX</title>

</head>

<body style="
margin:0;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
">

<div style="
max-width:500px;
padding:35px;
text-align:center;
">

<h2>Authentication Failed</h2>

<p style="color:#9aa5b5">

Deriv did not return a valid authorization code.

</p>

<a
href="/"
style="
display:inline-block;
margin-top:20px;
padding:12px 20px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
"
>
RETURN TO PROTRADERS FX
</a>

</div>

</body>

</html>

`);

    }


    try {

      /* ---------------------------------------
         RECOVER PKCE SESSION
      --------------------------------------- */

      const cookies =
        parseCookies(req);

      const oauthSession =
        decryptObject(
          cookies[OAUTH_COOKIE]
        );


      if (
        !oauthSession ||
        !oauthSession.verifier ||
        !oauthSession.state
      ) {

        throw new Error(
          "OAuth session expired. Please login again."
        );

      }


      /* ---------------------------------------
         VERIFY STATE
      --------------------------------------- */

      if (
        oauthSession.state !==
        state
      ) {

        throw new Error(
          "OAuth state validation failed."
        );

      }


      /* ---------------------------------------
         EXCHANGE CODE
      --------------------------------------- */

      console.log(
        "PROTRADERS FX: exchanging authorization code"
      );


      const tokenData =
        await exchangeCodeForToken(
          code,
          oauthSession.verifier
        );


      const accessToken =
        tokenData.access_token;


      /* ---------------------------------------
         GET ACCOUNT
      --------------------------------------- */

      console.log(
        "PROTRADERS FX: retrieving Deriv account"
      );


      const accounts =
        await getAccounts(
          accessToken
        );


      const accountId =
        findAccountId(
          accounts
        );


      /*
       * Store the OAuth token and account ID
       * inside an encrypted HTTP-only cookie.
       *
       * The token is NEVER sent to JavaScript.
       */

      const session =
        encryptObject({

          accessToken,

          accountId,

          expiresAt:
            Date.now() +
            (
              Number(
                tokenData.expires_in ||
                3600
              ) *
              1000
            )

        });


      setCookie(
        res,
        SESSION_COOKIE,
        session,
        {
          maxAge:
            Number(
              tokenData.expires_in ||
              3600
            ),
          httpOnly: true,
          secure: true,
          sameSite: "Lax"
        }
      );


      clearCookie(
        res,
        OAUTH_COOKIE
      );


      console.log(
        "PROTRADERS FX: OAuth login completed"
      );


      if (accountId) {

        console.log(
          "PROTRADERS FX ACCOUNT:",
          accountId
        );

      }


      /* ---------------------------------------
         SUCCESS
      --------------------------------------- */

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


      return res.status(500).send(`

<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>ProTraders FX</title>

</head>

<body style="
margin:0;
background:#070b12;
color:#f2f5f8;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
">

<div style="
max-width:600px;
padding:35px;
text-align:center;
">

<h2>Login Could Not Be Completed</h2>

<p style="
color:#9aa5b5;
">

${String(
  error.message ||
  "Unable to complete Deriv authentication."
)}

</p>

<a
href="/"
style="
display:inline-block;
margin-top:20px;
padding:12px 20px;
background:#16c784;
color:#04130d;
text-decoration:none;
font-weight:bold;
"
>
RETURN TO PROTRADERS FX
</a>

</div>

</body>

</html>

`);

    }

  }
);


/* =========================================================
   AUTHENTICATED ACCOUNT
========================================================= */

app.get(
  "/api/account",
  async (req, res) => {

    try {

      const cookies =
        parseCookies(req);

      const session =
        decryptObject(
          cookies[SESSION_COOKIE]
        );


      if (
        !session ||
        !session.accessToken
      ) {

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Not logged in"

        });

      }


      /* ---------------------------------------
         TOKEN EXPIRY
      --------------------------------------- */

      if (
        session.expiresAt &&
        Date.now() >
          session.expiresAt
      ) {

        clearCookie(
          res,
          SESSION_COOKIE
        );

        return res.status(401).json({

          ok: false,

          authenticated:
            false,

          error:
            "Session expired"

        });

      }


      /* ---------------------------------------
         GET ACCOUNT
      --------------------------------------- */

      const accounts =
        await getAccounts(
          session.accessToken
        );


      const accountId =
        session.accountId ||
        findAccountId(
          accounts
        );


      let balance =
        null;


      let currency =
        null;


      /*
       * The new Deriv API provides account
       * balance through an authenticated
       * WebSocket session.
       */

      if (accountId) {

        try {

          const websocketUrl =
            await getWebSocketUrl(
              session.accessToken,
              accountId
            );


          if (websocketUrl) {

            const balanceData =
              await getBalance(
                websocketUrl
              );


            balance =
              balanceData.balance ??
              null;

            currency =
              balanceData.currency ??
              null;

          }

        } catch (balanceError) {

          console.error(
            "BALANCE ERROR:",
            balanceError
          );

        }

      }


      return res.status(200).json({

        ok: true,

        authenticated:
          true,

        accountId:
          accountId || null,

        balance,

        currency,

        expiresAt:
          session.expiresAt || null

      });


    } catch (error) {

      console.error(
        "ACCOUNT ERROR:",
        error
      );


      return res.status(401).json({

        ok: false,

        authenticated:
          false,

        error:
          error.message ||
          "Unable to retrieve account"

      });

    }

  }
);


/* =========================================================
   SESSION STATUS
========================================================= */

app.get(
  "/api/session",
  (req, res) => {

    const cookies =
      parseCookies(req);

    const session =
      decryptObject(
        cookies[SESSION_COOKIE]
      );


    if (
      !session ||
      !session.accessToken
    ) {

      return res.status(200).json({

        ok: true,

        authenticated:
          false

      });

    }


    if (
      session.expiresAt &&
      Date.now() >
        session.expiresAt
    ) {

      clearCookie(
        res,
        SESSION_COOKIE
      );

      return res.status(200).json({

        ok: true,

        authenticated:
          false

      });

    }


    return res.status(200).json({

      ok: true,

      authenticated:
        true,

      accountId:
        session.accountId || null,

      expiresAt:
        session.expiresAt || null

    });

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

    return res.redirect(
      "/"
    );

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

    const file =
      path.join(
        ROOT,
        "app.js"
      );

    res.type(
      "application/javascript"
    );

    res.sendFile(
      file
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
