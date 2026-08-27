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

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const CLIENT_SECRET =
  process.env.DERIV_CLIENT_SECRET || "";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;

const TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";

/* =========================================================
   SIMPLE IN-MEMORY SESSION STORE
========================================================= */

const sessions = new Map();
const oauthStates = new Map();

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
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    baseUrl: BASE_URL,
    callback: CALLBACK_URL,
    oauthConfigured: Boolean(CLIENT_ID)
  });
});

/* =========================================================
   TRACKING
========================================================= */

app.post("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

app.get("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

/* =========================================================
   ANALYTICS
========================================================= */

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});

/* =========================================================
   PKCE
========================================================= */

function base64UrlEncode(value) {
  return Buffer
    .from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function createCodeVerifier() {
  return base64UrlEncode(
    crypto.randomBytes(32)
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

function createRandomId() {
  return crypto.randomBytes(32).toString("hex");
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
   COOKIE HELPERS
========================================================= */

function parseCookies(req) {
  const header = req.headers.cookie || "";

  const cookies = {};

  header
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");

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

function setCookie(
  res,
  name,
  value,
  options = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (options.maxAge !== undefined) {
    parts.push(
      `Max-Age=${Math.floor(options.maxAge)}`
    );
  }

  if (options.secure) {
    parts.push("Secure");
  }

  res.setHeader(
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
      maxAge: 0,
      secure: true
    }
  );
}

/* =========================================================
   SESSION
========================================================= */

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
    session.expiresAt &&
    Date.now() > session.expiresAt
  ) {
    sessions.delete(sessionId);
    return null;
  }

  return {
    id: sessionId,
    data: session
  };
}

/* =========================================================
   DERIV API REQUEST
========================================================= */

async function derivRequest(
  accessToken,
  payload
) {
  const response =
    await fetch(
      "https://api.deriv.com",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${accessToken}`
        },

        body:
          JSON.stringify(payload)
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
      `Deriv API returned invalid JSON: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Deriv API HTTP ${response.status}`
    );
  }

  if (data.error) {
    throw new Error(
      data.error.message ||
      "Deriv API error"
    );
  }

  return data;
}

/* =========================================================
   TOKEN EXCHANGE
========================================================= */

async function exchangeCodeForToken(
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
    "code",
    code
  );

  body.set(
    "redirect_uri",
    CALLBACK_URL
  );

  body.set(
    "client_id",
    CLIENT_ID
  );

  body.set(
    "code_verifier",
    verifier
  );

  if (CLIENT_SECRET) {
    body.set(
      "client_secret",
      CLIENT_SECRET
    );
  }

  const response =
    await fetch(
      TOKEN_URL,
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
      `OAuth token response was not JSON: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error_description ||
      data?.error ||
      `OAuth token exchange failed (${response.status})`
    );
  }

  if (
    !data.access_token &&
    !data.token
  ) {
    throw new Error(
      "OAuth token response did not contain an access token"
    );
  }

  return data;
}

/* =========================================================
   GET ACCOUNT INFORMATION
========================================================= */

async function getAccountInfo(
  accessToken
) {
  const data =
    await derivRequest(
      accessToken,
      {
        account_list: 1
      }
    );

  return data;
}

/* =========================================================
   GET BALANCE
========================================================= */

async function getBalance(
  accessToken
) {
  return derivRequest(
    accessToken,
    {
      balance: 1
    }
  );
}

/* =========================================================
   REFRESH ACCOUNT SESSION
========================================================= */

async function refreshAccount(
  session
) {
  if (!session) {
    return null;
  }

  const token =
    session.accessToken;

  if (!token) {
    return null;
  }

  const result = {
    accountId:
      session.accountId || null,

    balance:
      session.balance ?? null,

    currency:
      session.currency || null
  };

  try {
    const accountInfo =
      await getAccountInfo(
        token
      );

    if (
      accountInfo &&
      Array.isArray(
        accountInfo.account_list
      )
    ) {
      const accounts =
        accountInfo.account_list;

      let selected =
        null;

      if (session.accountId) {
        selected =
          accounts.find(
            (account) =>
              account.loginid ===
              session.accountId
          );
      }

      if (!selected) {
        selected =
          accounts.find(
            (account) =>
              account.is_virtual === 0
          ) ||
          accounts[0] ||
          null;
      }

      if (selected) {
        result.accountId =
          selected.loginid ||
          selected.account_id ||
          result.accountId;

        result.currency =
          selected.currency ||
          result.currency;
      }
    }
  } catch (error) {
    console.error(
      "ACCOUNT INFO ERROR:",
      error.message
    );
  }

  try {
    const balanceData =
      await getBalance(
        token
      );

    if (balanceData.balance) {
      result.balance =
        balanceData.balance.balance;

      result.currency =
        balanceData.balance.currency ||
        result.currency;
    }
  } catch (error) {
    console.error(
      "BALANCE ERROR:",
      error.message
    );
  }

  session.accountId =
    result.accountId;

  session.balance =
    result.balance;

  session.currency =
    result.currency;

  session.updatedAt =
    Date.now();

  return result;
}

/* =========================================================
   START OAUTH
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

    const stateId =
      createRandomId();

    const stateData =
      `${stateId}:${Date.now()}`;

    const signature =
      signState(stateData);

    const state =
      base64UrlEncode(
        `${stateData}:${signature}`
      );

    oauthStates.set(
      stateId,
      {
        verifier,
        createdAt: Date.now()
      }
    );

    const params =
      new URLSearchParams({
        client_id: CLIENT_ID,

        redirect_uri:
          CALLBACK_URL,

        response_type:
          "code",

        code_challenge:
          challenge,

        code_challenge_method:
          "S256",

        state
      });

    const authorizationUrl =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH START"
    );

    console.log(
      "Callback:",
      CALLBACK_URL
    );

    res.redirect(
      authorizationUrl
    );

  } catch (error) {
    console.error(
      "OAUTH START ERROR:",
      error
    );

    res.status(500).json({
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

      /* -----------------------------------------
         DERIV ERROR
      ----------------------------------------- */

      if (error) {
        console.error(
          "DERIV OAUTH ERROR:",
          error,
          error_description
        );

        return res.status(400).send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
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
max-width:520px;
padding:35px;
text-align:center;
">

<h2>Authentication Error</h2>

<p style="color:#9aa5b5">
${String(
  error_description ||
  error
).replace(
  /[<>&"]/g,
  (char) =>
    ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;"
    }[char])
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
">
RETURN TO PROTRADERS FX
</a>

</div>
</body>
</html>
`);
      }

      /* -----------------------------------------
         STATE
      ----------------------------------------- */

      if (!state) {
        return res.status(400).send(
          "Missing OAuth state."
        );
      }

      let decodedState;

      try {
        decodedState =
          Buffer
            .from(
              state,
              "base64url"
            )
            .toString("utf8");
      } catch {
        return res.status(400).send(
          "Invalid OAuth state."
        );
      }

      const pieces =
        decodedState.split(":");

      if (pieces.length < 3) {
        return res.status(400).send(
          "Invalid OAuth state."
        );
      }

      const stateId =
        pieces[0];

      const timestamp =
        pieces[1];

      const signature =
        pieces[pieces.length - 1];

      const stateData =
        `${stateId}:${timestamp}`;

      const expectedSignature =
        signState(stateData);

      if (
        !crypto.timingSafeEqual(
          Buffer.from(
            signature
          ),
          Buffer.from(
            expectedSignature
          )
        )
      ) {
        return res.status(400).send(
          "Invalid OAuth state signature."
        );
      }

      const stateRecord =
        oauthStates.get(
          stateId
        );

      if (!stateRecord) {
        return res.status(400).send(
          "OAuth session expired or was already used."
        );
      }

      oauthStates.delete(
        stateId
      );

      /* -----------------------------------------
         STATE EXPIRATION
      ----------------------------------------- */

      if (
        Date.now() -
          stateRecord.createdAt >
        10 * 60 * 1000
      ) {
        return res.status(400).send(
          "OAuth session expired. Please login again."
        );
      }

      /* -----------------------------------------
         CODE
      ----------------------------------------- */

      if (!code) {
        return res.status(400).send(
          "No authorization code was returned by Deriv."
        );
      }

      console.log(
        "PROTRADERS FX: authorization code received"
      );

      /* -----------------------------------------
         TOKEN EXCHANGE
      ----------------------------------------- */

      const tokenData =
        await exchangeCodeForToken(
          code,
          stateRecord.verifier
        );

      const accessToken =
        tokenData.access_token ||
        tokenData.token;

      if (!accessToken) {
        throw new Error(
          "No access token received from Deriv."
        );
      }

      console.log(
        "PROTRADERS FX: access token received"
      );

      /* -----------------------------------------
         CREATE SESSION
      ----------------------------------------- */

      const sessionId =
        createRandomId();

      const expiresIn =
        Number(
          tokenData.expires_in ||
          86400
        );

      const session = {
        accessToken,

        accountId: null,

        balance: null,

        currency: null,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now(),

        expiresAt:
          Date.now() +
          expiresIn * 1000
      };

      sessions.set(
        sessionId,
        session
      );

      /* -----------------------------------------
         GET ACCOUNT + BALANCE
      ----------------------------------------- */

      await refreshAccount(
        session
      );

      console.log(
        "PROTRADERS FX ACCOUNT:",
        session.accountId
      );

      console.log(
        "PROTRADERS FX BALANCE:",
        session.balance,
        session.currency
      );

      /* -----------------------------------------
         SESSION COOKIE
      ----------------------------------------- */

      setCookie(
        res,
        "protraders_session",
        sessionId,
        {
          maxAge: expiresIn,
          secure: true
        }
      );

      /* -----------------------------------------
         RETURN TO WEBSITE
      ----------------------------------------- */

      return res.redirect(
        "/?oauth=success"
      );

    } catch (error) {
      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      return res.status(500).send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
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

<p style="color:#9aa5b5">
${String(
  error.message ||
  "Authentication failed."
).replace(
  /[<>&"]/g,
  (char) =>
    ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;"
    }[char])
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
">
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
   SESSION API
========================================================= */

app.get(
  "/api/session",
  async (req, res) => {
    try {
      const found =
        getSession(req);

      if (!found) {
        return res.status(200).json({
          ok: true,
          authenticated: false,
          accountId: null,
          balance: null,
          currency: null,
          expiresAt: null
        });
      }

      const session =
        found.data;

      if (
        !session.accessToken
      ) {
        return res.status(200).json({
          ok: true,
          authenticated: false,
          accountId: null,
          balance: null,
          currency: null,
          expiresAt: null
        });
      }

      await refreshAccount(
        session
      );

      return res.status(200).json({
        ok: true,

        authenticated: true,

        accountId:
          session.accountId,

        balance:
          session.balance,

        currency:
          session.currency,

        expiresAt:
          session.expiresAt
      });

    } catch (error) {
      console.error(
        "SESSION ERROR:",
        error
      );

      return res.status(200).json({
        ok: true,
        authenticated: false,
        accountId: null,
        balance: null,
        currency: null,
        expiresAt: null
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
    const found =
      getSession(req);

    if (found) {
      sessions.delete(
        found.id
      );
    }

    clearCookie(
      res,
      "protraders_session"
    );

    res.redirect("/");
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
      service: "protraders-fx"
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

    res.sendFile(file);
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
      error: "Not found",
      path: req.path
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

if (require.main === module) {
  app.listen(
    PORT,
    () => {
      console.log(
        `ProTraders FX running on port ${PORT}`
      );
    }
  );
}
