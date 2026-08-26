const crypto = require("crypto");

function getBaseUrl(req) {
  return (
    process.env.BASE_URL ||
    `https://${req.headers.host}`
  ).replace(/\/+$/, "");
}

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
  res.setHeader("Location", location);
  res.end();
}

function createOAuthUrl(req) {
  const clientId =
    process.env.DERIV_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "DERIV_CLIENT_ID is not configured"
    );
  }

  const state =
    crypto
      .randomBytes(32)
      .toString("hex");

  const verifier =
    crypto
      .randomBytes(48)
      .toString("base64url");

  const challenge =
    crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

  const callback =
    `${getBaseUrl(req)}/oauth/callback`;

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
    clientId
  );

  url.searchParams.set(
    "redirect_uri",
    callback
  );

  /*
    IMPORTANT:
    Only request the scope allowed
    by the current Deriv OAuth client.
  */

  url.searchParams.set(
    "scope",
    "trade"
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

  return {
    url: url.toString(),
    state,
    verifier
  };
}

function handler(req, res) {

  const base =
    getBaseUrl(req);

  const url =
    new URL(
      req.url,
      base
    );

  /*
    HEALTH
  */

  if (
    url.pathname ===
    "/health"
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
    url.pathname ===
    "/api/config"
  ) {

    return sendJson(
      res,
      200,
      {
        ok: true,

        oauthConfigured:
          Boolean(
            process.env.DERIV_CLIENT_ID
          ),

        baseUrl:
          base,

        callback:
          `${base}/oauth/callback`
      }
    );

  }


  /*
    SESSION
  */

  if (
    url.pathname ===
    "/api/session"
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
    url.pathname ===
    "/api/deriv/login"
  ) {

    try {

      const oauth =
        createOAuthUrl(req);

      /*
        Store PKCE information temporarily
        in an encrypted cookie.

        This version requires SESSION_SECRET.
      */

      const secret =
        process.env.SESSION_SECRET;

      if (!secret) {

        return sendJson(
          res,
          500,
          {
            ok: false,
            error:
              "SESSION_SECRET is not configured"
          }
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

      const payload =
        JSON.stringify({
          state:
            oauth.state,

          verifier:
            oauth.verifier,

          createdAt:
            Date.now()
        });

      const encrypted =
        Buffer.concat([
          cipher.update(
            payload,
            "utf8"
          ),
          cipher.final()
        ]);

      const tag =
        cipher.getAuthTag();

      const cookie =
        [
          iv.toString("base64url"),
          tag.toString("base64url"),
          encrypted.toString("base64url")
        ].join(".");

      res.setHeader(
        "Set-Cookie",
        `ptfx_oauth=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
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
    url.pathname ===
    "/api/deriv/signup"
  ) {

    try {

      /*
        Signup uses the same OAuth
        authorization flow.

        We intentionally use only
        the permitted "trade" scope.
      */

      const oauth =
        createOAuthUrl(req);

      const secret =
        process.env.SESSION_SECRET;

      if (!secret) {

        return sendJson(
          res,
          500,
          {
            ok: false,
            error:
              "SESSION_SECRET is not configured"
          }
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

      const payload =
        JSON.stringify({
          state:
            oauth.state,

          verifier:
            oauth.verifier,

          createdAt:
            Date.now()
        });

      const encrypted =
        Buffer.concat([
          cipher.update(
            payload,
            "utf8"
          ),
          cipher.final()
        ]);

      const tag =
        cipher.getAuthTag();

      const cookie =
        [
          iv.toString("base64url"),
          tag.toString("base64url"),
          encrypted.toString("base64url")
        ].join(".");

      res.setHeader(
        "Set-Cookie",
        `ptfx_oauth=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
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
    url.pathname ===
    "/oauth/callback"
  ) {

    const error =
      url.searchParams.get(
        "error"
      );

    const description =
      url.searchParams.get(
        "error_description"
      );

    if (error) {

      res.statusCode = 400;

      res.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      return res.end(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX</title>
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
  width:min(600px,calc(100% - 30px));
  background:#0e131a;
  border:1px solid #252d37;
  border-radius:10px;
  padding:30px;
}
h1{color:#ff6173}
p{color:#9aa5b5;line-height:1.6}
a{color:#20d88c}
</style>
</head>
<body>
<div class="card">
<h1>Deriv Login Error</h1>
<p>
<strong>${String(error)
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")}</strong>
</p>
<p>
${String(description || "Authorization failed.")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")}
</p>
<a href="/">Return to ProTraders FX</a>
</div>
</body>
</html>
      `);

    }


    const code =
      url.searchParams.get(
        "code"
      );

    const state =
      url.searchParams.get(
        "state"
      );

    if (!code || !state) {

      return sendJson(
        res,
        400,
        {
          ok: false,
          error:
            "Missing OAuth code or state"
        }
      );

    }


    /*
      Retrieve OAuth cookie.
    */

    const cookieHeader =
      req.headers.cookie || "";

    const match =
      cookieHeader.match(
        /(?:^|;\s*)ptfx_oauth=([^;]+)/
      );

    if (!match) {

      return sendJson(
        res,
        400,
        {
          ok: false,
          error:
            "OAuth session expired. Please login again."
        }
      );

    }


    try {

      const secret =
        process.env.SESSION_SECRET;

      const key =
        crypto
          .createHash("sha256")
          .update(secret)
          .digest();

      const raw =
        decodeURIComponent(
          match[1]
        );

      const parts =
        raw.split(".");

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

      decipher.setAuthTag(
        tag
      );

      const decrypted =
        Buffer.concat([
          decipher.update(
            encrypted
          ),
          decipher.final()
        ]);

      const oauth =
        JSON.parse(
          decrypted.toString("utf8")
        );


      /*
        Check state.
      */

      if (
        oauth.state !==
        state
      ) {

        return sendJson(
          res,
          400,
          {
            ok: false,
            error:
              "OAuth state verification failed"
          }
        );

      }


      /*
        Exchange authorization code
        for access token.
      */

      const tokenResponse =
        fetch(
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
                  process.env.DERIV_CLIENT_ID,

                code:
                  code,

                code_verifier:
                  oauth.verifier,

                redirect_uri:
                  `${base}/oauth/callback`
              }).toString()
          }
        );


      return tokenResponse
        .then(
          async function (
            response
          ) {

            const data =
              await response.json();


            if (
              !response.ok
            ) {

              throw new Error(
                data.error_description ||
                data.error ||
                "Token exchange failed"
              );

            }


            /*
              For now, confirm that
              authentication succeeded.

              We will connect the token
              to the trading account after
              this login flow is confirmed.
            */

            res.setHeader(
              "Content-Type",
              "text/html; charset=utf-8"
            );

            return res.end(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProTraders FX</title>
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
  width:min(430px,calc(100% - 30px));
  background:#0e131a;
  border:1px solid #252d37;
  border-radius:10px;
  padding:32px;
  text-align:center;
}
.dot{
  display:inline-block;
  width:12px;
  height:12px;
  border-radius:50%;
  background:#20d88c;
  box-shadow:0 0 14px #20d88c;
}
h1{margin:18px 0 8px}
p{color:#8e99a9;line-height:1.5}
button{
  border:0;
  background:#16b875;
  color:#03130c;
  padding:12px 20px;
  border-radius:6px;
  font-weight:800;
  cursor:pointer;
}
</style>
</head>
<body>
<div class="card">
<span class="dot"></span>
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
        )
        .catch(
          function (
            error
          ) {

            console.error(
              "TOKEN ERROR:",
              error
            );

            res.statusCode =
              400;

            res.setHeader(
              "Content-Type",
              "text/html; charset=utf-8"
            );

            return res.end(`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ProTraders FX</title>
<style>
body{
background:#080b10;
color:#fff;
font-family:Arial;
padding:40px;
}
h1{color:#ff6173}
pre{
white-space:pre-wrap;
color:#aeb7c4;
}
a{color:#20d88c}
</style>
</head>
<body>
<h1>Token exchange failed</h1>
<pre>${String(error.message)
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")}</pre>
<a href="/">Return to ProTraders FX</a>
</body>
</html>
            `);

          }
        );

    } catch (error) {

      console.error(
        "CALLBACK ERROR:",
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
    UNKNOWN ROUTE
  */

  return sendJson(
    res,
    404,
    {
      ok: false,
      error: "Not found",
      path: url.pathname
    }
  );

}

module.exports = handler;
