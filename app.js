(() => {
  "use strict";

  const WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
  const MARKETS = {
    "EUR/USD": { symbol: "frxEURUSD", decimals: 5 },
    "GBP/USD": { symbol: "frxGBPUSD", decimals: 5 },
    "USD/JPY": { symbol: "frxUSDJPY", decimals: 3 },
    "AUD/USD": { symbol: "frxAUDUSD", decimals: 5 },
    "USD/CAD": { symbol: "frxUSDCAD", decimals: 5 },
    "Volatility 100": { symbol: "R_100", decimals: 2 },
    "Volatility 25": { symbol: "R_25", decimals: 2 }
  };
  const state = {
    socket: null, reconnectTimer: null, reconnectDelay: 2000, requestId: 0,
    currentMarket: "EUR/USD", currentSymbol: "frxEURUSD", decimals: 5,
    price: null, previousPrice: null, prices: [], times: [], connected: false,
    selectedMode: localStorage.getItem("protraders-account-mode") || "demo",
    selectedContract: "CALL", authenticated: false, accounts: [], activeView: "dashboard", bulkContract: "EVEN", scannerTimer: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const setText = (selector, value) => $$(selector).forEach((element) => { element.textContent = value == null ? "—" : String(value); });
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const format = (value) => { const n = number(value); return n == null ? "—" : n.toFixed(state.decimals); };
  const modeLabel = () => state.selectedMode === "real" ? "REAL MODE" : "DEMO MODE";

  function setStatus(value) { setText("[data-market-status]", value); }
  function updateModeUI() {
    $$('[data-account-mode]').forEach((button) => button.classList.toggle("active", button.dataset.accountMode === state.selectedMode));
    $$('[data-mode-chip]').forEach((element) => { element.textContent = modeLabel(); });
    setText("[data-report-mode]", state.selectedMode.toUpperCase());
    setText("[data-account-title]", state.selectedMode === "real" ? "Real Account" : "Demo Account");
  }
  function updateMarketUI() {
    setText("[data-market]", state.currentMarket);
    setText("[data-analysis-market]", state.currentMarket);
    $$('[data-symbol]').forEach((button) => button.classList.toggle("active", button.dataset.symbol === state.currentMarket));
  }
  function updatePriceUI() {
    setText("[data-price]", state.price == null ? "—" : format(state.price));
    const difference = state.price != null && state.previousPrice != null ? state.price - state.previousPrice : null;
    $$("[data-move]").forEach((element) => { element.textContent = difference == null ? "—" : `${difference > 0 ? "+" : ""}${difference.toFixed(state.decimals)}`; element.classList.toggle("positive", difference > 0); element.classList.toggle("negative", difference < 0); });
    const tickerPrice = $(`[data-ticker-price="${CSS.escape(state.currentMarket)}"]`); if (tickerPrice) tickerPrice.textContent = state.price == null ? "—" : format(state.price);
    const tickerMove = $(`[data-ticker-move="${CSS.escape(state.currentMarket)}"]`); if (tickerMove) tickerMove.textContent = difference == null ? "—" : `${difference > 0 ? "+" : ""}${difference.toFixed(state.decimals)}`;
  }
  function drawChart() {
    const lines = $$('[data-live-line]');
    const points = state.prices;
    if (!points.length) { lines.forEach((line) => { line.setAttribute("points", ""); }); return; }
    const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
    const path = points.map((value, index) => `${(index / Math.max(points.length - 1, 1)) * 1000},${350 - ((value - min) / range) * 320}`).join(" ");
    lines.forEach((line) => line.setAttribute("points", path));
    const axis = $$('[data-live-line]').map((line) => line.closest(".chart-area")).filter(Boolean).flatMap((chart) => Array.from(chart.querySelectorAll(".chart-axis span")));
    axis.forEach((label, index) => { const value = max - (range * index / 4); label.textContent = format(value); });
  }
  function updateAnalysis() {
    if (state.price == null || state.prices.length < 3) return;
    const recent = state.prices.slice(-Math.min(12, state.prices.length));
    const delta = recent[recent.length - 1] - recent[0];
    const direction = delta > 0 ? "BULLISH" : delta < 0 ? "BEARISH" : "FLAT";
    const signal = delta > 0 ? "RISE" : delta < 0 ? "FALL" : "WAIT";
    const momentum = Math.abs(delta) > Math.abs(state.price) * 0.00008 ? "ACTIVE" : "QUIET";
    const trend = delta > 0 ? "UPTREND" : delta < 0 ? "DOWNTREND" : "RANGE";
    const confidence = Math.min(92, Math.max(51, Math.round(52 + Math.abs(delta) / Math.max(state.price, 1) * 100000)));
    setText("[data-direction]", direction); setText("[data-momentum]", momentum); setText("[data-trend]", trend); setText("[data-ai-bias]", direction); setText("[data-ai-confidence]", `${confidence}%`);
    $$("[data-signal]").forEach((element) => { element.textContent = signal; element.classList.remove("buy", "sell", "wait"); element.classList.add(signal === "RISE" ? "buy" : signal === "FALL" ? "sell" : "wait"); });
    setText("#ai-message", `${state.currentMarket} is showing ${momentum.toLowerCase()} ${trend.toLowerCase()} pressure.`); setText("#analysis-message", `The live feed is ${momentum.toLowerCase()} with a ${direction.toLowerCase()} bias.`);
  }
  function send(payload) { if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false; state.socket.send(JSON.stringify(payload)); return true; }
  function subscribe() { send({ ticks: state.currentSymbol, subscribe: 1, req_id: ++state.requestId }); }
  function processTick(data) {
    const quote = number(data.tick?.quote); if (quote == null || (data.tick.symbol && data.tick.symbol !== state.currentSymbol)) return;
    state.previousPrice = state.price; state.price = quote; state.prices.push(quote); state.times.push(data.tick.epoch || Date.now());
    if (state.prices.length > 180) { state.prices.shift(); state.times.shift(); }
    setStatus("LIVE"); updatePriceUI(); drawChart(); updateAnalysis();
  }
  function connect() {
    if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) return;
    setStatus("CONNECTING");
    try { state.socket = new WebSocket(WS_URL); } catch { scheduleReconnect(); return; }
    state.socket.onopen = () => { state.connected = true; state.reconnectDelay = 2000; setStatus("LIVE"); subscribe(); };
    state.socket.onmessage = (event) => { try { const data = JSON.parse(event.data); if (data.error) { setStatus("MARKET ERROR"); return; } if (data.msg_type === "tick") processTick(data); } catch { setStatus("MARKET ERROR"); } };
    state.socket.onerror = () => setStatus("MARKET ERROR");
    state.socket.onclose = () => { state.connected = false; setStatus("RECONNECTING"); scheduleReconnect(); };
  }
  function scheduleReconnect() { if (state.reconnectTimer) return; state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connect(); state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000); }, state.reconnectDelay); }
  function changeMarket(name) {
    const market = MARKETS[name]; if (!market) return; state.currentMarket = name; state.currentSymbol = market.symbol; state.decimals = market.decimals; state.price = null; state.previousPrice = null; state.prices = []; state.times = []; updateMarketUI(); updatePriceUI(); drawChart(); if (state.socket && state.socket.readyState === WebSocket.OPEN) { state.socket.close(); setTimeout(connect, 250); }
  }
  function setView(view) {
    state.activeView = view; $$("[data-view]").forEach((panel) => panel.classList.toggle("active", panel.dataset.view === view)); $$("[data-view-target]").forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === view)); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function api(path, options = {}) { const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } }); let body = null; try { body = await response.json(); } catch {} return { response, body }; }
  function showMessage(message, selector = "[data-trade-message]") { setText(selector, message); }
  function applyAccount(body) { if (!body || !body.authenticated) return; setText("[data-account-balance]", body.balance == null ? "—" : `${Number(body.balance).toFixed(2)} ${body.currency || "USD"}`); setText("[data-balance]", body.balance == null ? "—" : Number(body.balance).toFixed(2)); setText("[data-currency]", body.currency || "USD"); setText("[data-loginid]", body.loginid || "Account connected"); setText("[data-auth-state]", `${state.selectedMode.toUpperCase()} CONNECTED`); }
  async function loadAccount() { if (!state.authenticated) return; const { response, body } = await api(`/api/account?mode=${encodeURIComponent(state.selectedMode)}`); if (response.ok) applyAccount(body); else if (body?.message) showMessage(body.message); }
  async function loadSession() {
    const session = await api("/api/session"); state.authenticated = Boolean(session.body?.authenticated); if (!state.authenticated) { setText("[data-auth-state]", "NOT CONNECTED"); return; }
    setText("[data-auth-state]", `${state.selectedMode.toUpperCase()} CONNECTED`); $$('[data-auth-login]').forEach((link) => { link.textContent = "Account"; link.href = "/workspace.html"; });
    const accounts = await api("/api/accounts"); if (accounts.response.ok) state.accounts = accounts.body.accounts || []; await loadAccount();
  }
  async function switchAccount(mode) {
    if (mode === state.selectedMode) return; state.selectedMode = mode; localStorage.setItem("protraders-account-mode", mode); updateModeUI(); if (!state.authenticated) { showMessage(`Connect a Deriv account before switching to ${mode.toUpperCase()} mode.`); return; }
    showMessage(`Switching to ${mode.toUpperCase()} account…`); const { response, body } = await api("/api/account/switch", { method: "POST", body: JSON.stringify({ mode }) }); if (!response.ok) { showMessage(body?.message || body?.error || `No ${mode} account is linked.`); return; } applyAccount(body); showMessage(`${mode.toUpperCase()} account selected. Review the ticket before execution.`);
  }
  async function executeTrade() {
    const stake = Number($("#stake-input")?.value); const duration = Number($("#duration-input")?.value); const button = $("#execute-button");
    if (!state.authenticated) { showMessage("Connect a Deriv account to trade."); return; }
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(duration)) { showMessage("Enter a valid stake and duration."); return; }
    button.disabled = true; button.textContent = "SENDING PROPOSAL…"; showMessage(`Reviewing ${state.selectedMode.toUpperCase()} ${state.selectedContract === "CALL" ? "RISE" : "FALL"} proposal…`);
    const { response, body } = await api("/api/trades", { method: "POST", body: JSON.stringify({ mode: state.selectedMode, symbol: state.currentSymbol, contract_type: state.selectedContract, stake, duration }) });
    button.disabled = false; button.innerHTML = "REVIEW &amp; EXECUTE <span>→</span>"; if (response.ok) { showMessage(body.message || "Trade executed."); await loadAccount(); } else showMessage(body?.message || body?.error || "Trade was not executed.");
  }
  function updateBulkMatrix() {
    if (state.price == null) return;
    const recent = state.prices.slice(-24);
    const digits = recent.map((value) => Math.floor(Math.abs(Number(value) * 10)) % 10);
    const counts = Array.from({ length: 10 }, (_, digit) => digits.filter((value) => value === digit).length);
    const total = Math.max(digits.length, 1);
    $$('[data-digit-probability]').forEach((element) => { const digit = Number(element.dataset.digitProbability); element.textContent = `${(100 * (counts[digit] + 1) / (total + 10)).toFixed(2)}%`; });
    $$('[data-digit-sequence] span').forEach((element, index) => { const digit = digits[digits.length - 10 + index]; element.textContent = digit == null ? "—" : String(digit); });
    setText('[data-bulk-current-tick]', format(state.price));
    const even = digits.length ? Math.round(100 * digits.filter((digit) => digit % 2 === 0).length / digits.length) : 50;
    setText('[data-even-percent]', `${even.toFixed(2)}%`); setText('[data-odd-percent]', `${(100 - even).toFixed(2)}%`);
  }
  function closeModal(modal) { if (modal) modal.hidden = true; }
  function appendScannerLine(text) { const consoleEl = $('[data-scanner-console]'); if (!consoleEl) return; const lines = consoleEl.textContent === 'Waiting for a live market sample…' ? [] : consoleEl.textContent.split("\\n"); lines.push(text); consoleEl.textContent = lines.slice(-9).join("\\n"); consoleEl.scrollTop = consoleEl.scrollHeight; }
  function stopScanner(review = false) {
    if (state.scannerTimer) { clearInterval(state.scannerTimer); state.scannerTimer = null; }
    const stateEl = $('[data-scanner-state]'); const copyEl = $('[data-scanner-copy]'); const button = $('[data-scan-stop]'); const progress = $('[data-scanner-progress]');
    if (review) { if (stateEl) stateEl.textContent = "REVIEW READY"; if (copyEl) copyEl.textContent = "The scanner found a live sample. No batch order has been sent."; if (button) button.textContent = "REVIEW BATCH"; if (progress) progress.style.width = "100%"; return; }
    if (stateEl) stateEl.textContent = "STOPPED"; if (copyEl) copyEl.textContent = "Scanner stopped. No batch order has been sent."; if (button) button.textContent = "START SCAN";
  }
  function startScanner() {
    const modal = $('[data-scanner-modal]'); if (!modal) return; modal.hidden = false; const button = $('[data-scan-stop]'); const progress = $('[data-scanner-progress]'); const stateEl = $('[data-scanner-state]'); const copyEl = $('[data-scanner-copy]'); const consoleEl = $('[data-scanner-console]');
    if (state.scannerTimer) return; if (consoleEl) consoleEl.textContent = "[SCAN] Connecting to live market sample…"; if (stateEl) stateEl.textContent = "SCANNING"; if (copyEl) copyEl.textContent = "Scanning live market samples…"; if (button) button.textContent = "STOP SCANNER"; if (progress) progress.style.width = "8%";
    let progressValue = 8; state.scannerTimer = setInterval(() => { progressValue = Math.min(92, progressValue + 14); if (progress) progress.style.width = `${progressValue}%`; const sequence = state.prices.slice(-6).map((value) => Math.floor(Math.abs(Number(value) * 10)) % 10).join(","); appendScannerLine(`[SCAN] ${state.currentMarket}: ${sequence || "waiting for ticks…"}`); if (progressValue >= 92) stopScanner(true); }, 420);
  }
  function openScanner() { const modal = $('[data-scanner-modal]'); if (modal) modal.hidden = false; if (!state.scannerTimer) startScanner(); }
  function showBatchReview() { const modal = $('[data-review-modal]'); if (!modal) return; setText('[data-review-market]', state.currentMarket); setText('[data-review-contract]', state.bulkContract); setText('[data-review-trades]', document.querySelector('.bulk-reference input[type="number"]:last-of-type')?.value || "1"); modal.hidden = false; }

  function setup() {
    updateModeUI(); updateMarketUI(); updatePriceUI();
    $$('[data-view-target]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewTarget)));
    $$('[data-symbol]').forEach((button) => button.addEventListener("click", () => changeMarket(button.dataset.symbol)));
    $$('[data-account-mode]').forEach((button) => button.addEventListener("click", () => switchAccount(button.dataset.accountMode)));
    $$(".timeframe").forEach((button) => button.addEventListener("click", () => { $$(".timeframe").forEach((item) => item.classList.remove("active")); button.classList.add("active"); }));
    $$(".contract-button").forEach((button) => button.addEventListener("click", () => { $$(".contract-button").forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.selectedContract = button.dataset.contract; }));
    $("#execute-button")?.addEventListener("click", executeTrade); $("[data-refresh-account]")?.addEventListener("click", loadAccount);
    $("[data-bulk-review]")?.forEach?.(() => {});
    $$('[data-bulk-review]').forEach((button) => button.addEventListener("click", showBatchReview));
    $$('[data-open-scanner]').forEach((button) => button.addEventListener("click", openScanner));
    $("[data-scan-stop]")?.addEventListener("click", () => { if (state.scannerTimer) stopScanner(false); else if ($("[data-scan-stop]")?.textContent === "REVIEW BATCH") showBatchReview(); else startScanner(); });
    $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop"))));
    $$("[data-bulk-contract]").forEach((button) => button.addEventListener("click", () => { state.bulkContract = button.dataset.bulkContract; $$("[data-bulk-contract]").forEach((item) => item.classList.toggle("active", item === button)); }));
    $("[data-builder-save]")?.addEventListener("click", () => showMessage("Strategy draft saved locally for this session.", "[data-builder-message]"));
    $$('[data-bot-action]').forEach((button) => button.addEventListener("click", async () => { const { response, body } = await api("/api/bot", { method: "POST", body: JSON.stringify({ action: "start" }) }); setText("[data-bot-message]", response.ok ? body.message : (body?.error || "Connect an account to start a bot.")); setText("[data-bot-label]", response.ok ? "BOT RUNNING →" : "START BOT →"); }));
    connect(); loadSession();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();
})();
