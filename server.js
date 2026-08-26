const crypto = require("crypto");

const COOKIE_NAME = "ptfx_session";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function baseUrl(req) {
  return (
    env("BASE_URL") ||
    `https://${req.headers.host}`
  ).replace(/\/+$/, "");
}

function redirectUri(req) {
  return `${baseUrl(req)}/oauth/callback`;
}

function clientId() {
  return env("DERIV_CLIENT_ID");
}

function signupParams(url) {
  const affiliateToken =
    env("DERIV_AFFILIATE_TOKEN") ||
    env("DERIV_AFFILIATE_PARAM");

  const affiliateId =
    env("DERIV_AFFILIATE_ID");

  const campaign =
    env("DERIV_CAMPAIGN");

  if (affiliateToken) {
    url.searchParams.set(
      "t",
      affiliateToken
    );
  }

  if (campaign) {
    url.searchParams.set(
      "utm_campaign",
      campaign
    );

    url.searchParams.set(
      "utm_medium",
      "affiliate"
    );
  }

  if (affiliateId) {
    url.searchParams.set(
      "utm_source",
      affiliateId
    );
  }
}

function randomString(bytes = 32) {
  return crypto
    .randomBytes(bytes)
    .toString("base64url");
}

function pkceChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.end(
    JSON.stringify(data)
  );
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8"
  );

  res.end(body);
}

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
        part.slice(0, index).trim();

      const value =
        part.slice(index + 1).trim();

      cookies[key] =
        decodeURIComponent(value);

    });

  return cookies;
}

/*
  The OAuth state and PKCE verifier are encrypted
  into a short-lived signed/encrypted cookie.

  This means the Vercel function does not need
  filesystem or database storage.
*/

function getKey() {

  const secret =
    env("SESSION_SECRET");

  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured"
    );
  }

  return crypto
    .createHash("sha256")
    .update(secret)
    .digest();
}

function encrypt(value) {

  const key = getKey();

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
        JSON.stringify(value),
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

function decrypt(value) {

  const key = getKey();

  const parts =
    String(value).split(".");

  if (parts.length !== 3) {
    throw new Error(
      "Invalid session"
    );
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

function setCookie(
  res,
  name,
  value,
  maxAge
) {

  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );

}

function clearCookie(
  res,
  name
) {

  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );

}

function authorizationUrl(
  req,
  mode
) {

  const id =
    clientId();

  if (!id) {
    throw new Error(
      "DERIV_CLIENT_ID is not configured"
    );
  }

  const verifier =
    randomString(64);

  const challenge =
    pkceChallenge(verifier);

  const state =
    randomString(32);

  const session = encrypt({
    verifier,
    state,
    createdAt: Date.now()
  });

  const url =
    new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

  url.searchParams.set(
    "response_type",
    "code"
  );

  url.searchParams.set(
    "client_id",
    id
  );

  url.searchParams.set(
    "redirect_uri",
    redirectUri(req)
  );

  /*
    We request trading + account management.
    These are current OAuth scopes documented by Deriv.
  */

  url.searchParams.set(
    "scope",
    "trade account_manage"
  );

  url.searchParams.set(
    "state",
    state
  );

  url.searchParams.set(
    "code_challenge",
    challenge
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256"
  );

  /*
    If you still have a legacy Deriv app ID,
    it can be supplied separately.
  */

  const legacyAppId =
    env("DERIV_APP_ID");

  if (legacyAppId) {
    url.searchParams.set(
      "app_id",
      legacyAppId
    );
  }

  if (mode === "signup") {
    url.searchParams.set(
      "prompt",
      "registration"
    );

    signupParams(url);
  }

  return {
    url: url.toString(),
    session
  };
}

async function exchangeCode(
  req,
  code,
  verifier
) {

  const response =
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
              clientId(),

            code,

            code_verifier:
              verifier,

            redirect_uri:
              redirectUri(req)
          }).toString()
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data.error_description ||
      data.error ||
      "Deriv token exchange failed"
    );

  }

  return data;
}

async function getAccounts(
  accessToken
) {

  const response =
    await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        headers: {
          "Deriv-App-ID":
            clientId(),

          "Authorization":
            `Bearer ${accessToken}`
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    return null;
  }

  return data;
}

function successPage(account) {

  const accountText =
    account
      ? String(
          account.loginid ||
          account.account_id ||
          account.id ||
          "Connected"
        )
      : "Connected";

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX — Connected</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#080b10;
  color:#eef3f8;
  font-family:Arial,Helvetica,sans-serif;
}
.card{
  width:min(430px,calc(100% - 32px));
  padding:32px;
  border:1px solid #252d37;
  border-radius:12px;
  background:#0e131a;
  text-align:center;
}
.dot{
  width:12px;
  height:12px;
  display:inline-block;
  border-radius:50%;
  background:#20d88c;
  box-shadow:0 0 15px #20d88c;
}
h1{font-size:24px;margin:18px 0 8px}
p{color:#8792a2}
.account{
  margin:22px 0;
  padding:15px;
  background:#080c11;
  border:1px solid #222a34;
  border-radius:7px;
}
button{
  border:0;
  background:#16b875;
  color:#04120c;
  font-weight:800;
  padding:12px 20px;
  border-radius:7px;
  cursor:pointer;
}
</style>
</head>
<body>
<div class="card">
  <span class="dot"></span>
  <h1>Account Connected</h1>
  <p>Your Deriv account is connected to ProTraders FX.</p>
  <div class="account">
    Account: <strong>${accountText}</strong>
  </div>
  <button onclick="location.href='/'">
    RETURN TO TERMINAL
  </button>
</div>
</body>
</html>
`;
}

function errorPage(message) {

  const safe =
    String(message)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX — Login Error</title>
<style>
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#080b10;
  color:#fff;
  font-family:Arial,sans-serif;
}
.card{
  max-width:600px;
  margin:20px;
  padding:30px;
  background:#0e131a;
  border:1px solid #252d37;
  border-radius:10px;
}
h1{color:#ff6173}
pre{
  white-space:pre-wrap;
  color:#b8c1ce;
  line-height:1.5;
}
a{
  display:inline-block;
  margin-top:15px;
  color:#20d88c;
}
</style>
</head>
<body>
<div class="card">
<h1>Login failed</h1>
<pre>${safe}</pre>
<a href="/">Return to ProTraders FX</a>
</div>
</body>
</html>
`;
}

async function handler(req, res) {

  try {

    const url =
      new URL(
        req.url,
        baseUrl(req)
      );

    const pathname =
      url.pathname;

    /*
      HEALTH
    */

    if (pathname === "/health") {

      return json(
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
      CONFIG CHECK
    */

    if (
      pathname ===
      "/api/config"
    ) {

      return json(
        res,
        200,
        {
          ok: true,
          oauthConfigured:
            Boolean(clientId()),
          baseUrl:
            baseUrl(req),
          callback:
            redirectUri(req)
        }
      );

    }

    /*
      SESSION
    */

    if (
      pathname ===
      "/api/session"
    ) {

      const cookies =
        parseCookies(req);

      const raw =
        cookies[COOKIE_NAME];

      if (!raw) {

        return json(
          res,
          200,
          {
            authenticated: false
          }
        );

      }

      try {

        const session =
          decrypt(raw);

        return json(
          res,
          200,
          {
            authenticated:
              Boolean(
                session.accessToken
              ),
            account:
              session.account || null
          }
        );

      } catch (error) {

        return json(
          res,
          200,
          {
            authenticated: false
          }
        );

      }

    }

    /*
      LOGOUT
    */

    if (
      pathname ===
      "/api/logout"
    ) {

      clearCookie(
        res,
        COOKIE_NAME
      );

      res.statusCode = 302;
      res.setHeader(
        "Location",
        "/"
      );

      return res.end();

    }

    /*
      LOGIN
    */

    if (
      pathname ===
      "/api/deriv/login"
    ) {

      const result =
        authorizationUrl(
          req,
          "login"
        );

      setCookie(
        res,
        "ptfx_oauth",
        result.session,
        600
      );

      res.statusCode = 302;

      res.setHeader(
        "Location",
        result.url
      );

      return res.end();

    }

    /*
      SIGNUP
    */

    if (
      pathname ===
      "/api/deriv/signup"
    ) {

      const result =
        authorizationUrl(
          req,
          "signup"
        );

      setCookie(
        res,
        "ptfx_oauth",
        result.session,
        600
      );

      res.statusCode = 302;

      res.setHeader(
        "Location",
        result.url
      );

      return res.end();

    }

    /*
      OAUTH CALLBACK
    */

    if (
      pathname ===
      "/oauth/callback"
    ) {

      const error =
        url.searchParams.get(
          "error"
        );

      if (error) {

        const description =
          url.searchParams.get(
            "error_description"
          );

        return html(
          res,
          400,
          errorPage(
            `${error}: ${
              description || "Authorization failed"
            }`
          )
        );

      }

      const code =
        url.searchParams.get(
          "code"
        );

      const returnedState =
        url.searchParams.get(
          "state"
        );

      if (!code || !returnedState) {

        return html(
          res,
          400,
          errorPage(
            "Missing authorization code or state."
          )
        );

      }

      const cookies =
        parseCookies(req);

      const oauthCookie =
        cookies.ptfx_oauth;

      if (!oauthCookie) {

        return html(
          res,
          400,
          errorPage(
            "OAuth session expired. Please try Login again."
          )
        );

      }

      let oauth;

      try {

        oauth =
          decrypt(
            oauthCookie
          );

      } catch (error) {

        return html(
          res,
          400,
          errorPage(
            "Invalid OAuth session."
          )
        );

      }

      /*
        Reject old OAuth sessions.
      */

      if (
        !oauth.createdAt ||
        Date.now() -
          oauth.createdAt >
          10 * 60 * 1000
      ) {

        return html(
          res,
          400,
          errorPage(
            "OAuth session expired. Please login again."
          )
        );

      }

      if (
        oauth.state !==
        returnedState
      ) {

        return html(
          res,
          400,
          errorPage(
            "OAuth state verification failed."
          )
        );

      }

      const token =
        await exchangeCode(
          req,
          code,
          oauth.verifier
        );

      const accountData =
        await getAccounts(
          token.access_token
        );

      const account =
        accountData &&
        (
          accountData.data ||
          accountData
        );

      /*
        Store the access token server-side
        in an encrypted HttpOnly cookie.
      */

      const session =
        encrypt({
          accessToken:
            token.access_token,

          expiresAt:
            Date.now() +
            Number(
              token.expires_in ||
              3600
            ) *
            1000,

          account
        });

      setCookie(
        res,
        COOKIE_NAME,
        session,
        Number(
          token.expires_in ||
          3600
        )
      );

      clearCookie(
        res,
        "ptfx_oauth"
      );

      return html(
        res,
        200,
        successPage(
          account
        )
      );

    }

    /*
      404
    */

    return json(
      res,
      404,
      {
        ok: false,
        error: "Not found"
      }
    );

  } catch (error) {

    console.error(
      error
    );

    return json(
      res,
      500,
      {
        ok: false,
        error:
          error.message ||
          "Internal server error"
      }
    );

  }

}

module.exports = handler;
