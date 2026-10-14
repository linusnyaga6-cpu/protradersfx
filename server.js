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
const BUNDLED_APP_ASSET = fs.readFileSync(path.join(__dirname, 'assets/index-uMDRSu-e.js'), 'utf8');
const BUNDLED_STYLE_ASSET = fs.readFileSync(path.join(__dirname, 'assets/index-Cu5S4abW.css'), 'utf8');
const USD_KES_CONVERTER_ASSET = "(function () {\n  \"use strict\";\n  if (window.__ptUsdKesConverterInstalled) return;\n  window.__ptUsdKesConverterInstalled = true;\n  var SYMBOL = \"frxUSDKES\";\n  var WS_URL = \"wss://api.derivws.com/trading/v1/options/ws/public\";\n  var rate = null;\n  var socket = null;\n  var reconnectTimer = null;\n  var direction = \"USD_TO_KES\";\n  var css = [\n    \".pt-usd-kes-widget{position:relative;display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-start;gap:2px;margin:0 4px;color:#1d3157;font-family:Inter,Arial,sans-serif}\",\n    \".pt-usd-kes-trigger{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid #c6d7f5;border-radius:8px;background:#f2f6ff;color:#2853b8;font:800 9px/1.15 Inter,Arial,sans-serif;white-space:nowrap;cursor:pointer}\",\n    \".pt-usd-kes-trigger:hover,.pt-usd-kes-trigger:focus-visible{background:#e7efff;border-color:#7698e3;outline:none}\",\n    \".pt-usd-kes-balance{color:#28766e;font:700 8px/1.2 Inter,Arial,sans-serif;white-space:nowrap}\",\n    \".pt-usd-kes-popover{position:absolute;top:calc(100% + 8px);right:0;z-index:99999;display:grid;width:286px;max-width:calc(100vw - 24px);gap:10px;box-sizing:border-box;padding:14px;border:1px solid #d7e2f3;border-radius:14px;background:#fff;color:#172544;box-shadow:0 16px 38px rgba(25,44,86,.22);font:12px/1.45 Inter,Arial,sans-serif}\",\n    \".pt-usd-kes-popover[hidden]{display:none}\",\n    \".pt-usd-kes-head{display:flex;align-items:center;justify-content:space-between;gap:10px}\",\n    \".pt-usd-kes-head strong{font-size:14px;color:#17346e}\",\n    \".pt-usd-kes-head small{display:block;color:#71809a;font-size:10px}\",\n    \".pt-usd-kes-close{width:27px;height:27px;border:0;border-radius:8px;background:#f1f4fa;color:#42516e;font-size:18px;cursor:pointer}\",\n    \".pt-usd-kes-amount{display:grid;gap:5px;color:#465676;font-size:10px;font-weight:700}\",\n    \".pt-usd-kes-amount input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #d2dced;border-radius:9px;background:#fff;color:#192c53;font:600 14px Inter,Arial,sans-serif}\",\n    \".pt-usd-kes-swap{justify-self:start;padding:6px 9px;border:1px solid #d3def0;border-radius:8px;background:#f5f8ff;color:#3159aa;font:700 10px Inter,Arial,sans-serif;cursor:pointer}\",\n    \".pt-usd-kes-output{display:grid;gap:4px;padding:10px 11px;border-radius:10px;background:#eef4ff}\",\n    \".pt-usd-kes-output small{color:#6b7891;font-size:9px;font-weight:800;letter-spacing:.06em}\",\n    \".pt-usd-kes-output strong{color:#1e4ba5;font-size:17px}\",\n    \".pt-usd-kes-rate{margin:0;color:#64738d;font-size:10px}\",\n    \".pt-usd-kes-disclaimer{color:#77839a;font-size:9px}\",\n    \"@media(max-width:560px){.pt-usd-kes-widget{margin:0 2px}.pt-usd-kes-trigger{padding:4px 5px;font-size:8px}.pt-usd-kes-balance{font-size:7px}.pt-usd-kes-popover{right:-4px}}\"\n  ].join(\"\");\n  function setText(node, value) { if (node && node.textContent !== value) node.textContent = value; }\n  function formatKes(value) { return new Intl.NumberFormat(\"en-KE\", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }\n  function formatUsd(value) { return new Intl.NumberFormat(\"en-US\", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }\n  function setLiveRate(value) {\n    var parsed = Number(value);\n    if (!Number.isFinite(parsed) || parsed <= 0) return;\n    rate = parsed;\n    document.querySelectorAll(\".pt-usd-kes-widget\").forEach(function (widget) {\n      update(widget, widget.closest(\".terminal-balance\"));\n    });\n  }\n  function update(widget, balance) {\n    if (!widget || !balance) return;\n    var currentDirection = widget.dataset.direction || direction;\n    var from = currentDirection === \"USD_TO_KES\" ? \"USD\" : \"KSh\";\n    var to = currentDirection === \"USD_TO_KES\" ? \"KSh\" : \"USD\";\n    var input = widget.querySelector(\".pt-usd-kes-input\");\n    var inputLabel = widget.querySelector(\".pt-usd-kes-input-label\");\n    var swap = widget.querySelector(\".pt-usd-kes-swap\");\n    var outputLabel = widget.querySelector(\".pt-usd-kes-output-label\");\n    var output = widget.querySelector(\".pt-usd-kes-output-value\");\n    var status = widget.querySelector(\".pt-usd-kes-rate\");\n    setText(inputLabel, \"Amount in \" + from);\n    setText(swap, \"↔  \" + from + \" → \" + to);\n    setText(outputLabel, \"ESTIMATED AMOUNT IN \" + to.toUpperCase());\n    var rawAmount = input ? input.value.trim() : \"\";\n    var amount = rawAmount === \"\" ? NaN : Number(rawAmount);\n    var converted = rate !== null && Number.isFinite(amount) && amount >= 0\n      ? currentDirection === \"USD_TO_KES\" ? amount * rate : amount / rate\n      : null;\n    setText(output, converted === null ? \"—\" : (to === \"KSh\" ? \"KSh \" + formatKes(converted) : \"USD \" + formatUsd(converted)));\n    setText(status, rate === null\n      ? \"Waiting for a live Deriv USD/KES quote.\"\n      : currentDirection === \"USD_TO_KES\"\n        ? \"Rate: 1 USD ≈ KSh \" + formatKes(rate)\n        : \"Rate: 1 KSh ≈ USD \" + formatUsd(1 / rate));\n    var balanceCopy = balance.querySelector(\":scope > strong\") || balance.querySelector(\"strong\");\n    var balanceText = balanceCopy ? balanceCopy.textContent || \"\" : \"\";\n    var match = balanceText.match(/USD\\s*([\\d,]+(?:\\.\\d+)?)/i);\n    var equivalent = widget.querySelector(\".pt-usd-kes-balance\");\n    if (match && rate !== null) {\n      setText(equivalent, \"≈ KSh \" + formatKes(Number(match[1].replace(/,/g, \"\")) * rate));\n      equivalent.hidden = false;\n    } else if (match) {\n      setText(equivalent, \"KSh estimate unavailable\");\n      equivalent.hidden = false;\n    } else {\n      equivalent.hidden = true;\n    }\n  }\n  function element(tag, className, text) {\n    var node = document.createElement(tag);\n    if (className) node.className = className;\n    if (text !== undefined) node.textContent = text;\n    return node;\n  }\n  function createWidget(balance) {\n    if (balance.querySelector(\":scope > .pt-usd-kes-widget\")) {\n      update(balance.querySelector(\":scope > .pt-usd-kes-widget\"), balance);\n      return;\n    }\n    var widget = element(\"div\", \"pt-usd-kes-widget\");\n    widget.dataset.direction = direction;\n    var trigger = element(\"button\", \"pt-usd-kes-trigger\", \"↔ USD/KSh\");\n    trigger.type = \"button\";\n    trigger.setAttribute(\"aria-label\", \"Open USD and KSh converter\");\n    trigger.setAttribute(\"aria-haspopup\", \"dialog\");\n    trigger.setAttribute(\"aria-expanded\", \"false\");\n    var equivalent = element(\"small\", \"pt-usd-kes-balance\", \"KSh estimate unavailable\");\n    var panel = element(\"section\", \"pt-usd-kes-popover\");\n    panel.hidden = true;\n    panel.setAttribute(\"role\", \"dialog\");\n    panel.setAttribute(\"aria-label\", \"USD and KSh converter\");\n    var header = element(\"div\", \"pt-usd-kes-head\");\n    var title = element(\"div\", \"\", \"USD ⇄ KSh\");\n    title.className = \"\";\n    var titleStrong = element(\"strong\", \"\", \"USD ⇄ KSh\");\n    var subtitle = element(\"small\", \"\", \"Live Deriv-rate estimate\");\n    title.append(titleStrong, subtitle);\n    var close = element(\"button\", \"pt-usd-kes-close\", \"×\");\n    close.type = \"button\";\n    close.setAttribute(\"aria-label\", \"Close currency converter\");\n    header.append(title, close);\n    var label = element(\"label\", \"pt-usd-kes-amount\");\n    var inputCaption = element(\"span\", \"pt-usd-kes-input-label\", \"Amount in USD\");\n    var input = element(\"input\", \"pt-usd-kes-input\");\n    input.type = \"number\";\n    input.min = \"0\";\n    input.step = \"any\";\n    input.inputMode = \"decimal\";\n    input.value = \"1\";\n    input.setAttribute(\"aria-label\", \"Amount in USD\");\n    label.append(inputCaption, input);\n    var swap = element(\"button\", \"pt-usd-kes-swap\", \"↔  USD → KSh\");\n    swap.type = \"button\";\n    var outputBox = element(\"div\", \"pt-usd-kes-output\");\n    var outputLabel = element(\"small\", \"pt-usd-kes-output-label\", \"ESTIMATED AMOUNT IN KSH\");\n    var output = element(\"strong\", \"pt-usd-kes-output-value\", \"—\");\n    outputBox.append(outputLabel, output);\n    var status = element(\"p\", \"pt-usd-kes-rate\", \"Waiting for a live Deriv USD/KES quote.\");\n    status.setAttribute(\"role\", \"status\");\n    var disclaimer = element(\"small\", \"pt-usd-kes-disclaimer\", \"Estimate only. This does not exchange funds or change your Deriv balance or trade currency.\");\n    panel.append(header, label, swap, outputBox, status, disclaimer);\n    trigger.addEventListener(\"click\", function () {\n      panel.hidden = !panel.hidden;\n      trigger.setAttribute(\"aria-expanded\", String(!panel.hidden));\n      if (!panel.hidden) input.focus();\n    });\n    close.addEventListener(\"click\", function () { panel.hidden = true; trigger.setAttribute(\"aria-expanded\", \"false\"); trigger.focus(); });\n    input.addEventListener(\"input\", function () { update(widget, balance); });\n    swap.addEventListener(\"click\", function () {\n      widget.dataset.direction = widget.dataset.direction === \"USD_TO_KES\" ? \"KES_TO_USD\" : \"USD_TO_KES\";\n      update(widget, balance);\n    });\n    widget.append(trigger, equivalent, panel);\n    var icons = balance.querySelectorAll(\":scope > svg\");\n    var anchor = icons.length > 1 ? icons[icons.length - 1] : null;\n    balance.insertBefore(widget, anchor);\n    update(widget, balance);\n  }\n  function installStyles() {\n    if (document.getElementById(\"pt-usd-kes-style\")) return;\n    var style = element(\"style\", \"\", css);\n    style.id = \"pt-usd-kes-style\";\n    document.head.append(style);\n  }\n  function connect() {\n    if (socket && socket.readyState < 2) return;\n    try {\n      socket = new WebSocket(WS_URL);\n    } catch (_) {\n      return;\n    }\n    socket.addEventListener(\"open\", function () {\n      socket.send(JSON.stringify({ ticks_history: SYMBOL, start: 0, end: \"latest\", count: 1 }));\n      socket.send(JSON.stringify({ ticks: SYMBOL, subscribe: 1 }));\n    });\n    socket.addEventListener(\"message\", function (event) {\n      try {\n        var message = JSON.parse(String(event.data));\n        if (message.history && message.echo_req && message.echo_req.ticks_history === SYMBOL) {\n          var prices = message.history.prices || [];\n          if (prices.length) setLiveRate(prices[prices.length - 1]);\n        }\n        if (message.tick && message.tick.symbol === SYMBOL) setLiveRate(message.tick.quote);\n      } catch (_) {}\n    });\n    socket.addEventListener(\"close\", function () {\n      socket = null;\n      if (document.querySelector(\".terminal-balance\") && reconnectTimer === null) {\n        reconnectTimer = setTimeout(function () { reconnectTimer = null; connect(); }, 5000);\n      }\n    });\n  }\n  function sync() {\n    var balances = document.querySelectorAll(\".terminal-balance\");\n    if (!balances.length) {\n      if (socket) { socket.close(); socket = null; }\n      return;\n    }\n    installStyles();\n    balances.forEach(createWidget);\n    connect();\n  }\n  document.addEventListener(\"pointerdown\", function (event) {\n    document.querySelectorAll(\".pt-usd-kes-widget\").forEach(function (widget) {\n      if (!widget.contains(event.target)) {\n        var panel = widget.querySelector(\".pt-usd-kes-popover\");\n        var trigger = widget.querySelector(\".pt-usd-kes-trigger\");\n        if (panel && !panel.hidden) { panel.hidden = true; trigger.setAttribute(\"aria-expanded\", \"false\"); }\n      }\n    });\n  });\n  document.addEventListener(\"keydown\", function (event) {\n    if (event.key === \"Escape\") document.querySelectorAll(\".pt-usd-kes-popover:not([hidden])\").forEach(function (panel) {\n      panel.hidden = true;\n      var trigger = panel.parentElement.querySelector(\".pt-usd-kes-trigger\");\n      if (trigger) { trigger.setAttribute(\"aria-expanded\", \"false\"); trigger.focus(); }\n    });\n  });\n  sync();\n  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true, characterData: true });\n})();";
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
// Read frontend assets explicitly so @vercel/node includes them in the function bundle.
const FRONTEND = {
  index: fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'),
  workspace: fs.readFileSync(path.join(__dirname, 'workspace.html'), 'utf8'),
  style: fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'),
  app: fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'),
  logo: fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8')
};
const CANONICAL_INDEX = FRONTEND.index
  .replace('</head>', '    <link rel="canonical" href="https://protradersfx.com/" />\n    <meta property="og:url" content="https://protradersfx.com/" />\n  </head>');

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
  const response = await fetch(OPTIONS_API_BASE + pathname, { ...init, headers });
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
function safeReturnTo(value) { const target = String(value || '/workspace.html'); return target.startsWith('/') && !target.startsWith('//') ? target : '/workspace.html'; }
function withQuery(pathname, key, value) { const joiner = pathname.includes('?') ? '&' : '?'; return pathname + joiner + encodeURIComponent(key) + '=' + encodeURIComponent(value); }
function oauthUrl(mode, returnTo = '/workspace.html') {
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
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('Deriv request timeout')); }, 12_000);
    ws.on('open', () => ws.send(JSON.stringify({ authorize: accessToken })));
    ws.on('message', (raw) => {
      let data; try { data = JSON.parse(raw.toString()); } catch { return; }
      if (data.error) { clearTimeout(timer); try { ws.close(); } catch {}; reject(new Error(data.error.message || 'Deriv API error')); return; }
      if (data.msg_type === 'authorize') {
        if (authorizeOnly) { clearTimeout(timer); try { ws.close(); } catch {}; resolve(data); return; }
        ws.send(JSON.stringify(payload)); return;
      }
      if (data.msg_type) { clearTimeout(timer); try { ws.close(); } catch {}; resolve(data); }
    });
    ws.on('error', (error) => { clearTimeout(timer); reject(error); });
    ws.on('close', () => clearTimeout(timer));
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
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'https://auth.deriv.com', 'https://api.derivws.com', 'wss://*.derivws.com', 'https://*.clerk.accounts.dev', 'https://clerk-telemetry.com'], scriptSrc: ["'self'", 'https://*.clerk.accounts.dev'], workerSrc: ["'self'", 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], frameAncestors: ["'none'"] } }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
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
app.get('/api/analytics', async (req, res) => {
    const session = await requireSession(req, res, { error: 'Authenticated Deriv session required' });
    if (!session) return;
    const data = readData();
    const events = Array.isArray(data.events) ? data.events : [];
    const trades = events.filter((event) => event.type === 'trade_settled');
    const activeUsers = new Set(trades.map((event) => event.loginid).filter(Boolean)).size;
    const tradingAmount = trades.reduce((total, event) => total + (Number(event.amount) || 0), 0);
    const currency = trades.find((event) => event.currency)?.currency || 'USD';
    res.json({
      loginid: activeLoginIdForSession(session),
      activeUsers,
      settledTrades: trades.length,
      tradingAmount,
      expectedCommission: DERIV_COMMISSION_RATE === null ? null : tradingAmount * DERIV_COMMISSION_RATE,
      commissionRate: DERIV_COMMISSION_RATE,
      currency,
      recentTrades: trades.slice(-25).reverse().map((event) => ({ loginid: event.loginid || 'authenticated trader', mode: event.mode || 'demo', symbol: event.symbol || '—', amount: Number(event.amount) || 0, profit: typeof event.profit === 'number' ? event.profit : null, at: event.at }))
    });
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
    const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenResponse.ok) throw new Error('Token exchange failed (' + tokenResponse.status + ')');
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('No access token returned');
    const session = { accessToken: token.access_token, refreshToken: token.refresh_token || null, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, accounts: [], activeMode: 'demo' };
    saveSession(res, session);
    const data = readData(); data.events.push({ type: state.mode === 'signup' ? 'oauth_signup_success' : 'oauth_login_success', at: new Date().toISOString() }); if (state.mode === 'signup') { data.registrations = (data.registrations || 0) + 1; data.events.push({ type: 'registration_complete', at: new Date().toISOString() }); } writeData(data);
    res.redirect(withQuery(returnTo, 'connected', '1'));
  } catch (error) { console.error(error.message); res.redirect(withQuery(returnTo, 'oauth_error', 'oauth_failed')); }
});
app.get('/api/session', async (req, res) => { try { const session = await getSession(req, res); if (!session) return res.json({ authenticated: false }); res.json({ authenticated: true, expiresAt: session.expiresAt, activeMode: session.activeMode || 'demo' }); } catch { res.status(503).json({ authenticated: false, error: 'Deriv session refresh is temporarily unavailable. Please try again shortly.' }); } });
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
app.get('/assets/index-Cu5S4abW.css', (req, res) => res.type('text/css').send(BUNDLED_STYLE_ASSET));
app.get('/usd-kes-converter.js', (req, res) => res.type('application/javascript').send(USD_KES_CONVERTER_ASSET));
app.get('/style.css', (req, res) => res.type('text/css').send(FRONTEND.style));
app.get('/app.js', (req, res) => res.type('application/javascript').send(FRONTEND.app));
app.get('/logo.svg', (req, res) => res.type('image/svg+xml').send(FRONTEND.logo));
app.get('/workspace', (req, res) => res.type('html').send(FRONTEND.workspace));
app.get('/workspace.html', (req, res) => res.type('html').send(FRONTEND.workspace));
for (const page of ['marketplace', 'course', 'signals', 'manual', 'builder']) app.get(`/${page}`, (req, res) => res.type('html').send(CANONICAL_INDEX));
app.get('/', (req, res) => res.type('html').send(CANONICAL_INDEX));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => res.type('html').send(CANONICAL_INDEX));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }); });

module.exports = app;
if (!process.env.VERCEL && require.main === module) app.listen(PORT, () => console.log(`[PROTRADERS FX] running on ${BASE_URL}`));
