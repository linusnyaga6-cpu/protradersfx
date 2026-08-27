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
  (process.env.BASE_URL || "https://www.protradersfx.com").replace(/\/$/, "");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const CLIENT_SECRET =
  process.env.DERIV_CLIENT_SECRET || "";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
  `${BASE_URL}/oauth/callback`;


/* =========================================================
   SECURITY
========================================================= */

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
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
  res.sendFile(path.join(ROOT, "index.html"));
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
    oauthConfigured: Boolean(CLIENT_ID),
    callback: CALLBACK_URL
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


/* =========================================================
   SIGN STATE
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


/* =========================================================
   OAUTH START
========================================================= */

function startOAuth(req, res) {

  try {

    if (!CLIENT_ID) {
      return res.status(500).json({
        ok: false,
        error: "DERIV_CLIENT_ID is not configured"
      });
    }

    const verifier =
      createCodeVerifier();

    const challenge =
      createCodeChallenge(verifier);

    const timestamp =
      Date.now().toString();

    const stateData =
      `${timestamp}:${verifier}`;

    const signature =
      signState(stateData);

    const statePayload =
      `${stateData}:${signature}`;

    const state =
      base64UrlEncode(statePayload);

    /*
     * IMPORTANT:
     * This redirect URI MUST exactly match the URI
     * registered inside the Deriv OAuth application.
     */

    const params =
      new URLSearchParams();

    params.set(
      "client_id",
      CLIENT_ID
    );

    params.set(
      "redirect_uri",
      CALLBACK_URL
    );

    params.set(
      "response_type",
      "code"
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
      "state",
      state
    );

    const authorizationUrl =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "========================================"
    );

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
      "OAUTH URL:",
      authorizationUrl
    );

    console.log(
      "========================================"
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
      error: "Unable to start OAuth"
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


      /* -----------------------------------------------
         DERIV ERROR
      ----------------------------------------------- */

      if (error) {

        console.error(
          "DERIV OAUTH ERROR:",
          error,
          error_description
        );

        return res.redirect(
          `/?oauth=error&error=${encodeURIComponent(
            error_description || error
          )}`
        );
      }


      /* -----------------------------------------------
         NO CODE
      ----------------------------------------------- */

      if (!code) {

        console.error(
          "NO OAUTH CODE RECEIVED"
        );

        return res.redirect(
          "/?oauth=error&error=no_code"
        );
      }


      /* -----------------------------------------------
         STATE CHECK
      ----------------------------------------------- */

      if (!state) {

        console.error(
          "NO OAUTH STATE RECEIVED"
        );

        return res.redirect(
          "/?oauth=error&error=no_state"
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

      } catch (stateError) {

        console.error(
          "STATE DECODE ERROR:",
          stateError
        );

        return res.redirect(
          "/?oauth=error&error=invalid_state"
        );
      }


      const parts =
        decodedState.split(":");

      if (parts.length < 3) {

        console.error(
          "INVALID STATE FORMAT"
        );

        return res.redirect(
          "/?oauth=error&error=invalid_state"
        );
      }


      const timestamp =
        parts[0];

      const verifier =
        parts[1];

      const signature =
        parts.slice(2).join(":");


      const stateData =
        `${timestamp}:${verifier}`;

      const expectedSignature =
        signState(stateData);


      if (
        !crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        )
      ) {

        console.error(
          "INVALID OAUTH STATE SIGNATURE"
        );

        return res.redirect(
          "/?oauth=error&error=invalid_state"
        );
      }


      /* -----------------------------------------------
         STATE AGE
      ----------------------------------------------- */

      const stateAge =
        Date.now() -
        Number(timestamp);

      if (
        !Number.isFinite(stateAge) ||
        stateAge > 10 * 60 * 1000 ||
        stateAge < 0
      ) {

        console.error(
          "OAUTH STATE EXPIRED"
        );

        return res.redirect(
          "/?oauth=error&error=expired_state"
        );
      }


      /* -----------------------------------------------
         SUCCESS
      ----------------------------------------------- */

      console.log(
        "========================================"
      );

      console.log(
        "PROTRADERS FX OAUTH CODE RECEIVED"
      );

      console.log(
        "CODE RECEIVED: YES"
      );

      console.log(
        "STATE VERIFIED: YES"
      );

      console.log(
        "========================================"
      );


      /*
       * Store the authorization result in the URL.
       *
       * The frontend can now use the OAuth code to
       * complete the Deriv account connection.
       */

      const redirectUrl =
        new URL(
          BASE_URL
        );

      redirectUrl.searchParams.set(
        "oauth",
        "success"
      );

      redirectUrl.searchParams.set(
        "code",
        code
      );

      redirectUrl.searchParams.set(
        "verifier",
        verifier
      );


      return res.redirect(
        redirectUrl.toString()
      );

    } catch (error) {

      console.error(
        "OAUTH CALLBACK ERROR:",
        error
      );

      return res.redirect(
        "/?oauth=error&error=callback_failed"
      );
    }
  }
);


/* =========================================================
   OAUTH STATUS
========================================================= */

app.get(
  "/api/deriv/status",
  (req, res) => {

    res.status(200).json({
      ok: true,
      authenticated: false,
      accountId: null,
      balance: null,
      currency: null
    });
  }
);


/* =========================================================
   API ROOT
========================================================= */

app.get("/api", (req, res) => {

  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});


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
      error: "Internal server error"
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
