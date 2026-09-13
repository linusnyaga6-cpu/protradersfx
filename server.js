require('dotenv').config();
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
const PUBLIC_DIR = path.join(__dirname, 'public');
const DERIV_CLIENT_ID = process.env.DERIV_CLIENT_ID || '';
const DERIV_PUBLIC_APP_ID = process.env.DERIV_PUBLIC_APP_ID || '';
const DERIV_AFFILIATE_PARAM = process.env.DERIV_AFFILIATE_PARAM || 't';
const DERIV_AFFILIATE_TOKEN = process.env.DERIV_AFFILIATE_TOKEN || '';
const DERIV_AFFILIATE_ID = process.env.DERIV_AFFILIATE_ID || '';
const DERIV_CAMPAIGN = process.env.DERIV_CAMPAIGN || 'protraders-fx';
const DERIV_SCOPE = process.env.DERIV_SCOPE || 'trade account_manage';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = process.env.VERCEL ? path.join('/tmp', 'protraders-fx-analytics.json') : path.join(__dirname, 'data', 'analytics.json');

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
function getSession(req) {
  try {
    const session = unseal(req.cookies?.protraders_session);
    if (!session?.accessToken || Date.now() >= session.expiresAt) return null;
    return session;
  } catch { return null; }
}
function saveSession(res, session) {
  const maxAge = Math.max(60_000, Number(session.expiresAt || Date.now() + 3_600_000) - Date.now());
  res.cookie('protraders_session', seal(session), { httpOnly: true, secure: BASE_URL.startsWith('https://'), sameSite: 'lax', maxAge, path: '/' });
}
function accountIsDemo(account) { return Boolean(account?.is_virtual || account?.isVirtual || /^VRT/i.test(String(account?.loginid || ''))); }
function accountSummary(account) { return { loginid: account.loginid || '', currency: account.currency || 'USD', is_virtual: accountIsDemo(account) }; }
function normalizeAccounts(auth, fallbackToken) {
  const list = Array.isArray(auth?.account_list) ? auth.account_list : [];
  const accounts = list.map((account) => ({ loginid: account.loginid || account.account_id || '', currency: account.currency || auth.currency || 'USD', is_virtual: accountIsDemo(account), token: account.token || fallbackToken })).filter((account) => account.loginid || account.token);
  if (accounts.length) return accounts;
  return [{ loginid: auth?.loginid || '', currency: auth?.currency || 'USD', is_virtual: /^VRT/i.test(String(auth?.loginid || '')), token: fallbackToken }];
}
function oauthUrl(mode) {
  if (!DERIV_CLIENT_ID) throw new Error('DERIV_CLIENT_ID is not configured');
  const codeVerifier = verifier();
  const state = seal({ verifier: codeVerifier, mode, iat: Date.now() });
  const params = new URLSearchParams({ response_type: 'code', client_id: DERIV_CLIENT_ID, redirect_uri: `${BASE_URL}/oauth/callback`, scope: DERIV_SCOPE, state, code_challenge: challenge(codeVerifier), code_challenge_method: 'S256' });
  if (mode === 'signup') {
    if (!DERIV_AFFILIATE_TOKEN) throw new Error('Deriv signup attribution is not configured');
    params.set('prompt', 'registration'); params.set(DERIV_AFFILIATE_PARAM, DERIV_AFFILIATE_TOKEN); params.set('utm_campaign', DERIV_CAMPAIGN); params.set('utm_medium', 'affiliate');
    if (DERIV_AFFILIATE_ID) params.set('utm_source', DERIV_AFFILIATE_ID);
  }
  return `https://auth.deriv.com/oauth2/auth?${params.toString()}`;
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
async function authorizeAccounts(session) {
  const auth = await openDeriv(session.accessToken, null, true);
  session.accounts = normalizeAccounts(auth, session.accessToken);
  return session.accounts;
}
async function accountsFor(session) {
  if (Array.isArray(session.accounts) && session.accounts.length) return session.accounts;
  return authorizeAccounts(session);
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

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()) : [BASE_URL];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'https://auth.deriv.com', 'https://api.derivws.com', 'wss://*.derivws.com'], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], frameAncestors: ["'none'"] } }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 180, standardHeaders: true, legacyHeaders: false }));

app.get('/api/config', (req, res) => res.json({ configured: Boolean(DERIV_CLIENT_ID && DERIV_AFFILIATE_TOKEN), publicAppId: DERIV_PUBLIC_APP_ID, partnerParam: DERIV_AFFILIATE_PARAM, campaign: DERIV_CAMPAIGN }));
app.post('/api/track', (req, res) => { const type = String(req.body?.type || 'page_view').slice(0, 40); const data = readData(); if (type === 'page_view') data.visitors++; data.events.push({ type, at: new Date().toISOString(), path: String(req.body?.path || '/').slice(0, 200) }); if (data.events.length > 5000) data.events = data.events.slice(-5000); writeData(data); res.status(204).end(); });
app.get('/api/analytics', (req, res) => { const data = readData(); res.json({ visitors: data.visitors, registrations: data.registrations || 0, oauthSuccesses: data.events.filter((event) => event.type === 'oauth_login_success' || event.type === 'oauth_signup_success').length, fundedAccounts: null, note: 'Funded-account status must be confirmed in Deriv Partner Hub; it is not fabricated here.' }); });
app.get('/api/deriv/login', (req, res) => { try { res.redirect(oauthUrl('login')); } catch (error) { res.status(503).json({ error: error.message }); } });
app.get('/api/deriv/signup', (req, res) => { try { res.redirect(oauthUrl('signup')); } catch (error) { res.status(503).json({ error: error.message }); } });
app.get('/oauth/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect(`/?oauth_error=${encodeURIComponent(String(req.query.error))}`);
    const state = unseal(req.query.state);
    if (!state?.verifier || !['login', 'signup'].includes(state.mode) || Date.now() - state.iat > 600_000) throw new Error('Invalid or expired OAuth state');
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: DERIV_CLIENT_ID, code: String(req.query.code || ''), code_verifier: state.verifier, redirect_uri: `${BASE_URL}/oauth/callback` });
    const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenResponse.ok) throw new Error(`Token exchange failed (${tokenResponse.status})`);
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('No access token returned');
    const session = { accessToken: token.access_token, refreshToken: token.refresh_token || null, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000, accounts: [], activeMode: 'demo' };
    saveSession(res, session);
    const data = readData(); data.events.push({ type: state.mode === 'signup' ? 'oauth_signup_success' : 'oauth_login_success', at: new Date().toISOString() }); if (state.mode === 'signup') { data.registrations = (data.registrations || 0) + 1; data.events.push({ type: 'registration_complete', at: new Date().toISOString() }); } writeData(data);
    res.redirect('/workspace.html');
  } catch (error) { console.error(error.message); res.redirect('/?oauth_error=oauth_failed'); }
});
app.get('/api/session', (req, res) => { const session = getSession(req); if (!session) return res.json({ authenticated: false }); res.json({ authenticated: true, expiresAt: session.expiresAt, activeMode: session.activeMode || 'demo' }); });
app.post('/api/logout', (req, res) => { res.clearCookie('protraders_session', { httpOnly: true, secure: BASE_URL.startsWith('https://'), sameSite: 'lax', path: '/' }); res.status(204).end(); });
app.get('/api/accounts', async (req, res) => { const session = getSession(req); if (!session) return res.status(401).json({ authenticated: false }); try { const accounts = await accountsFor(session); saveSession(res, session); res.json({ authenticated: true, accounts: accounts.map(accountSummary), activeMode: session.activeMode || 'demo' }); } catch (error) { res.status(502).json({ error: 'Account list unavailable', message: error.message }); } });
app.post('/api/account/switch', async (req, res) => { const session = getSession(req); if (!session) return res.status(401).json({ authenticated: false }); const mode = req.body?.mode === 'real' ? 'real' : 'demo'; try { const accounts = await accountsFor(session); const account = selectedAccount(session, mode); if (!account) return res.status(409).json({ error: 'ACCOUNT_MODE_UNAVAILABLE', message: `No ${mode} account is linked to this Deriv login.` }); session.activeMode = mode; saveSession(res, session); const balance = await openDeriv(account.token || session.accessToken, { balance: 1 }); const value = balance.balance || {}; res.json({ authenticated: true, mode, loginid: account.loginid || value.loginid || null, currency: account.currency || value.currency || 'USD', balance: value.balance ?? null, accounts: accounts.map(accountSummary) }); } catch (error) { res.status(502).json({ error: 'Account switch failed', message: error.message }); } });
app.get('/api/account', async (req, res) => { const session = getSession(req); if (!session) return res.status(401).json({ authenticated: false }); const mode = req.query.mode === 'real' ? 'real' : req.query.mode === 'demo' ? 'demo' : session.activeMode || 'demo'; try { const { response, account } = await requestForMode(session, mode, { balance: 1 }); session.activeMode = mode; saveSession(res, session); const value = response.balance || {}; res.json({ authenticated: true, mode, balance: value.balance ?? null, currency: value.currency || account.currency || 'USD', loginid: value.loginid || account.loginid || null, openPnl: 0 }); } catch (error) { res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.code || 'Account data unavailable', message: error.message }); } });
app.post('/api/trades', async (req, res) => { const session = getSession(req); if (!session) return res.status(401).json({ error: 'Not authenticated' }); const mode = req.body?.mode === 'real' ? 'real' : 'demo'; const symbol = String(req.body?.symbol || 'frxEURUSD'); const type = ['CALL', 'PUT'].includes(req.body?.contract_type) ? req.body.contract_type : null; const stake = Number(req.body?.stake); const duration = Number(req.body?.duration); if (!type || !/^([A-Z0-9_]+|frx[A-Z]+)$/.test(symbol) || !Number.isFinite(stake) || stake <= 0 || !Number.isFinite(duration) || duration < 1 || duration > 3600) return res.status(400).json({ error: 'Invalid trade parameters' }); try { const { response: account, account: selected } = await requestForMode(session, mode, { balance: 1 }); const currency = account.balance?.currency || selected.currency || 'USD'; const proposal = await openDeriv(selected.token || session.accessToken, { proposal: 1, amount: stake, basis: 'stake', contract_type: type, currency, duration, duration_unit: 't', symbol }); if (!proposal.proposal?.id) return res.status(502).json({ error: 'Deriv did not return a proposal' }); const buy = await openDeriv(selected.token || session.accessToken, { buy: proposal.proposal.id, price: stake }); if (buy.error) return res.status(502).json({ error: buy.error.message }); session.activeMode = mode; saveSession(res, session); res.json({ ok: true, mode, contractType: type, message: `${mode.toUpperCase()} ${type === 'CALL' ? 'RISE' : 'FALL'} opened on ${symbol}. Contract ${buy.buy?.contract_id || 'created'}.`, contractId: buy.buy?.contract_id || null }); } catch (error) { res.status(error.code === 'ACCOUNT_MODE_UNAVAILABLE' ? 409 : 502).json({ error: error.code || 'Trade request failed', message: error.message }); } });
app.post('/api/bot', async (req, res) => { const session = getSession(req); if (!session) return res.status(401).json({ error: 'Not authenticated' }); const action = req.body?.action === 'start' ? 'start' : 'stop'; res.json({ ok: true, message: action === 'start' ? 'Free bot interface started in controlled mode. Live bot execution remains disabled until the bot adapter is separately tested.' : 'Free bot stopped.', execution: 'interface_only' }); });
app.get('/api/preflight', (req, res) => res.json({ productionBaseUrl: BASE_URL, redirectUri: `${BASE_URL}/oauth/callback`, https: BASE_URL.startsWith('https://'), oauthClientConfigured: Boolean(DERIV_CLIENT_ID), partnerTrackingConfigured: Boolean(DERIV_AFFILIATE_TOKEN), sessionSecretConfigured: Boolean(process.env.SESSION_SECRET), readyForControlledLiveTest: Boolean(BASE_URL.startsWith('https://') && DERIV_CLIENT_ID && DERIV_AFFILIATE_TOKEN && process.env.SESSION_SECRET) }));
app.get('/health', (req, res) => res.json({ ok: true, service: 'protraders-fx', time: new Date().toISOString() }));
app.get('/app-config.js', (req, res) => res.type('application/javascript').send(`window.PROTRADERS_PUBLIC_APP_ID=${JSON.stringify(DERIV_PUBLIC_APP_ID)};`));
app.get('/workspace', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'workspace.html')));
app.get('/workspace.html', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'workspace.html')));
for (const page of ['marketplace', 'course', 'signals', 'manual', 'builder']) app.get(`/${page}`, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }); });

if (process.env.VERCEL) module.exports = app;
else app.listen(PORT, () => console.log(`[PROTRADERS FX] running on ${BASE_URL}`));
