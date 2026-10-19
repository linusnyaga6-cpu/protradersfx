import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { DerivApiError, readOptionsAccounts } from "../lib/deriv-options";

const router: IRouter = Router();

const SESSION_COOKIE = "protraders_fx_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const DERIV_AUTHORIZE_URL = "https://auth.deriv.com/oauth2/auth";
const DERIV_TOKEN_URL = "https://auth.deriv.com/oauth2/token";
const DEFAULT_RETURN_TO = "/?view=dashboard";
const sessionRefreshes = new Map<string, Promise<Session>>();

type AuthMode = "login" | "signup";
type AccountMode = "demo" | "real";

type OAuthState = {
  verifier: string;
  mode: AuthMode;
  returnTo: string;
  redirectUri: string;
  issuedAt: number;
};

export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  activeMode: AccountMode;
};

export class DerivSessionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "DerivSessionError";
  }
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function sessionKey() {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

function seal<T>(value: T) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    base64Url(iv),
    base64Url(cipher.getAuthTag()),
    base64Url(encrypted),
  ].join(".");
}

function unseal<T>(value: string): T {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid sealed value.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}

function getClientId() {
  return process.env["DERIV_CLIENT_ID"] || process.env["DERIV_APP_ID"] || "";
}

function getRequestOrigin(req: Request) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get("host");
  if (!host) throw new Error("The request host is unavailable.");
  return `${protocol}://${host}`;
}

function getRedirectUri(req: Request) {
  const configuredBaseUrl = process.env["BASE_URL"]?.replace(/\/$/, "");
  const origin = configuredBaseUrl || getRequestOrigin(req);
  return `${origin}/api/deriv/callback`;
}

function safeReturnTo(value: unknown) {
  const returnTo = typeof value === "string" ? value : DEFAULT_RETURN_TO;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return DEFAULT_RETURN_TO;
  return returnTo;
}

function withQuery(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function parseCookies(req: Request) {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function readSealedSession(req: Request) {
  const value = parseCookies(req)[SESSION_COOKIE];
  if (!value) return null;
  try {
    const session = unseal<Session>(value);
    if (typeof session.accessToken !== "string" || !session.accessToken) return null;
    return session;
  } catch {
    return null;
  }
}

async function refreshSession(session: Session): Promise<Session> {
  if (!session.refreshToken) {
    throw new DerivSessionError(
      "Your Deriv session expired. Reconnect your Deriv account to continue.",
      401,
    );
  }

  const refreshKey = crypto.createHash("sha256").update(session.refreshToken).digest("hex");
  const activeRefresh = sessionRefreshes.get(refreshKey);
  if (activeRefresh) return activeRefresh;

  const refresh = (async () => {
    const clientId = getClientId();
    if (!clientId) {
      throw new DerivSessionError("Deriv sign-in is not configured. Please try again later.", 503);
    }

    let response: globalThis.Response;
    try {
      response = await fetch(DERIV_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: session.refreshToken!,
        }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new DerivSessionError("Deriv could not refresh your session. Please try again shortly.", 503);
    }

    const payload = (await response.json().catch(() => null)) as
      | { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown }
      | null;
    if (!response.ok || typeof payload?.access_token !== "string" || !payload.access_token) {
      if (response.status === 400 || response.status === 401) {
        throw new DerivSessionError(
          "Your Deriv session expired. Reconnect your Deriv account to continue.",
          401,
        );
      }
      throw new DerivSessionError("Deriv could not refresh your session. Please try again shortly.", 503);
    }

    const expiresIn = Number(payload.expires_in);
    const expiresInSeconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    return {
      ...session,
      accessToken: payload.access_token,
      refreshToken:
        typeof payload.refresh_token === "string" && payload.refresh_token
          ? payload.refresh_token
          : session.refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
  })();

  sessionRefreshes.set(refreshKey, refresh);
  try {
    return await refresh;
  } finally {
    if (sessionRefreshes.get(refreshKey) === refresh) sessionRefreshes.delete(refreshKey);
  }
}

export async function readSession(req: Request, res: Response): Promise<Session | null> {
  const session = readSealedSession(req);
  if (!session) return null;
  if (Number.isFinite(session.expiresAt) && session.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return session;
  }

  let refreshed: Session;
  try {
    refreshed = await refreshSession(session);
  } catch (error) {
    if (error instanceof DerivSessionError && error.statusCode === 401) {
      clearSession(res, req);
    }
    throw error;
  }
  setSession(res, req, refreshed);
  return refreshed;
}

async function sessionForAuthRoute(req: Request, res: Response): Promise<Session | null> {
  try {
    return await readSession(req, res);
  } catch (error) {
    const statusCode = error instanceof DerivSessionError ? error.statusCode : 503;
    const message =
      error instanceof Error
        ? error.message
        : "Deriv could not refresh your session. Please try again shortly.";
    res.status(statusCode).json({ authenticated: false, error: message });
    return null;
  }
}

function cookieAttributes(req: Request) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const secure = forwardedProto === "https" || req.secure;
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

function setSession(res: Response, req: Request, session: Session) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(seal(session))}; ${cookieAttributes(req)}`);
}

function clearSession(res: Response, req: Request) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes(req)}; Max-Age=0`);
}

function createCodeVerifier() {
  return base64Url(crypto.randomBytes(32));
}

function createCodeChallenge(verifier: string) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function createOAuthUrl(req: Request, mode: AuthMode) {
  const clientId = getClientId();
  if (!clientId) throw new Error("DERIV_APP_ID is not configured.");

  const verifier = createCodeVerifier();
  const redirectUri = getRedirectUri(req);
  const state = seal<OAuthState>({
    verifier,
    mode,
    redirectUri,
    returnTo: safeReturnTo(req.query.returnTo),
    issuedAt: Date.now(),
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: process.env["DERIV_SCOPE"] || "trade account_manage",
    state,
    code_challenge: createCodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${DERIV_AUTHORIZE_URL}?${params.toString()}`;
}

router.get("/deriv/login", (req, res) => {
  try {
    res.redirect(createOAuthUrl(req, "login"));
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Deriv login is unavailable." });
  }
});

router.get("/deriv/signup", (req, res) => {
  try {
    res.redirect(createOAuthUrl(req, "signup"));
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Deriv signup is unavailable." });
  }
});

router.get("/deriv/callback", async (req, res) => {
  const fallback = safeReturnTo(req.query.returnTo);
  try {
    const state = unseal<OAuthState>(String(req.query.state ?? ""));
    if (Date.now() - state.issuedAt > OAUTH_STATE_MAX_AGE_MS) throw new Error("The Deriv sign-in request expired.");
    if (req.query.error) {
      res.redirect(withQuery(state.returnTo, "oauth_error", String(req.query.error)));
      return;
    }
    const clientId = getClientId();
    if (!clientId || typeof req.query.code !== "string") throw new Error("Deriv did not return a valid authorization code.");

    const response = await fetch(DERIV_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: req.query.code,
        code_verifier: state.verifier,
        redirect_uri: state.redirectUri,
      }),
    });
    const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !payload.access_token) throw new Error(payload.error || "Deriv did not return an access token.");

    setSession(res, req, {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
      activeMode: "demo",
    });
    res.redirect(withQuery(state.returnTo, "connected", "1"));
  } catch (error) {
    const returnTo = (() => {
      try {
        return unseal<OAuthState>(String(req.query.state ?? "")).returnTo;
      } catch {
        return fallback;
      }
    })();
    res.redirect(withQuery(returnTo, "oauth_error", error instanceof Error ? error.message : "oauth_failed"));
  }
});

router.get("/session", async (req, res) => {
  const session = await sessionForAuthRoute(req, res);
  if (res.headersSent) return;
  if (!session) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, expiresAt: session.expiresAt, activeMode: session.activeMode });
});

router.get("/account", async (req, res) => {
  const session = await sessionForAuthRoute(req, res);
  if (res.headersSent) return;
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  const mode = req.query.mode === "real" ? "real" : "demo";
  try {
    const account = (await readOptionsAccounts(session)).find(
      account => account.account_type === mode && account.status === "active",
    );
    if (!account) throw new DerivApiError(`No active ${mode} Deriv account is available.`, 409);
    res.setHeader("Cache-Control", "no-store");
    res.json({ authenticated: true, mode, balance: account.balance, currency: account.currency, loginid: account.account_id });
  } catch (error) {
    res.status(error instanceof DerivApiError ? error.statusCode : 502).json({
      error: error instanceof Error ? error.message : "Deriv balance is temporarily unavailable.",
    });
  }
});

router.post("/account/switch", async (req, res) => {
  const session = await sessionForAuthRoute(req, res);
  if (res.headersSent) return;
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  const mode: AccountMode = req.body?.mode === "real" ? "real" : "demo";
  try {
    const account = (await readOptionsAccounts(session)).find(
      account => account.account_type === mode && account.status === "active",
    );
    if (!account) throw new DerivApiError(`No active ${mode} Deriv account is available.`, 409);
    session.activeMode = mode;
    setSession(res, req, session);
    res.setHeader("Cache-Control", "no-store");
    res.json({ authenticated: true, mode, balance: account.balance, currency: account.currency, loginid: account.account_id });
  } catch (error) {
    res.status(error instanceof DerivApiError ? error.statusCode : 502).json({
      error: error instanceof Error ? error.message : "Deriv balance is temporarily unavailable.",
    });
  }
});

router.post("/logout", (req, res) => {
  clearSession(res, req);
  res.json({ ok: true });
});

export default router;