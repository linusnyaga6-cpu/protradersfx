const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PUBLIC_DIR = __dirname;
const TRADE_DIR = path.join(PUBLIC_DIR, 'trade');
const BUNDLED_APP_ASSET = fs.readFileSync(path.join(__dirname, 'assets/index-owner-access-timeout.js'), 'utf8');
const BUNDLED_STYLE_ASSET = fs.readFileSync(path.join(__dirname, 'assets/index-Cu5S4abW.css'), 'utf8');
const CANONICAL_ROBOTS = [
  'User-agent: *',
  'Allow: /',
  'Disallow: /sign-in',
  'Disallow: /sign-up',
  'Disallow: /account',
  'Disallow: /?view=',
  'Sitemap: https://protradersfx.com/sitemap.xml'
].join('\n') + '\n';
const CANONICAL_SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://protradersfx.com/</loc></url></urlset>\n';
const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || '';
const DERIV_PUBLIC_APP_ID = process.env.DERIV_PUBLIC_APP_ID || process.env.DERIV_APP_ID || '';
const DERIV_AFFILIATE_PARAM = process.env.DERIV_AFFILIATE_PARAM || 't';
const DERIV_AFFILIATE_TOKEN = process.env.DERIV_AFFILIATE_TOKEN || '';
const DERIV_AFFILIATE_ID = process.env.DERIV_AFFILIATE_ID || '';
const DERIV_CAMPAIGN = process.env.DERIV_CAMPAIGN || 'protraders-fx';
const DERIV_SCOPE = process.env.DERIV_SCOPE || 'trade account_manage';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = process.env.VERCEL ? path.join('/tmp', 'protraders-fx-analytics.json') : path.join(__dirname, 'data', 'analytics.json');
const DERIV_COMMISSION_RATE = Number.isFinite(Number(process.env.DERIV_COMMISSION_RATE)) ? Number(process.env.DERIV_COMMISSION_RATE) : null;
const OWNER_DERIV_LOGIN_IDS = new Set(String(process.env.PROTRADERS_OWNER_DERIV_LOGIN_IDS || '').split(/[\s,]+/).map((id) => id.trim().toUpperCase()).filter(Boolean));
// Read frontend assets explicitly so @vercel/node includes them in the function bundle.
const FRONTEND = {
  index: fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'),
  workspace: fs.readFileSync(path.join(__dirname, 'workspace.html'), 'utf8'),
  style: fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'),
  app: fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'),
  logo: fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8')
};
const CANONICAL_INDEX = (() => {
    const additions = [];
    if (!FRONTEND.index.includes('rel="canonical"')) additions.push('    <link rel="canonical" href="https://protradersfx.com/" />');
    if (!FRONTEND.index.includes('property="og:url"')) additions.push('    <meta property="og:url" content="https://protradersfx.com/" />');
    if (!additions.length || !FRONTEND.index.includes('</head>')) return FRONTEND.index;
    return FRONTEND.index.replace('</head>', additions.join('\n') + '\n  </head>');
    })();
    
if (!process.env.VERCEL) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ visitors: 0, registrations: 0, events: [] }, null, 2));
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { visitors: 0, registrations: 0, events: [] }; }
}
function writeData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
  catch (error) { console.warn('[analytics] transient storage unavailable:', error.message); }
}
function base64url(value) { return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function encryptionKey() { return crypto.createHash('sha256').update(SESSION_SECRET).digest(); }
function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${base64url(iv)}.${base64url(cipher.getAuthTag())}.${base64url(encrypted)}`;
}
function unseal(value) {
  const [iv, tag, data] = String(value || '').split('.');
  if (!iv || !tag || !data) throw new Error('Invalid session');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
}
function verifier() { return base64url(crypto.randomBytes(64)); }
function challenge(value) { return base64url(crypto.createHash('sha256').update(value).digest()); }
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_BUFFER_MS = 60 * 1000;
const sessionRefreshes = new Map();
function clearSessionCookie(res) {
  res.clearCookie('protraders_session', { httpOnly: true, secure: BASE_URL.startsWith('https://'), sameSite: 'lax', path: '/' });
}
async function refreshAccessToken(session) {
  if (!session.refreshToken) return null;
  const refreshKey = crypto.createHash('sha256').update(session.refreshToken).digest('hex');
  const current = sessionRefreshes.get(refreshKey);
  if (current) return current;
  const refresh = (async () => {
    if (!DERIV_CLIENT_ID) throw new Error('Deriv session refresh is not configured.');
    let response;
    try {
      response = await fetch('https://auth.deriv.com/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: DERIV_CLIENT_ID, refresh_token: session.refreshToken }),
        signal: AbortSignal.timeout(12_000)
      });
    } catch {
      throw new Error('Deriv session refresh is temporarily unavailable. Please try again shortly.');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.access_token !== 'string' || !payload.access_token) {
      if (response.status === 400 || response.status === 401) return null;
      throw new Error('Deriv session refresh is temporarily unavailable. Please try again shortly.');
    }
    const expiresIn = Number(payload.expires_in);
    return {
      ...session,
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === 'string' && payload.refresh_token ? payload.refresh_token : session.refreshToken,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000
    };
  })();
  sessionRefreshes.set(refreshKey, refresh);
  try {
    return await refresh;
  } finally {
    if (sessionRefreshes.get(refreshKey) === refresh) sessionRefreshes.delete(refreshKey);
  }
}
async function getSession(req, res) {
  let session;
  try { session = unseal(req.cookies?.protraders_session); }
  catch { return null; }
  if (!session?.accessToken) return null;
  const expiresAt = Number(session.expiresAt);
  if (Number.isFinite(expiresAt) && Date.now() + SESSION_REFRESH_BUFFER_MS < expiresAt) return session;
  const refreshed = await refreshAccessToken(session);
  if (!refreshed) {
    clearSessionCookie(res);
    return null;
  }
  saveSession(res, refreshed);
  return refreshed;
}
async function requireSession(req, res, unauthenticatedBody = { error: 'Not authenticated' }) {
  try {
    const session = await getSession(req, res);
    if (!session) {
      res.status(401).json(unauthenticatedBody);
      return null;
    }
    return session;
  } catch {
    res.status(503).json({ error: 'DERIV_SESSION_REFRESH_FAILED', message: 'Deriv session refresh is temporarily unavailable. Please try again shortly.' });
    return null;
  }
}
function saveSession(res, session) {
  res.cookie('protraders_session', seal(session), { httpOnly: true, secure: BASE_URL.startsWith('https://'), sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS, path: '/' });
}
const OPTIONS_API_BASE = 'https://api.derivws.com/trading/v1/options';
async function optionsRequest(pathname, accessToken, init = {}) {
  const headers = { Authorization: 'Bearer ' + accessToken, Accept: 'application/json', ...(init.headers || {}) };
  const response = await fetch(OPTIONS_API_BASE + pathname, { ...init, headers, signal: init.signal || AbortSignal.timeout(8000) });
  let body = null; try { body = await response.json(); } catch {}
  if (!response.ok) { const detail = body?.errors?.[0]?.message || body?.message || ('Options API request failed (' + response.status + ')'); const error = new Error(detail); error.code = 'OPTIONS_API_' + response.status; throw error; }
  return body?.data ?? body;
}
async function optionsAccounts(accessToken) {
  const rows = await optionsRequest('/accounts', accessToken);
  return (Array.isArray(rows) ? rows : []).map((account) => ({ account_id: account.account_id || '', loginid: account.loginid || account.account_id || '', currency: account.currency || 'USD', account_type: account.account_type || (account.is_virtual ? 'demo' : 'real'), is_virtual: account.account_type === 'demo' || Boolean(account.is_virtual), balance: Number(account.balance), token: accessToken })).filter((account) => account.account_id);
}
function accountIsDemo(account) { return Boolean(account?.is_virtual || account?.isVirtual || account?.account_type === 'demo' || /^VRT/i.test(String(account?.loginid || ''))); }
function accountSummary(account, balanceValue = null, balanceError = null) {
  const summary = { account_id: account.account_id || '', loginid: account.loginid || account.account_id || '', currency: account.currency || 'USD', is_virtual: accountIsDemo(account), balance: Number.isFinite(Number(balanceValue)) ? Number(balanceValue) : null };
  if (balanceError) summary.balanceError = 'Balance unavailable';
  return summary;
}
async function accountBalanceView(account, fallbackToken) {
  if (Number.isFinite(account.balance)) return accountSummary(account, account.balance, null);
  try { const response = await openDeriv(account.token || fallbackToken, { balance: 1 }); const value = response.balance || {}; return { ...accountSummary(account, Number(value.balance), null), loginid: value.loginid || account.loginid || account.account_id || '', currency: value.currency || account.currency || 'USD' }; }
  catch { return accountSummary(account, null, true); }
}
async function accountViews(session, accounts) { return Promise.all(accounts.map((account) => accountBalanceView(account, session.accessToken))); }
function normalizeAccounts(auth, fallbackToken) {
  const list = Array.isArray(auth?.account_list) ? auth.account_list : Array.isArray(auth?.accounts) ? auth.accounts : [];
  const accounts = list.map((account) => ({ loginid: account.loginid || account.account_id || '', currency: account.currency || auth.currency || 'USD', is_virtual: accountIsDemo(account), token: account.token || fallbackToken })).filter((account) => account.loginid || account.token);
  if (accounts.length) return accounts;
  return [{ loginid: auth?.loginid || '', currency: auth?.currency || 'USD', is_virtual: /^VRT/i.test(String(auth?.loginid || '')), token: fallbackToken }];
}
function safeReturnTo(value) { const target = String(value || '/?view=dashboard'); if (!target.startsWith('/') || target.startsWith('//')) return '/?view=dashboard'; if (/^\/workspace(?:\.html)?(?:[?#]|$)/.test(target)) return '/?view=dashboard'; return target; }
function withQuery(pathname, key, value) { const joiner = pathname.includes('?') ? '&' : '?'; return pathname + joiner + encodeURIComponent(key) + '=' + encodeURIComponent(value); }
function oauthUrl(mode, returnTo = '/?view=dashboard') {
  if (!DERIV_CLIENT_ID) throw new Error('DERIV_CLIENT_ID is not configured');
  const codeVerifier = verifier();
  const state = seal({ verifier: codeVerifier, mode, returnTo: safeReturnTo(returnTo), iat: Date.now() });
  const params = new URLSearchParams({ response_type: 'code', client_id: DERIV_CLIENT_ID, redirect_uri: BASE_URL + '/oauth/callback', scope: DERIV_SCOPE, state, code_challenge: challenge(codeVerifier), code_challenge_method: 'S256' });
  if (mode === 'signup') {
    if (!DERIV_AFFILIATE_TOKEN) throw new Error('Deriv signup attribution is not configured');
    params.set('prompt', 'registration'); params.set(DERIV_AFFILIATE_PARAM, DERIV_AFFILIATE_TOKEN); params.set('utm_campaign', DERIV_CAMPAIGN); params.set('utm_medium', 'affiliate');
    if (DERIV_AFFILIATE_ID) params.set('utm_source', DERIV_AFFILIATE_ID);
  }
  return 'https://auth.deriv.com/oauth2/auth?' + params.toString();
}
function openDeriv(accessToken, payload, authorizeOnly = false) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(DERIV_PUBLIC_APP_ID || '1089')}`);
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      callback(value);
    };
    timer = setTimeout(() => finish(reject, new Error('Deriv request timeout')), 12_000);
    ws.on('open', () => ws.send(JSON.stringify({ authorize: accessToken })));
    ws.on('message', (raw) => {
      let data; try { data = JSON.parse(raw.toString()); } catch { return; }
      if (data.error) { finish(reject, new Error(data.error.message || 'Deriv API error')); return; }
      if (data.msg_type === 'authorize') {
        if (authorizeOnly) { finish(resolve, data); return; }
        ws.send(JSON.stringify(payload)); return;
      }
      if (data.msg_type) finish(resolve, data);
    });
    ws.on('error', (error) => finish(reject, error));
    ws.on('close', () => finish(reject, new Error('Deriv connection closed before responding')));
  });
}
function openDerivPublic(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('Deriv market request timeout')); }, 10_000);
    ws.on('open', () => ws.send(JSON.stringify(payload)));
    ws.on('message', (raw) => {
      let data; try { data = JSON.parse(raw.toString()); } catch { return; }
      if (data.error) { clearTimeout(timer); try { ws.close(); } catch {}; reject(new Error(data.error.message || 'Deriv market error')); return; }
      if (data.msg_type === 'tick' || data.msg_type === 'active_symbols') { clearTimeout(timer); try { ws.close(); } catch {}; resolve(data); }
    });
    ws.on('error', (error) => { clearTimeout(timer); reject(error); });
    ws.on('close', () => clearTimeout(timer));
  });
}
async function authorizeAccounts(session) {
  try { const accounts = await optionsAccounts(session.accessToken); if (accounts.length) { session.accounts = accounts; return accounts; } } catch (error) { console.warn('[deriv options accounts]', error.message); }
  const auth = await openDeriv(session.accessToken, null, true); session.accounts = normalizeAccounts(auth, session.accessToken); return session.accounts;
}
async function accountsFor(session) { if (Array.isArray(session.accounts) && session.accounts.length) return session.accounts; return authorizeAccounts(session); }
async function isConfiguredOwnerSession(session, ownerLoginIds = OWNER_DERIV_LOGIN_IDS) { if (!ownerLoginIds.size) return false; const accounts = await accountsFor(session); return accounts.some((account) => ownerLoginIds.has(String(account.loginid || account.account_id || '').trim().toUpperCase())); }
async function refreshAccounts(session) {
  try { const accounts = await optionsAccounts(session.accessToken); if (accounts.length) { session.accounts = accounts; return accounts; } } catch (error) { console.warn('[deriv options refresh]', error.message); }
  return accountsFor(session);
}
function openOptions(accessToken, account, payload) {
  return new Promise(async (resolve, reject) => {
    try {
      const otp = await optionsRequest('/accounts/' + encodeURIComponent(account.account_id) + '/otp', accessToken, { method: 'POST' });
      const ws = new WebSocket(otp?.url || '');
      const timer = setTimeout(() => { try { ws.close(); } catch {}; reject(new Error('Deriv trading connection timeout')); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify(payload)));
      ws.on('message', (raw) => { let data; try { data = JSON.parse(raw.toString()); } catch { return; } if (data.error) { clearTimeout(timer); try { ws.close(); } catch {}; const error = new Error(data.error.message || 'Deriv trading error'); error.code = data.error.code || 'DERIV_TRADE_ERROR'; reject(error); return; } if (data.msg_type === 'proposal' || data.msg_type === 'buy') { clearTimeout(timer); try { ws.close(); } catch {}; resolve(data); } });
      ws.on('error', (error) => { clearTimeout(timer); reject(error); }); ws.on('close', () => clearTimeout(timer));
    } catch (error) { reject(error); }
  });
}
function derivDigitBarrierError(contractType, barrier) {
  if (contractType === 'DIGITOVER' && (!Number.isInteger(barrier) || barrier < 0 || barrier > 8)) return 'Over barrier must be a whole digit from 0 to 8.';
  if (contractType === 'DIGITUNDER' && (!Number.isInteger(barrier) || barrier < 1 || barrier > 9)) return 'Under barrier must be a whole digit from 1 to 9.';
  return null;
}
function executeOptions(accessToken, account, input) {
    return new Promise(async (resolve, reject) => {
      const barrierError = derivDigitBarrierError(input.contractType, input.barrier);
      if (barrierError) return reject(new Error(barrierError));
      let ws;
      let timer;
      let finished = false;
      let proposal = null;
      let buy = null;
      let buyRequestSent = false;
      const finish = (callback) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        try { ws?.close(); } catch {}
        callback();
      };
      const fail = (message) => {
        const contractId = buy ? Number(buy.contract_id) : NaN;
        const confirmedBuy = Boolean(buy && Number.isSafeInteger(contractId) && contractId > 0);
        if (input.awaitSettlement !== false && proposal && confirmedBuy) {
          finish(() => resolve({
            proposal,
            buy,
            contract: {
              contract_id: contractId,
              is_sold: 0,
              status: 'open',
              buy_price: buy.buy_price ?? proposal.ask_price,
              currency: proposal.currency || input.currency
            },
            settlementPending: true,
            settlementError: message,
            orderStatusUnknown: false
          }));
          return;
        }
        if (proposal && buyRequestSent) {
          finish(() => resolve({
            proposal,
            buy: buy || { buy_price: proposal.ask_price },
            contract: input.awaitSettlement === false ? null : {
              is_sold: 0,
              status: 'unknown',
              buy_price: buy?.buy_price ?? proposal.ask_price,
              currency: proposal.currency || input.currency
            },
            settlementPending: false,
            orderStatusUnknown: true,
            settlementError: message
          }));
          return;
        }
        finish(() => reject(new Error(message)));
      };
      try {
        const otp = await optionsRequest('/accounts/' + encodeURIComponent(account.account_id) + '/otp', accessToken, { method: 'POST' });
        ws = new WebSocket(otp?.url || '');
        timer = setTimeout(() => fail('Deriv execution did not settle within the allowed time.'), 30_000);
        ws.on('open', () => ws.send(JSON.stringify({
          proposal: 1,
          amount: input.amount,
          basis: 'stake',
          contract_type: input.contractType,
          currency: input.currency,
          duration: input.duration,
          duration_unit: input.durationUnit,
          underlying_symbol: input.symbol,
          ...(input.barrier === undefined ? {} : { barrier: String(input.barrier) })
        })));
        ws.on('message', (raw) => {
          let data;
          try { data = JSON.parse(raw.toString()); } catch { fail('Deriv returned an unreadable execution response.'); return; }
          if (data.error) { const detail = data.error.message || 'Deriv rejected the execution request.'; fail(data.error.code ? String(data.error.code) + ': ' + detail : detail); return; }
          if (data.msg_type === 'proposal' && data.proposal) {
            proposal = data.proposal;
            if (!proposal.id || !Number.isFinite(Number(proposal.ask_price))) { fail('Deriv did not return a purchasable proposal.'); return; }
            try {
              ws.send(JSON.stringify({ buy: proposal.id, price: Number(proposal.ask_price) }));
              buyRequestSent = true;
            } catch (error) {
              fail(error instanceof Error ? error.message : 'Deriv buy request could not be sent.');
            }
            return;
          }
          if (data.msg_type === 'buy' && data.buy) {
            buy = data.buy;
            if (!buy.contract_id) { fail('Deriv did not return a contract ID.'); return; }
            if (input.awaitSettlement === false) { finish(() => resolve({ proposal, buy, contract: null })); return; }
            const contractId = Number(buy.contract_id);
            if (!Number.isSafeInteger(contractId) || contractId < 1) { fail('Deriv confirmed the buy but returned an invalid contract ID.'); return; }
            ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 }));
            return;
          }
          if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
            const contract = data.proposal_open_contract;
            const settled = contract.is_sold === 1 || contract.status === 'won' || contract.status === 'lost';
            if (settled && proposal && buy) finish(() => resolve({ proposal, buy, contract }));
          }
        });
        ws.on('error', () => fail('Deriv execution connection failed.'));
        ws.on('close', () => { if (!finished) fail('Deriv closed the execution connection before settlement.'); });
      } catch (error) { fail(error instanceof Error ? error.message : 'Deriv execution failed.'); }
    });
    }
function selectedAccount(session, mode) {
  const accounts = Array.isArray(session.accounts) ? session.accounts : [];
  return accounts.find((account) => mode === 'demo' ? accountIsDemo(account) : !accountIsDemo(account)) || null;
}
async function requestForMode(session, mode, payload) {
  const accounts = await accountsFor(session);
  const account = selectedAccount(session, mode);
  if (!account) { const error = new Error(`No ${mode} account is linked to this Deriv login`); error.code = 'ACCOUNT_MODE_UNAVAILABLE'; throw error; }
  return { response: await openDeriv(account.token || session.accessToken, payload), account, accounts };
}

function activeLoginIdForSession(session) {
    const account = selectedAccount(session, session.activeMode || 'demo');
    return account?.loginid || account?.account_id || 'authenticated-deriv-session';
    }
    function recordSettledTrade(session, mode, symbol, trade) {
    const data = readData();
    if (!Array.isArray(data.events)) data.events = [];
    data.events.push({ type: 'trade_settled', loginid: activeLoginIdForSession(session), mode, symbol, amount: Number(trade.amount) || 0, profit: typeof trade.profit === 'number' ? trade.profit : null, currency: trade.currency || 'USD', at: new Date().toISOString() });
    if (data.events.length > 5000) data.events = data.events.slice(-5000);
    writeData(data);
    }
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()) : [BASE_URL];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'https://auth.deriv.com', 'https://api.derivws.com', 'wss://*.derivws.com', 'https://*.clerk.accounts.dev', 'https://clerk-telemetry.com', ...require('./scripts/currency-connect-sources.cjs')], scriptSrc: ["'self'", 'https://*.clerk.accounts.dev'], workerSrc: ["'self'", 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], frameAncestors: ["'none'"] } }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 180, standardHeaders: true, legacyHeaders: false }));

app.use('/trade/assets', express.static(path.join(TRADE_DIR, 'assets'), { maxAge: '1y', immutable: true }));
app.use('/trade', express.static(TRADE_DIR, { extensions: ['html'] }));
app.get(/^\/trade(?:\/.*)?$/, (req, res) => res.sendFile(path.join(TRADE_DIR, 'index.html')));
app.get('/api/config', (req, res) => res.json({ configured: Boolean(DERIV_CLIENT_ID && DERIV_AFFILIATE_TOKEN), publicAppConfigured: Boolean(DERIV_PUBLIC_APP_ID), partnerParam: DERIV_AFFILIATE_PARAM, campaign: DERIV_CAMPAIGN }));
const PUBLIC_MARKET_SYMBOLS = new Set(['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V']);
app.get('/api/market/tick', async (req, res) => {
  const symbol = String(req.query.symbol || 'frxEURUSD');
  if (!PUBLIC_MARKET_SYMBOLS.has(symbol)) return res.status(400).json({ error: 'Unsupported market symbol' });
  try {
    const tick = await openDerivPublic({ ticks: symbol });
    res.set('Cache-Control', 'no-store').json({ msg_type: 'tick', tick: tick.tick, server_time: tick.server_time });
  } catch (error) {
    res.status(502).json({ error: 'Market feed unavailable', message: error.message });
  }
});
app.post('/api/track', (req, res) => { const type = String(req.body?.type || 'page_view').slice(0, 40); const data = readData(); if (type === 'page_view') data.visitors++; data.events.push({ type, at: new Date().toISOString(), path: String(req.body?.path || '/').slice(0, 200) }); if (data.events.length > 5000) data.events = data.events.slice(-5000); writeData(data); res.status(204).end(); });
app.get('/api/owner/access', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const session = await requireSession(req, res, { error: 'Authenticated Deriv session required' });
    if (!session) return;
    if (!OWNER_DERIV_LOGIN_IDS.size) return res.json({ isOwner: false });
    try {
      const isOwner = await isConfiguredOwnerSession(session);
      saveSession(res, session);
      res.json({ isOwner });
    } catch (error) {
      res.status(502).json({ error: 'Owner account verification is temporarily unavailable.', message: error.message });
    }
    });
    app.get('/api/analytics', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const session = await requireSession(req, res, { error: 'Authenticated Deriv session required' });
    if (!session) return;
    if (!OWNER_DERIV_LOGIN_IDS.size) return res.status(503).json({ error: 'Owner access is not configured.' });
    try {
      if (!(await isConfiguredOwnerSession(session))) return res.status(403).json({ error: 'Owner access is required.' });
      saveSession(res, session);
      const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const events = Array.isArray(readData().events) ? readData().events : [];
      const trades = events.filter((event) => event.type === 'trade_settled' && Number.isFinite(Date.parse(event.at)) && Date.parse(event.at) >= since);
      const resultFor = (event) => ['won', 'lost', 'pending'].includes(event.result) ? event.result : typeof event.profit === 'number' ? (event.profit > 0 ? 'won' : event.profit < 0 ? 'lost' : 'pending') : 'pending';
      const currencies = new Map();
      for (const event of trades) {
        const currency = String(event.currency || 'USD').toUpperCase();
        const total = currencies.get(currency) || 0;
        currencies.set(currency, total + (Number(event.amount) || 0));
      }
      const result = {
        periodDays: 30,
        activeUsers: new Set(trades.map((event) => String(event.loginid || '').toUpperCase()).filter(Boolean)).size,
        settledTrades: trades.filter((event) => ['won', 'lost'].includes(resultFor(event))).length,
        commissionRate: DERIV_COMMISSION_RATE,
        currencyTotals: Array.from(currencies, ([currency, tradingAmount]) => ({
          currency,
          tradingAmount: Math.round(tradingAmount * 100) / 100,
          expectedCommission: DERIV_COMMISSION_RATE === null ? null : Math.round(tradingAmount * DERIV_COMMISSION_RATE * 100) / 100
        })).sort((a, b) => a.currency.localeCompare(b.currency)),
        recentTrades: trades.slice(-50).reverse().map((event) => ({
          accountRef: event.loginid ? '••••' + String(event.loginid).slice(-4) : 'Deriv account',
          mode: event.mode === 'real' ? 'real' : 'demo',
          symbol: event.symbol || '—',
          contractType: event.contractType || 'Contract',
          amount: Number(event.amount) || 0,
          currency: String(event.currency || 'USD').toUpperCase(),
          profit: typeof event.profit === 'number' && Number.isFinite(event.profit) ? event.profit : null,
          result: resultFor(event),
          at: new Date(event.at).toISOString()
        }))
      };
      res.json(result);
    } catch (error) {
      res.status(502).json({ error: 'Owner activity is temporarily unavailable.', message: error.message });
    }
    });
    app.get('/api/deriv/login', (req, res) => { try { res.redirect(oauthUrl('login', req.query.returnTo)); } catch (error) { res.status(503).json({ error: error.message }); } });
app.get('/api/deriv/signup', (req, res) => { try { const data = readData(); data.events.push({ type: 'referral_signup_started', at: new Date().toISOString() }); writeData(data); res.redirect(oauthUrl('signup', req.query.returnTo)); } catch (error) { res.status(503).json({ error: error.message }); } });
app.get('/oauth/callback', async (req, res) => {
  let state = null;
  try { state = unseal(req.query.state); } catch {}
  const returnTo = safeReturnTo(state?.returnTo);
  try {
    if (req.query.error) return res.redirect(withQuery(returnTo, 'oauth_error', String(req.query.error)));
    if (!state?.verifier || !['login', 'signup'].includes(state.mode) || Date.now() - state.iat > 600_000) throw new Error('Invalid or expired OAuth state');
    if (!req.query.code) throw new Error('Missing OAuth authorization code');
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: DERIV_CLIENT_ID, code: String(req.query.code), code_verifier: state.verifier, redirect_uri: BASE_URL + '/oauth/callback' });
    const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(12_000) });
    if (!tokenResponse.ok) throw new Error('Token exchange failed (' + tokenResponse.status + ')');
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('No access token returned');
    const session = { accessToken: token.access_token, refreshToken: token.refresh_token || null, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, accounts: [], activeMode: 'demo' };
    saveSession(res, session);
    const data = readData(); data.events.push({ type: state.mode === 'signup' ? 'oauth_signup_success' : 'oauth_login_success', at: new Date().toISOString() }); if (state.mode === 'signup') { data.registrations = (data.registrations || 0) + 1; data.events.push({ type: 'registration_complete', at: new Date().toISOString() }); } writeData(data);
    res.redirect(withQuery(returnTo, 'connected', '1'));
  } catch (error) { console.error(error.message); res.redirect(withQuery(returnTo, 'oauth_error', 'oauth_failed')); }
});
app.get('/api/session', async (req, res) => { res.set('Cache-Control', 'no-store'); try { const session = await getSession(req, res); if (!session) return res.json({ authenticated: false }); res.json({ authenticated: true, expiresAt: session.expiresAt, activeMode: session.activeMode || 'demo' }); } catch { res.status(503).json({ authenticated: false, error: 'Deriv session refresh is temporarily unavailable. Please try again shortly.' }); } });
app.post('/api/logout', (req, res) => { res.clearCookie('protraders_session', { httpOnly: true, secure: BASE_URL.startsWith('https://'), sameSite: 'lax', path: '/' }); res.status(204).end(); });
app.get('/api/accounts', async (req, res) => { const session = await requireSession(req, res, { authenticated: false }); if (!session) return; try { const accounts = await refreshAccounts(session); const views = await accountViews(session, accounts); saveSession(res, session); res.json({ authenticated: true, accounts: views, activeMode: session.activeMode || 'demo' }); } catch (error) { res.status(502).json({ error: error.code || 'Account list unavailable', message: error.message }); } });
app.post('/api/account/switch', async (req, res) => { const session = await requireSession(req, res, { authenticated: false }); if (!session) return; const mode = req.body?.mode === 'real' ? 'real' : 'demo'; try { const accounts = await refreshAccounts(session); const account = selectedAccount(session, mode); if (!account) return res.status(409).json({ error: 'ACCOUNT_MODE_UNAVAILABLE', message: 'No ' + mode + ' account is linked to this Deriv login.' }); session.activeMode = mode; const views = await accountViews(session, accounts); const current = views.find((item) => item.account_id === account.account_id) || accountSummary(account, account.balance); saveSession(res, session); res.json({ authenticated: true, mode, loginid: current.loginid, currency: current.currency, balance: current.balance, accounts: views }); } catch (error) { res.status(502).json({ error: error.code || 'Account switch failed', message: error.message }); } });
app.get('/api/account', async (req, res) => { const session = await requireSession(req, res, { authenticated: false }); if (!session) return; const mode = req.query.mode === 'real' ? 'real' : req.query.mode === 'demo' ? 'demo' : session.activeMode || 'demo'; try { const accounts = await refreshAccounts(session); const account = selectedAccount(session, mode); if (!account) { const error = new Error('No ' + mode + ' account is linked to this Deriv login'); error.code = 'ACCOUNT_MODE_UNAVAILABLE'; throw error; } const current = accountSummary(account, account.balance); session.activeMode = mode; saveSession(res, session); res.json({ authenticated: true, mode, balance: current.balance, currency: current.currency, loginid: current.loginid, account: current, openPnl: 0, accounts: await accountViews(session, accounts) }); } catch (error) { res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.code || 'Account data unavailable', message: error.message }); } });

    app.post('/api/deriv/proposal', async (req, res) => {
      const session = await requireSession(req, res);
      if (!session) return;
      const mode = session.activeMode === 'real' ? 'real' : 'demo';
      const symbol = String(req.body?.symbol || '');
      const contractType = String(req.body?.contractType || '');
      const amount = Number(req.body?.amount);
      const duration = Number(req.body?.duration);
      const durationUnit = ['t', 's', 'm'].includes(req.body?.durationUnit) ? req.body.durationUnit : 't';
      const barrier = req.body?.barrier === undefined || req.body?.barrier === '' ? undefined : Number(req.body.barrier);
      const validSymbol = /^(1HZ\d+V|R_\d+|frx[A-Z]{6})$/.test(symbol);
      const validContract = ['CALL', 'PUT', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType);
      if (['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType) && !/^(1HZ\d+V|R_\d+)$/.test(symbol)) return res.status(400).json({ error: 'Digit contracts require a Volatility market. Select one before trading.' });
      if (!validSymbol) return res.status(400).json({ error: 'Choose a valid Deriv market symbol.' });
      if (!validContract) return res.status(400).json({ error: 'Unsupported Deriv contract type.' });
      if (!Number.isFinite(amount) || amount < 0.35 || amount > 10000) return res.status(400).json({ error: 'Stake must be between 0.35 and 10,000.' });
      if (!Number.isInteger(duration) || duration < 1 || duration > 365) return res.status(400).json({ error: 'Duration must be a whole number from 1 to 365.' });
      const needsBarrier = contractType === 'DIGITOVER' || contractType === 'DIGITUNDER';
      const barrierError = derivDigitBarrierError(contractType, barrier); if (barrierError) return res.status(400).json({ error: barrierError });
      try {
        await accountsFor(session);
        const account = selectedAccount(session, mode);
        if (!account) { const error = new Error('No ' + mode + ' account is linked to this Deriv login'); error.code = 'ACCOUNT_MODE_UNAVAILABLE'; throw error; }
        const response = await openOptions(session.accessToken, account, {
          proposal: 1,
          amount,
          basis: 'stake',
          contract_type: contractType,
          currency: account.currency || 'USD',
          duration,
          duration_unit: durationUnit,
          underlying_symbol: symbol,
          ...(needsBarrier ? { barrier: String(barrier) } : {})
        });
        const proposal = response?.proposal;
        const finite = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
        const askPrice = finite(proposal?.ask_price);
        const payout = finite(proposal?.payout);
        if (!proposal || askPrice === null || payout === null) return res.status(502).json({ error: 'Deriv did not return a valid proposal quote.' });
        return res.json({
          proposal: {
            id: proposal.id || null,
            askPrice,
            payout,
            spot: finite(proposal.spot),
            displayValue: finite(proposal.display_value),
            longcode: proposal.longcode || null,
            currency: proposal.currency || account.currency || 'USD'
          },
          execution: 'proposal-only'
        });
      } catch (error) {
        return res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.message || 'Unable to request a Deriv proposal.' });
      }
    });
    app.post('/api/deriv/execute', async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Explicit execution confirmation is required.' });
    const mode = req.body?.mode === 'real' ? 'real' : 'demo';
    const symbol = String(req.body?.symbol || '');
    const contractType = String(req.body?.contractType || '');
    const amount = Number(req.body?.amount);
    const duration = Number(req.body?.duration);
    const durationUnit = ['t', 's', 'm'].includes(req.body?.durationUnit) ? req.body.durationUnit : 't';
    const barrier = req.body?.barrier === undefined || req.body?.barrier === '' ? undefined : Number(req.body.barrier);
    const validSymbol = /^(1HZ\d+V|R_\d+|frx[A-Z]{6})$/.test(symbol);
    const validContract = ['CALL', 'PUT', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType);
    if (['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType) && !/^(1HZ\d+V|R_\d+)$/.test(symbol)) return res.status(400).json({ error: 'Digit contracts require a Volatility market. Select one before trading.' });
    if (!validSymbol) return res.status(400).json({ error: 'Choose a valid Deriv market symbol.' });
    if (!validContract) return res.status(400).json({ error: 'Unsupported Deriv contract type "' + contractType.slice(0, 40) + '". Choose CALL, PUT, DIGITOVER, DIGITUNDER, DIGITEVEN, or DIGITODD.' });
    if (!Number.isFinite(amount) || amount < 0.35 || amount > 10000) return res.status(400).json({ error: 'Stake must be between 0.35 and 10,000.' });
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) return res.status(400).json({ error: 'Duration must be a whole number from 1 to 365.' });
    const barrierError = derivDigitBarrierError(contractType, barrier); if (barrierError) return res.status(400).json({ error: barrierError });
    try {
      const accounts = await accountsFor(session);
      const account = selectedAccount(session, mode);
      if (!account) { const error = new Error('No ' + mode + ' account is linked to this Deriv login'); error.code = 'ACCOUNT_MODE_UNAVAILABLE'; throw error; }
      const execution = await executeOptions(session.accessToken, account, { symbol, contractType, amount, duration, durationUnit, currency: account.currency || 'USD', barrier });
      session.activeMode = mode;
      saveSession(res, session);
      const contract = execution.contract;
      res.json({ execution: 'live', trade: {
        type: contractType,
        contractType,
        barrier: barrier === undefined ? null : barrier,
        marketName: symbol,
        contractId: execution.buy.contract_id || null,
        transactionId: execution.buy.transaction_id || null,
        stake: amount,
        buyPrice: contract.buy_price ?? execution.buy.buy_price ?? execution.proposal.ask_price ?? amount,
        currency: contract.currency || execution.proposal.currency || account.currency || 'USD',
        result: contract.status === 'won' ? 'won' : contract.status === 'lost' ? 'lost' : 'pending',
        status: contract.status || null,
         settlementPending: execution.settlementPending === true,
        orderStatusUnknown: execution.orderStatusUnknown === true,
        profit: contract.profit !== null && contract.profit !== undefined && Number.isFinite(Number(contract.profit)) ? Number(contract.profit) : (contract.payout !== null && contract.payout !== undefined && Number.isFinite(Number(contract.payout)) && Number.isFinite(Number(contract.buy_price ?? execution.buy.buy_price ?? execution.proposal.ask_price ?? amount)) ? Number(contract.payout) - Number(contract.buy_price ?? execution.buy.buy_price ?? execution.proposal.ask_price ?? amount) : contract.status === 'lost' && Number.isFinite(Number(contract.buy_price ?? execution.buy.buy_price ?? execution.proposal.ask_price ?? amount)) ? -Math.abs(Number(contract.buy_price ?? execution.buy.buy_price ?? execution.proposal.ask_price ?? amount)) : null),
        payout: contract.payout !== null && contract.payout !== undefined && Number.isFinite(Number(contract.payout)) ? Number(contract.payout) : null,
        entrySpot: contract.entry_spot ?? contract.entry_tick ?? null,
        exitSpot: contract.exit_spot ?? contract.exit_tick ?? null
      }});
    } catch (error) {
      res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.code || 'Trade execution failed', message: error.message });
    }
    });
    app.get('/api/live-trading/eligibility', async (req, res) => {
  const session = await requireSession(req, res, { eligible: false, reason: 'Connect a Deriv account to check live-trading booking eligibility.' });
  if (!session) return;
  try {
    const accounts = await accountsFor(session);
    const realAccounts = accounts.filter((account) => !accountIsDemo(account));
    const hasUsdAccount = realAccounts.some((account) => String(account.currency || '').toUpperCase() === 'USD');
    const eligible = realAccounts.some((account) => String(account.currency || '').toUpperCase() === 'USD' && Number.isFinite(Number(account.balance)) && Number(account.balance) > 100);
    return res.json({ eligible, reason: eligible ? 'Verified real USD account above $100.' : !realAccounts.length ? 'A real Deriv account is required for live-trading booking.' : hasUsdAccount ? 'The real USD account balance must be above $100.' : 'A USD-denominated real account is required for live-trading booking.' });
  } catch (error) {
    return res.status(502).json({ eligible: false, error: error.code || 'ACCOUNT_DATA_UNAVAILABLE', reason: error.message || 'Unable to verify real-account eligibility.' });
  }
});

app.post('/api/premium-bots/execute', async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Start the bot before submitting an order.' });
  const botId = Number(req.body?.botId);
  if (!Number.isInteger(botId) || botId < 1 || botId > 12) return res.status(400).json({ error: 'Choose a valid Deriv Pro Bot.' });
  const symbol = String(req.body?.symbol || '');
  const contractType = String(req.body?.contractType || '');
  const amount = Number(req.body?.amount);
  const duration = Number(req.body?.duration);
  const durationUnit = ['t', 's', 'm'].includes(req.body?.durationUnit) ? req.body.durationUnit : 't';
  const barrier = req.body?.barrier === undefined || req.body?.barrier === '' ? undefined : Number(req.body.barrier);
  const validSymbol = /^(1HZ\d+V|R_\d+|frx[A-Z]{6})$/.test(symbol);
  const validContract = ['CALL', 'PUT', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType);
  if (['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'].includes(contractType) && !/^(1HZ\d+V|R_\d+)$/.test(symbol)) return res.status(400).json({ error: 'Digit contracts require a Volatility market. Select one before trading.' });
  if (!validSymbol) return res.status(400).json({ error: 'Choose a valid Deriv market symbol.' });
  if (!validContract) return res.status(400).json({ error: 'Unsupported Deriv contract type "' + contractType.slice(0, 40) + '". Choose CALL, PUT, DIGITOVER, DIGITUNDER, DIGITEVEN, or DIGITODD.' });
  const allowedContracts = { 1: ['DIGITEVEN', 'DIGITODD'], 2: ['DIGITEVEN', 'DIGITODD'], 3: ['DIGITEVEN', 'DIGITODD'], 4: ['DIGITEVEN', 'DIGITODD'], 5: ['DIGITOVER'], 6: ['DIGITUNDER'], 7: ['CALL', 'PUT'], 8: ['CALL', 'PUT'], 9: ['CALL', 'PUT'], 10: ['DIGITEVEN', 'DIGITODD'], 11: ['DIGITEVEN'], 12: ['DIGITODD'] };
  if (!allowedContracts[botId].includes(contractType)) return res.status(400).json({ error: 'This bot cannot place that contract type.' });
  if (!Number.isFinite(amount) || amount < 0.35 || amount > 10000) return res.status(400).json({ error: 'Stake must be between 0.35 and 10,000.' });
  if (!Number.isInteger(duration) || duration < 1 || duration > 365) return res.status(400).json({ error: 'Duration must be a whole number from 1 to 365.' });
  const needsBarrier = contractType === 'DIGITOVER' || contractType === 'DIGITUNDER';
  const barrierError = derivDigitBarrierError(contractType, barrier); if (barrierError) return res.status(400).json({ error: barrierError });
  const requestedMode = req.body?.mode;
  const mode = requestedMode === 'real' || requestedMode === 'demo' ? requestedMode : session.activeMode === 'real' ? 'real' : 'demo';
  try {
    await accountsFor(session);
    const account = selectedAccount(session, mode);
    if (!account) return res.status(409).json({ error: 'No ' + mode + ' account is linked to this Deriv login.' });
    const execution = await executeOptions(session.accessToken, account, { symbol, contractType, amount, duration, durationUnit, currency: account.currency || 'USD', barrier: needsBarrier ? barrier : undefined });
    const { proposal, buy, contract } = execution;
    const finite = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const buyPrice = finite(contract.buy_price) ?? finite(buy.buy_price) ?? finite(proposal.ask_price) ?? amount;
    const payout = finite(contract.payout);
    const profit = finite(contract.profit) ?? (payout !== null ? payout - buyPrice : contract.status === 'lost' ? -Math.abs(buyPrice) : null);
    const result = contract.status === 'won' || (profit !== null && profit > 0) ? 'won' : contract.status === 'lost' || (profit !== null && profit < 0) ? 'lost' : 'pending';
    session.activeMode = mode;
    saveSession(res, session);
    return res.json({ execution: 'live', trade: { botId, contractId: buy.contract_id || null, transactionId: buy.transaction_id || null, type: contractType, contractType, barrier: needsBarrier ? barrier : undefined, stake: amount, buyPrice, currency: proposal.currency || account.currency || 'USD', mode, result, status: contract.status || null,
         settlementPending: execution.settlementPending === true,
        orderStatusUnknown: execution.orderStatusUnknown === true, profit, payout, entrySpot: contract.entry_spot ?? contract.entry_tick ?? null, exitSpot: contract.exit_spot ?? contract.exit_tick ?? null } });
  } catch (error) {
    return res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.message || 'Unable to execute this Deriv Pro Bot trade.' });
  }
});
app.post('/api/trades', async (req, res) => {
      const session = await requireSession(req, res);
      if (!session) return;
      const mode = req.body?.mode === 'real' ? 'real' : 'demo';
      const symbol = String(req.body?.symbol || 'R_100');
      const type = ['CALL', 'PUT'].includes(req.body?.contract_type) ? req.body.contract_type : null;
      const stake = Number(req.body?.stake);
      const duration = Number(req.body?.duration);
      if (!type || !/^([A-Z0-9_]+|frx[A-Z]+)$/.test(symbol) || !Number.isFinite(stake) || stake <= 0 || !Number.isFinite(duration) || duration < 1 || duration > 3600) return res.status(400).json({ error: 'Invalid trade parameters' });
      try {
        await accountsFor(session);
        const selected = selectedAccount(session, mode);
        if (!selected) { const error = new Error('No ' + mode + ' account is linked to this Deriv login'); error.code = 'ACCOUNT_MODE_UNAVAILABLE'; throw error; }
        const execution = await executeOptions(session.accessToken, selected, {
          symbol, contractType: type, amount: stake, duration, durationUnit: 't',
          currency: selected.currency || 'USD', awaitSettlement: false,
        });
        const { buy } = execution;
        session.activeMode = mode;
        saveSession(res, session);
        res.json({ ok: true, mode, contractType: type, orderStatusUnknown: execution.orderStatusUnknown === true, message: execution.orderStatusUnknown ? 'Deriv did not confirm whether this order was placed. Check Deriv transaction history before retrying.' : mode.toUpperCase() + ' ' + (type === 'CALL' ? 'RISE' : 'FALL') + ' opened on ' + symbol + '. Contract ' + (buy.contract_id || 'created') + '.', contractId: buy.contract_id || null });
      } catch (error) {
        res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.code || 'Trade request failed', message: error.message });
      }
    });
app.post('/api/bot', async (req, res) => { const session = await requireSession(req, res); if (!session) return; const action = req.body?.action === 'start' ? 'start' : 'stop'; res.json({ ok: true, message: action === 'start' ? 'Free bot interface started in controlled mode. Live bot execution remains disabled until the bot adapter is separately tested.' : 'Free bot stopped.', execution: 'interface_only' }); });
app.get('/api/preflight', (req, res) => res.json({ productionBaseUrl: BASE_URL, redirectUri: `${BASE_URL}/oauth/callback`, https: BASE_URL.startsWith('https://'), oauthClientConfigured: Boolean(DERIV_CLIENT_ID), partnerTrackingConfigured: Boolean(DERIV_AFFILIATE_TOKEN), sessionSecretConfigured: Boolean(process.env.SESSION_SECRET), readyForControlledLiveTest: Boolean(BASE_URL.startsWith('https://') && DERIV_CLIENT_ID && DERIV_AFFILIATE_TOKEN && process.env.SESSION_SECRET) }));
app.get('/health', (req, res) => res.json({ ok: true, service: 'protraders-fx', time: new Date().toISOString() }));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(CANONICAL_ROBOTS));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(CANONICAL_SITEMAP));
app.get('/app-config.js', (req, res) => res.type('application/javascript').send(`window.PROTRADERS_PUBLIC_APP_ID=${JSON.stringify(DERIV_PUBLIC_APP_ID)};`));
app.get('/assets/index-uMDRSu-e.js', (req, res) => res.type('application/javascript').send(BUNDLED_APP_ASSET));
app.get('/assets/index-owner-access-fix.js', (req, res) => res.type('application/javascript').send(BUNDLED_APP_ASSET));
app.get('/assets/index-owner-access-timeout.js', (req, res) => res.type('application/javascript').send(BUNDLED_APP_ASSET));
app.get('/assets/index-Cu5S4abW.css', (req, res) => res.type('text/css').send(BUNDLED_STYLE_ASSET));
app.get('/style.css', (req, res) => res.type('text/css').send(FRONTEND.style));
app.get('/app.js', (req, res) => res.type('application/javascript').send(FRONTEND.app));
app.get('/logo.svg', (req, res) => res.type('image/svg+xml').send(FRONTEND.logo));
app.get('/workspace', (req, res) => res.redirect(302, '/?view=dashboard'));
app.get('/workspace.html', (req, res) => res.redirect(302, '/?view=dashboard'));
for (const page of ['marketplace', 'course', 'signals', 'manual', 'builder']) app.get(`/${page}`, (req, res) => res.type('html').send(CANONICAL_INDEX));
app.get('/', (req, res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate').type('html').send(CANONICAL_INDEX));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => res.type('html').send(CANONICAL_INDEX));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }); });

module.exports = app;
if (!process.env.VERCEL && require.main === module) app.listen(PORT, () => console.log(`[PROTRADERS FX] running on ${BASE_URL}`));
