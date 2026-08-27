"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BASE_URL =
  process.env.BASE_URL || "https://www.protradersfx.com";

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const CLIENT_SECRET =
  process.env.DERIV_CLIENT_SECRET || "";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "protraders-fx-session-secret";

const PORT =
  process.env.PORT || 3000;


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
   HOME PAGE
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
    oauthConfigured: Boolean(CLIENT_ID),
    callback:
      `${BASE_URL}/oauth/callback`
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
      createCodeChallenge(
        verifier
      );

    const stateData =
      `${Date.now()}:${verifier}`;

    const signature =
      signState(stateData);

    const state =
      base64UrlEncode(
        Buffer.from(
          `${stateData}:${signature}`
        )
      );

    const callback =
      `${BASE_URL}/oauth/callback`;

    const params =
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: callback,
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state
      });

    const authorizationUrl =
      `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;

    console.log(
      "PROTRADERS FX OAUTH:",
      authorizationUrl
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

    const {
      code,
      state,
      error,
      error_description
    } = req.query;


    /* DERIV ERROR */

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
<meta name="viewport" content="width=device-width,initial-scale=1">
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

<p style="color:#9aa5b5">
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


    /* NO CODE */

    if (!code) {
      return res.status(400).send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
No authorization code was returned by Deriv.
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


    /*
     * At this point Deriv has successfully
     * returned an authorization code.
     *
     * The frontend is informed that OAuth
     * completed successfully.
     */

    console.log(
      "PROTRADERS FX OAUTH CODE RECEIVED"
    );


    return res.redirect(
      `/?oauth=success`
    );
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
   JAVASCRIPT FALLBACK
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
