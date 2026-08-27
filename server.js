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
  "protraders-fx-session-secret";

const PORT =
  process.env.PORT || 3000;

const CALLBACK_URL =
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
   STATIC FILES
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
    oauthConfigured: Boolean(CLIENT_ID),
    baseUrl: BASE_URL,
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
   STATE
========================================================= */

function createState(verifier) {

  const timestamp =
    Date.now().toString();

  const data =
    `${timestamp}:${verifier}`;

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

    /*
     * State expires after 10 minutes.
     */

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
      "STATE DECODE ERROR:",
      error
    );

    return null;
  }
}


/* =========================================================
   OAUTH START
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


    /*
     * Current Deriv OAuth endpoint.
     */

    const authorizationUrl =
      `https://auth.deriv.com/oauth2/auth?${params.toString()}`;


    console.log(
      "PROTRADERS FX OAUTH START"
    );

    console.log(
      "Redirect:",
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
  (req, res) => {

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
            "S256",

          prompt:
            "registration"
        });


      const signupUrl =
        `https://auth.deriv.com/oauth2/auth?${params.toString()}`;


      return res.redirect(
        signupUrl
      );

    } catch (error) {

      console.error(
        "SIGNUP OAUTH ERROR:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "Unable to start signup"
      });
    }
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
       MISSING CODE
    ----------------------------------------------------- */

    if (!code) {

      return res.redirect(
        "/?oauth=error&message=No%20authorization%20code%20returned"
      );
    }


    /* -----------------------------------------------------
       MISSING STATE
    ----------------------------------------------------- */

    if (!state) {

      console.error(
        "OAUTH CALLBACK: STATE MISSING"
      );

      return res.redirect(
        "/?oauth=error&message=OAuth%20state%20missing"
      );
    }


    /* -----------------------------------------------------
       VERIFY STATE
    ----------------------------------------------------- */

    const stateData =
      decodeState(
        state
      );


    if (!stateData) {

      console.error(
        "OAUTH CALLBACK: INVALID STATE"
      );

      return res.redirect(
        "/?oauth=error&message=Invalid%20or%20expired%20OAuth%20state"
      );
    }


    const verifier =
      stateData.verifier;


    /* -----------------------------------------------------
       EXCHANGE CODE FOR TOKEN
    ----------------------------------------------------- */

    try {

      console.log(
        "PROTRADERS FX: exchanging authorization code"
      );


      const tokenResponse =
        await fetch(
          "https://auth.deriv.com/oauth2/token",
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
          "DERIV TOKEN EXCHANGE FAILED:",
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
       * Do NOT put the access token
       * in the URL.
       *
       * For now we confirm OAuth
       * completed successfully.
       *
       * The token can next be connected
       * to the trading API/session.
       */

      console.log(
        "PROTRADERS FX OAUTH SUCCESS"
      );

      console.log(
        "Token received successfully"
      );


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
   JAVASCRIPT
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
   CSS
========================================================= */

app.get(
  "/style.css",
  (req, res) => {

    const file =
      path.join(
        ROOT,
        "style.css"
      );

    res.type(
      "text/css"
    );

    res.sendFile(
      file
    );
  }
);


/* =========================================================
   TRACKER JS
========================================================= */

app.get(
  "/tracker.js",
  (req, res) => {

    const file =
      path.join(
        ROOT,
        "tracker.js"
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
