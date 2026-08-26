const crypto = require("crypto");

const CLIENT_ID =
  process.env.DERIV_CLIENT_ID || "348m9hYwW0YkB5rM2ki9f";

const BASE_URL =
  (process.env.BASE_URL ||
    "https://www.protradersfx.com").replace(/\/+$/, "");

const CALLBACK_URL =
  `${BASE_URL}/oa`;

const REFERRAL_CODE =
  process.env.DERIV_AFFILIATE_TOKEN ||
  process.env.DERIV_AFFILIATE_PARAM ||
  "HVHHL2US93LW";


function sendJson(res, status, data) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.end(JSON.stringify(data));
}


function redirect(res, location) {
  res.statusCode = 302;

  res.setHeader(
    "Location",
    location
  );

  res.end();
}


function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/*
--------------------------------------------------
CREATE OAUTH REQUEST
--------------------------------------------------
*/

function createOAuthRequest(mode) {

  const state =
    crypto
      .randomBytes(32)
      .toString("base64url");

  const verifier =
    crypto
      .randomBytes(48)
      .toString("base64url");

  const challenge =
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");


  const oauthUrl =
    new URL(
      "https://auth.deriv.com/oauth2/auth"
    );


  oauthUrl.searchParams.set(
    "response_type",
    "code"
  );


  oauthUrl.searchParams.set(
    "client_id",
    CLIENT_ID
  );


  oauthUrl.searchParams.set(
    "redirect_uri",
    CALLBACK_URL
  );


  /*
  LOGIN:
  Only trade permission.

  SIGNUP:
  Account creation permission is required.
  */

  if (mode === "login") {

    oauthUrl.searchParams.set(
      "scope",
      "trade"
    );

  } else {

    oauthUrl.searchParams.set(
      "scope",
      "trade account_manage"
    );

    oauthUrl.searchParams.set(
      "prompt",
      "registration"
    );

    oauthUrl.searchParams.set(
      "t",
      REFERRAL_CODE
    );

  }


  oauthUrl.searchParams.set(
    "state",
    state
  );


  oauthUrl.searchParams.set(
    "code_challenge",
    challenge
  );


  oauthUrl.searchParams.set(
    "code_challenge_method",
    "S256"
  );


  return {
    url: oauthUrl.toString(),
    state,
    verifier
  };
}


/*
--------------------------------------------------
ENCRYPT OAUTH SESSION
--------------------------------------------------
*/

function encryptSession(payload) {

  const secret =
    process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured"
    );
  }


  const key =
    crypto
      .createHash("sha256")
      .update(secret)
      .digest();


  const iv =
    crypto.randomBytes(12);


  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );


  const encrypted =
    Buffer.concat([
      cipher.update(
        JSON.stringify(payload),
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


/*
--------------------------------------------------
DECRYPT OAUTH SESSION
--------------------------------------------------
*/

function decryptSession(value) {

  const secret =
    process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured"
    );
  }


  const parts =
    value.split(".");


  if (parts.length !== 3) {
    throw new Error(
      "Invalid OAuth session"
    );
  }


  const key =
    crypto
      .createHash("sha256")
      .update(secret)
      .digest();


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
      key,
      iv
    );


  decipher.setAuthTag(tag);


  const decrypted =
    Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);


  return JSON.parse(
    decrypted.toString("utf8")
  );
}


/*
--------------------------------------------------
SET COOKIE
--------------------------------------------------
*/

function setOAuthCookie(
  res,
  oauth
) {

  const value =
    encryptSession({
      state: oauth.state,
      verifier: oauth.verifier,
      createdAt: Date.now()
    });


  res.setHeader(
    "Set-Cookie",
    `ptfx_oauth=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );
}


/*
--------------------------------------------------
READ COOKIE
--------------------------------------------------
*/

function getOAuthCookie(req) {

  const cookies =
    req.headers.cookie || "";


  const match =
    cookies.match(
      /(?:^|;\s*)ptfx_oauth=([^;]+)/
    );


  if (!match) {
    return null;
  }


  return decodeURIComponent(
    match[1]
  );
}


/*
--------------------------------------------------
HTML ERROR PAGE
--------------------------------------------------
*/

function errorPage(
  res,
  title,
  message
) {

  res.statusCode = 400;

  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );


  res.end(`
<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>ProTraders FX</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #070b10;
  color: #ffffff;
  font-family: Arial, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  width: min(520px, calc(100% - 32px));
  background: #0d131b;
  border: 1px solid #26303b;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
}

h1 {
  margin: 0 0 14px;
  color: #ff6476;
}

p {
  color: #9ca8b7;
  line-height: 1.6;
}

a {
  display: inline-block;
  margin-top: 15px;
  color: #20d88c;
  text-decoration: none;
  font-weight: 700;
}

</style>

</head>

<body>

<div class="card">

<h1>${escapeHtml(title)}</h1>

<p>${escapeHtml(message)}</p>

<a href="/">
Return to ProTraders FX
</a>

</div>

</body>

</html>
  `);
}


/*
--------------------------------------------------
SUCCESS PAGE
--------------------------------------------------
*/

function successPage(
  res
) {

  res.statusCode = 200;

  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );


  res.end(`
<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>ProTraders FX</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: #070b10;
  color: #ffffff;
  font-family: Arial, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  width: min(460px, calc(100% - 32px));
  background: #0d131b;
  border: 1px solid #26303b;
  border-radius: 12px;
  padding: 35px;
  text-align: center;
}

.status {
  width: 14px;
  height: 14px;
  display: inline-block;
  border-radius: 50%;
  background: #20d88c;
  box-shadow: 0 0 18px #20d88c;
}

h1 {
  margin: 18px 0 8px;
}

p {
  color: #9ca8b7;
  line-height: 1.6;
}

button {
  border: 0;
  border-radius: 7px;
  padding: 13px 22px;
  background: #20d88c;
  color: #04120b;
  font-weight: 800;
  cursor: pointer;
}

</style>

</head>

<body>

<div class="card">

<span class="status"></span>

<h1>LOGIN SUCCESSFUL</h1>

<p>
Your Deriv authorization was completed successfully.
</p>

<button onclick="location.href='/'">
RETURN TO PROTRADERS FX
</button>

</div>

</body>

</html>
  `);
}


/*
--------------------------------------------------
MAIN HANDLER
--------------------------------------------------
*/

async function handler(req, res) {

  const requestUrl =
    new URL(
      req.url,
      BASE_URL
    );


  const pathname =
    requestUrl.pathname;


  /*
  HEALTH
  */

  if (
    pathname === "/health"
  ) {

    return sendJson(
      res,
      200,
      {
        ok: true,
        service: "protraders-fx",
        time:
          new Date().toISOString()
      }
    );

  }


  /*
  CONFIG
  */

  if (
    pathname === "/api/config"
  ) {

    return sendJson(
      res,
      200,
      {
        ok: true,
        oauthConfigured:
          Boolean(CLIENT_ID),

        baseUrl:
          BASE_URL,

        callback:
          CALLBACK_URL,

        clientConfigured:
          Boolean(
            process.env.DERIV_CLIENT_ID
          )
      }
    );

  }


  /*
  SESSION
  */

  if (
    pathname === "/api/session"
  ) {

    return sendJson(
      res,
      200,
      {
        authenticated: false
      }
    );

  }


  /*
  LOGIN
  */

  if (
    pathname === "/api/deriv/login"
  ) {

    try {

      const oauth =
        createOAuthRequest(
          "login"
        );


      setOAuthCookie(
        res,
        oauth
      );


      console.log(
        "DERIV LOGIN REDIRECT:",
        oauth.url
      );


      return redirect(
        res,
        oauth.url
      );

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      return sendJson(
        res,
        500,
        {
          ok: false,
          error:
            error.message
        }
      );

    }

  }


  /*
  SIGNUP
  */

  if (
    pathname === "/api/deriv/signup"
  ) {

    try {

      const oauth =
        createOAuthRequest(
          "signup"
        );


      setOAuthCookie(
        res,
        oauth
      );


      console.log(
        "DERIV SIGNUP REDIRECT:",
        oauth.url
      );


      return redirect(
        res,
        oauth.url
      );

    } catch (error) {

      console.error(
        "SIGNUP ERROR:",
        error
      );


      return sendJson(
        res,
        500,
        {
          ok: false,
          error:
            error.message
        }
      );

    }

  }


  /*
  OAUTH CALLBACK
  */

  if (
    pathname === "/oa"
  ) {

    const oauthError =
      requestUrl.searchParams.get(
        "error"
      );


    const description =
      requestUrl.searchParams.get(
        "error_description"
      );


    if (oauthError) {

      return errorPage(
        res,
        "Deriv Login Failed",
        description ||
          oauthError
      );

    }


    const code =
      requestUrl.searchParams.get(
        "code"
      );


    const state =
      requestUrl.searchParams.get(
        "state"
      );


    if (!code || !state) {

      return errorPage(
        res,
        "Authorization Failed",
        "Missing authorization code or state."
      );

    }


    try {

      const cookie =
        getOAuthCookie(req);


      if (!cookie) {

        return errorPage(
          res,
          "Session Expired",
          "Please start the login process again."
        );

      }


      const oauth =
        decryptSession(
          cookie
        );


      if (
        oauth.state !== state
      ) {

        return errorPage(
          res,
          "Security Check Failed",
          "OAuth state verification failed."
        );

      }


      /*
      Exchange authorization code
      */

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
                  code,

                code_verifier:
                  oauth.verifier,

                redirect_uri:
                  CALLBACK_URL
              }).toString()
          }
        );


      const data =
        await tokenResponse.json();


      if (
        !tokenResponse.ok
      ) {

        console.error(
          "DERIV TOKEN ERROR:",
          data
        );


        return errorPage(
          res,
          "Login Failed",
          data.error_description ||
          data.error ||
          "Unable to complete Deriv authorization."
        );

      }


      /*
      OAuth succeeded.

      We deliberately do not expose
      the access token in the browser.
      */

      console.log(
        "DERIV OAUTH SUCCESS"
      );


      return successPage(
        res
      );

    } catch (error) {

      console.error(
        "CALLBACK ERROR:",
        error
      );


      return errorPage(
        res,
        "Login Failed",
        error.message
      );

    }

  }


  /*
  UNKNOWN ROUTE
  */

  return sendJson(
    res,
    404,
    {
      ok: false,
      error: "Not found",
      path: pathname
    }
  );

}


module.exports = handler;
