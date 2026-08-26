require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");

const app = express();

const PORT = Number(process.env.PORT || 3000);

const BASE_URL = (
  process.env.BASE_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, "");

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "";

const DERIV_AFFILIATE_PARAM =
  process.env.DERIV_AFFILIATE_PARAM || "t";

const DERIV_AFFILIATE_TOKEN =
  process.env.DERIV_AFFILIATE_TOKEN || "";

const DERIV_AFFILIATE_ID =
  process.env.DERIV_AFFILIATE_ID || "";

const DERIV_CAMPAIGN =
  process.env.DERIV_CAMPAIGN || "protraders-fx";

const DERIV_SCOPE =
  process.env.DERIV_SCOPE || "trade";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const PUBLIC_DIR = __dirname;

let analyticsData = {
  visitors: 0,
  registrations: 0,
  events: []
};


/* =====================================================
   APP CONFIG
===================================================== */

app.set("trust proxy", 1);

app.disable("x-powered-by");


/* =====================================================
   HELPERS
===================================================== */

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function encryptionKey() {
  return crypto
    .createHash("sha256")
    .update(SESSION_SECRET)
    .digest();
}


function encrypt(value) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    encryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify(value),
      "utf8"
    ),
    cipher.final()
  ]);

  return [
    base64url(iv),
    base64url(cipher.getAuthTag()),
    base64url(encrypted)
  ].join(".");
}


function decrypt(token) {
  const parts =
    String(token || "").split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token");
  }

  const iv =
    Buffer.from(parts[0], "base64url");

  const tag =
    Buffer.from(parts[1], "base64url");

  const encrypted =
    Buffer.from(parts[2], "base64url");

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      iv
    );

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return JSON.parse(
    decrypted.toString("utf8")
  );
}


function pkceVerifier() {
  return base64url(
    crypto.randomBytes(64)
  );
}


function challenge(verifier) {
  return base64url(
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest()
  );
}


function hashIp(ip) {
  return crypto
    .createHash("sha256")
    .update(
      `${ip}|${SESSION_SECRET}`
    )
    .digest("hex")
    .slice(0, 16);
}


function getSession(req) {
  const token =
    req.cookies?.protraders_session;

  if (!token) {
    return null;
  }

  try {
    const session = decrypt(token);

    if (
      !session ||
      !session.accessToken
    ) {
      return null;
    }

    if (
      session.expiresAt &&
      Date.now() >=
        Number(session.expiresAt)
    ) {
      return null;
    }

    return session;

  } catch (error) {
    console.error(
      "SESSION DECRYPT ERROR:",
      error.message
    );

    return null;
  }
}


/* =====================================================
   CORS
===================================================== */

const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [BASE_URL];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);


/* =====================================================
   SECURITY
===================================================== */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [
          "'self'"
        ],

        connectSrc: [
          "'self'",
          "https://auth.deriv.com",
          "https://api.deriv.com",
          "https://api.derivws.com",
          "wss://*.derivws.com",
          "wss://*.deriv.com",
          "wss://ws.binaryws.com"
        ],

        scriptSrc: [
          "'self'"
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'"
        ],

        imgSrc: [
          "'self'",
          "data:",
          "https:"
        ],

        fontSrc: [
          "'self'",
          "data:",
          "https:"
        ],

        frameSrc: [
          "'self'",
          "https://auth.deriv.com",
          "https://*.deriv.com"
        ],

        frameAncestors: [
          "'none'"
        ],

        objectSrc: [
          "'none'"
        ],

        baseUri: [
          "'self'"
        ],

        formAction: [
          "'self'",
          "https://auth.deriv.com",
          "https://*.deriv.com"
        ]
      }
    },

    referrerPolicy: {
      policy:
        "strict-origin-when-cross-origin"
    }
  })
);


/* =====================================================
   BODY
===================================================== */

app.use(
  express.json({
    limit: "20kb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "20kb"
  })
);

app.use(cookieParser());


/* =====================================================
   RATE LIMIT
===================================================== */

const apiLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max: 120,

    standardHeaders: true,

    legacyHeaders: false
  });

app.use(
  "/api/",
  apiLimiter
);


/* =====================================================
   CONFIG
===================================================== */

app.get(
  "/api/config",
  (req, res) => {

    res.json({
      configured:
        Boolean(
          DERIV_CLIENT_ID
        ),

      partnerConfigured:
        Boolean(
          DERIV_AFFILIATE_TOKEN
        ),

      partnerParam:
        DERIV_AFFILIATE_PARAM,

      campaign:
        DERIV_CAMPAIGN,

      scope:
        DERIV_SCOPE
    });
  }
);


/* =====================================================
   HEALTH
===================================================== */

app.get(
  "/health",
  (req, res) => {

    res.json({
      ok: true,

      service:
        "protraders-fx",

      time:
        new Date().toISOString()
    });
  }
);


/* =====================================================
   ANALYTICS
===================================================== */

app.post(
  "/api/track",
  (req, res) => {

    const type =
      String(
        req.body?.type ||
        "page_view"
      ).slice(0, 40);

    if (type === "page_view") {
      analyticsData.visitors += 1;
    }

    analyticsData.events.push({
      type,

      at:
        new Date().toISOString(),

      ip:
        hashIp(req.ip),

      path:
        String(
          req.body?.path ||
          "/"
        ).slice(0, 200)
    });

    if (
      analyticsData.events.length >
      5000
    ) {
      analyticsData.events =
        analyticsData.events.slice(-5000);
    }

    res.status(204).end();
  }
);


app.get(
  "/api/analytics",
  (req, res) => {

    const registrations =
      analyticsData.events.filter(
        (event) =>
          event.type ===
          "registration_complete"
      ).length;

    const successful =
      analyticsData.events.filter(
        (event) =>
          event.type ===
            "oauth_login_success" ||
          event.type ===
            "oauth_signup_success"
      ).length;

    res.json({
      visitors:
        analyticsData.visitors,

      registrations:
        Math.max(
          analyticsData.registrations,
          registrations
        ),

      oauthSuccesses:
        successful,

      fundedAccounts:
        null
    });
  }
);


/* =====================================================
   OAUTH URL
===================================================== */

function buildDerivOAuthUrl(mode) {

  if (!DERIV_CLIENT_ID) {
    throw new Error(
      "DERIV_CLIENT_ID is not configured"
    );
  }

  const verifier =
    pkceVerifier();

  const state =
    encrypt({
      verifier,

      nonce:
        base64url(
          crypto.randomBytes(16)
        ),

      mode,

      iat:
        Date.now()
    });

  const params =
    new URLSearchParams();

  params.set(
    "response_type",
    "code"
  );

  params.set(
    "client_id",
    DERIV_CLIENT_ID
  );

  params.set(
    "redirect_uri",
    `${BASE_URL}/oauth/callback`
  );

  params.set(
    "scope",
    DERIV_SCOPE
  );

  params.set(
    "state",
    state
  );

  params.set(
    "code_challenge",
    challenge(verifier)
  );

  params.set(
    "code_challenge_method",
    "S256"
  );

  if (mode === "signup") {

    if (!DERIV_AFFILIATE_TOKEN) {
      throw new Error(
        "DERIV_AFFILIATE_TOKEN is not configured"
      );
    }

    params.set(
      "prompt",
      "registration"
    );

    params.set(
      DERIV_AFFILIATE_PARAM,
      DERIV_AFFILIATE_TOKEN
    );

    params.set(
      "utm_campaign",
      DERIV_CAMPAIGN
    );

    params.set(
      "utm_medium",
      "affiliate"
    );

    if (DERIV_AFFILIATE_ID) {
      params.set(
        "utm_source",
        DERIV_AFFILIATE_ID
      );
    }
  }

  return (
    "https://auth.deriv.com/oauth2/auth?" +
    params.toString()
  );
}


/* =====================================================
   SIGNUP
===================================================== */

app.get(
  "/api/deriv/signup",
  (req, res) => {

    try {

      const url =
        buildDerivOAuthUrl(
          "signup"
        );

      return res.redirect(url);

    } catch (error) {

      console.error(
        "DERIV SIGNUP ERROR:",
        error.message
      );

      return res.status(503).json({
        error:
          error.message
      });
    }
  }
);


/* =====================================================
   LOGIN
===================================================== */

app.get(
  "/api/deriv/login",
  (req, res) => {

    try {

      const url =
        buildDerivOAuthUrl(
          "login"
        );

      return res.redirect(url);

    } catch (error) {

      console.error(
        "DERIV LOGIN ERROR:",
        error.message
      );

      return res.status(503).json({
        error:
          error.message
      });
    }
  }
);


/* =====================================================
   OAUTH CALLBACK
===================================================== */

app.get(
  "/oauth/callback",
  async (req, res) => {

    try {

      if (req.query.error) {

        console.error(
          "DERIV OAUTH ERROR:",
          req.query.error,
          req.query.error_description || ""
        );

        return res.redirect(
          `/?oauth_error=${encodeURIComponent(
            String(req.query.error)
          )}`
        );
      }

      if (!req.query.state) {
        throw new Error(
          "Missing OAuth state"
        );
      }

      if (!req.query.code) {
        throw new Error(
          "Missing authorization code"
        );
      }

      const payload =
        decrypt(
          String(req.query.state)
        );

      if (
        !payload ||
        !payload.verifier ||
        !["login", "signup"].includes(
          payload.mode
        )
      ) {
        throw new Error(
          "Invalid OAuth state"
        );
      }

      if (
        Date.now() -
          Number(payload.iat || 0) >
        10 * 60 * 1000
      ) {
        throw new Error(
          "Expired OAuth state"
        );
      }

      const body =
        new URLSearchParams();

      body.set(
        "grant_type",
        "authorization_code"
      );

      body.set(
        "client_id",
        DERIV_CLIENT_ID
      );

      body.set(
        "code",
        String(req.query.code)
      );

      body.set(
        "code_verifier",
        payload.verifier
      );

      body.set(
        "redirect_uri",
        `${BASE_URL}/oauth/callback`
      );

      const tokenResponse =
        await fetch(
          "https://auth.deriv.com/oauth2/token",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/x-www-form-urlencoded",

              accept:
                "application/json"
            },

            body
          }
        );

      const tokenText =
        await tokenResponse.text();

      let token;

      try {
        token =
          JSON.parse(tokenText);
      } catch {
        token = {};
      }

      if (!tokenResponse.ok) {

        console.error(
          "DERIV TOKEN ERROR:",
          tokenResponse.status,
          tokenText
        );

        throw new Error(
          `Token exchange failed (${tokenResponse.status})`
        );
      }

      if (!token.access_token) {
        throw new Error(
          "No access token returned by Deriv"
        );
      }

      const expiresIn =
        Math.max(
          60,
          Number(
            token.expires_in || 3600
          )
        );

      const expiresAt =
        Date.now() +
        expiresIn * 1000;

      const sessionToken =
        encrypt({
          accessToken:
            token.access_token,

          refreshToken:
            token.refresh_token || null,

          expiresAt,

          createdAt:
            Date.now()
        });

      res.cookie(
        "protraders_session",
        sessionToken,
        {
          httpOnly: true,

          secure:
            BASE_URL.startsWith(
              "https://"
            ),

          sameSite: "lax",

          maxAge:
            expiresIn * 1000,

          path: "/"
        }
      );

      analyticsData.events.push({
        type:
          payload.mode === "signup"
            ? "oauth_signup_success"
            : "oauth_login_success",

        at:
          new Date().toISOString()
      });

      if (
        payload.mode === "signup"
      ) {
        analyticsData.registrations += 1;

        analyticsData.events.push({
          type:
            "registration_complete",

          at:
            new Date().toISOString()
        });
      }

      console.log(
        "DERIV OAUTH SUCCESS:",
        payload.mode
      );

      return res.redirect(
        "/?trading=1"
      );

    } catch (error) {

      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      return res.redirect(
        "/?oauth_error=oauth_failed"
      );
    }
  }
);


/* =====================================================
   SESSION
===================================================== */

app.get(
  "/api/session",
  (req, res) => {

    const session =
      getSession(req);

    if (!session) {

      res.clearCookie(
        "protraders_session",
        {
          httpOnly: true,

          secure:
            BASE_URL.startsWith(
              "https://"
            ),

          sameSite: "lax",

          path: "/"
        }
      );

      return res.json({
        authenticated: false
      });
    }

    return res.json({
      authenticated: true,

      expiresAt:
        Number(
          session.expiresAt
        )
    });
  }
);


/* =====================================================
   DERIV ACCOUNT INFORMATION
===================================================== */

app.get(
  "/api/deriv/account",
  async (req, res) => {

    try {

      const session =
        getSession(req);

      if (!session) {

        return res.status(401).json({
          authenticated: false,
          error:
            "LOGIN_REQUIRED"
        });
      }

      const response =
        await fetch(
          "https://api.deriv.com/api/account",
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${session.accessToken}`,

              Accept:
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

      if (!response.ok) {

        console.error(
          "DERIV ACCOUNT ERROR:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({
          authenticated: true,
          error:
            "DERIV_ACCOUNT_REQUEST_FAILED",
          details:
            data
        });
      }

      return res.json({
        authenticated: true,
        account: data
      });

    } catch (error) {

      console.error(
        "DERIV ACCOUNT REQUEST ERROR:",
        error
      );

      return res.status(500).json({
        authenticated: true,
        error:
          "DERIV_ACCOUNT_CONNECTION_FAILED"
      });
    }
  }
);


/* =====================================================
   PREFLIGHT
===================================================== */

app.get(
  "/api/preflight",
  (req, res) => {

    const redirectUri =
      `${BASE_URL}/oauth/callback`;

    const clientConfigured =
      Boolean(
        DERIV_CLIENT_ID &&
        !/^your_|^$/.test(
          DERIV_CLIENT_ID
        )
      );

    const partnerConfigured =
      Boolean(
        DERIV_AFFILIATE_TOKEN &&
        !/^your_|^$/.test(
          DERIV_AFFILIATE_TOKEN
        )
      );

    const secretConfigured =
      Boolean(
        process.env.SESSION_SECRET &&
        !/^replace-with-/.test(
          process.env.SESSION_SECRET
        )
      );

    res.json({

      productionBaseUrl:
        BASE_URL,

      redirectUri,

      https:
        BASE_URL.startsWith(
          "https://"
        ),

      oauthClientConfigured:
        clientConfigured,

      partnerTrackingConfigured:
        partnerConfigured,

      sessionSecretConfigured:
        secretConfigured,

      readyForControlledLiveTest:
        Boolean(
          BASE_URL.startsWith(
            "https://"
          ) &&
          clientConfigured &&
          secretConfigured
        )
    });
  }
);


/* =====================================================
   LOGOUT
===================================================== */

app.get(
  "/api/logout",
  (req, res) => {

    res.clearCookie(
      "protraders_session",
      {
        httpOnly: true,

        secure:
          BASE_URL.startsWith(
            "https://"
          ),

        sameSite: "lax",

        path: "/"
      }
    );

    res.redirect("/");
  }
);


/* =====================================================
   STATIC FILES
===================================================== */

app.get(
  "/style.css",
  (req, res) => {

    res.type("text/css");

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "style.css"
      )
    );
  }
);


app.get(
  "/app.js",
  (req, res) => {

    res.type(
      "application/javascript"
    );

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "app.js"
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
        PUBLIC_DIR,
        "tracker.js"
      )
    );
  }
);


app.use(
  express.static(
    PUBLIC_DIR
  )
);


/* =====================================================
   FRONTEND FALLBACK
===================================================== */

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );
  }
);


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (err, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      err
    );

    res.status(500).json({
      error:
        "Internal server error."
    });
  }
);


/* =====================================================
   LOCAL SERVER
===================================================== */

if (require.main === module) {

  app.listen(
    PORT,
    () => {

      console.log(
        `[PROTRADERS FX] running on ${BASE_URL}`
      );
    }
  );
}


module.exports = app;
