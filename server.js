const crypto = require("crypto");

function getBaseUrl(req) {
  return (
    process.env.BASE_URL ||
    `https://${req.headers.host}`
  ).replace(/\/+$/, "");
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function handler(req, res) {
  const url = new URL(
    req.url,
    getBaseUrl(req)
  );

  if (url.pathname === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "protraders-fx",
      time: new Date().toISOString()
    });
  }

  if (url.pathname === "/api/config") {
    return sendJson(res, 200, {
      ok: true,
      oauthConfigured: Boolean(
        process.env.DERIV_CLIENT_ID
      ),
      baseUrl: getBaseUrl(req),
      callback:
        `${getBaseUrl(req)}/oauth/callback`
    });
  }

  if (url.pathname === "/api/session") {
    return sendJson(res, 200, {
      authenticated: false
    });
  }

  if (url.pathname === "/api/deriv/login") {
    if (!process.env.DERIV_CLIENT_ID) {
      return sendJson(res, 500, {
        ok: false,
        error: "DERIV_CLIENT_ID is not configured"
      });
    }

    const verifier =
      crypto.randomBytes(48).toString("base64url");

    const state =
      crypto.randomBytes(32).toString("base64url");

    const challenge =
      crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");

    const authUrl = new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

    authUrl.searchParams.set(
      "response_type",
      "code"
    );

    authUrl.searchParams.set(
      "client_id",
      process.env.DERIV_CLIENT_ID
    );

    authUrl.searchParams.set(
      "redirect_uri",
      `${getBaseUrl(req)}/oauth/callback`
    );

    authUrl.searchParams.set(
      "scope",
      "trade account_manage"
    );

    authUrl.searchParams.set(
      "state",
      state
    );

    authUrl.searchParams.set(
      "code_challenge",
      challenge
    );

    authUrl.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    res.statusCode = 302;
    res.setHeader(
      "Location",
      authUrl.toString()
    );

    return res.end();
  }

  if (url.pathname === "/api/deriv/signup") {
    if (!process.env.DERIV_CLIENT_ID) {
      return sendJson(res, 500, {
        ok: false,
        error: "DERIV_CLIENT_ID is not configured"
      });
    }

    const verifier =
      crypto.randomBytes(48).toString("base64url");

    const state =
      crypto.randomBytes(32).toString("base64url");

    const challenge =
      crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url");

    const signupUrl = new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

    signupUrl.searchParams.set(
      "response_type",
      "code"
    );

    signupUrl.searchParams.set(
      "client_id",
      process.env.DERIV_CLIENT_ID
    );

    signupUrl.searchParams.set(
      "redirect_uri",
      `${getBaseUrl(req)}/oauth/callback`
    );

    signupUrl.searchParams.set(
      "scope",
      "trade account_manage"
    );

    signupUrl.searchParams.set(
      "state",
      state
    );

    signupUrl.searchParams.set(
      "code_challenge",
      challenge
    );

    signupUrl.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    res.statusCode = 302;
    res.setHeader(
      "Location",
      signupUrl.toString()
    );

    return res.end();
  }

  return sendJson(res, 404, {
    ok: false,
    error: "Not found",
    path: url.pathname
  });
}

module.exports = handler;
