'use strict';

(() => {
  const initialBalance = 10000;
  let balance = initialBalance;
  let currentPrice = 1.08425;
  let direction = 'buy';
  let busy = false;
  let ticks = Array.from({ length: 40 }, (_, i) => 105 + Math.sin(i * 0.68) * 18 + Math.cos(i * 0.23) * 8);
  const line = document.getElementById('chartLine');
  const fill = document.getElementById('chartFillPath');
  const priceEl = document.getElementById('currentPrice');
  const balanceEl = document.getElementById('demoBalance');
  const messageEl = document.getElementById('orderMessage');
  const historyEl = document.getElementById('historyList');
  const placeButton = document.getElementById('placeOrder');
  const pairEl = document.getElementById('pairName');

  function draw() {
    const width = 760;
    const height = 210;
    const min = Math.min(...ticks) - 8;
    const max = Math.max(...ticks) + 8;
    const range = Math.max(1, max - min);
    const points = ticks.map((value, index) => {
      const x = Math.round((index / (ticks.length - 1)) * width);
      const y = Math.round(height - ((value - min) / range) * (height - 24) - 10);
      return x + ',' + y;
    });
    line.setAttribute('points', points.join(' '));
    fill.setAttribute('points', '0,210 ' + points.join(' ') + ' 760,210');
  }

  function renderBalance() {
    balanceEl.textContent = balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function addHistoryRow(trade) {
    const row = document.createElement('div');
    row.className = 'trade-row';
    const market = document.createElement('div');
    market.textContent = trade.market + ' · ' + trade.side.toUpperCase();
    const stake = document.createElement('div');
    stake.textContent = trade.stake.toFixed(2) + ' credits';
    const result = document.createElement('div');
    result.textContent = trade.pnl >= 0 ? '+' + trade.pnl.toFixed(2) : trade.pnl.toFixed(2);
    result.className = trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const state = document.createElement('div');
    state.textContent = 'SIMULATED';
    const detail = document.createElement('small');
    detail.textContent = 'No external order';
    state.appendChild(detail);
    row.append(market, stake, result, state);
    if (historyEl.querySelector('.empty')) historyEl.replaceChildren();
    historyEl.prepend(row);
    while (historyEl.children.length > 8) historyEl.lastElementChild.remove();
  }

  document.getElementById('buyButton').addEventListener('click', () => {
    direction = 'buy';
    document.getElementById('buyButton').className = 'side-button active buy';
    document.getElementById('buyButton').setAttribute('aria-pressed', 'true');
    document.getElementById('sellButton').className = 'side-button';
    document.getElementById('sellButton').setAttribute('aria-pressed', 'false');
  });

  document.getElementById('sellButton').addEventListener('click', () => {
    direction = 'sell';
    document.getElementById('sellButton').className = 'side-button active sell';
    document.getElementById('sellButton').setAttribute('aria-pressed', 'true');
    document.getElementById('buyButton').className = 'side-button';
    document.getElementById('buyButton').setAttribute('aria-pressed', 'false');
  });

  document.getElementById('marketSelect').addEventListener('change', (event) => {
    pairEl.textContent = event.target.value + ' · DEMO';
    currentPrice = event.target.value === 'USD/JPY' ? 149.250 : (event.target.value === 'GBP/USD' ? 1.27350 : 1.08425);
    priceEl.textContent = currentPrice.toFixed(event.target.value === 'USD/JPY' ? 3 : 5);
    ticks = Array.from({ length: 40 }, (_, i) => 105 + Math.sin(i * 0.68) * 18 + Math.cos(i * 0.23) * 8);
    draw();
  });

  placeButton.addEventListener('click', () => {
    if (busy) return;
    const stake = Number(document.getElementById('stakeInput').value);
    const duration = Number(document.getElementById('durationSelect').value);
    if (!Number.isFinite(stake) || stake < 1 || stake > 1000 || stake > balance) {
      messageEl.textContent = 'Enter a demo stake between 1 and 1,000 credits and within the virtual demo balance.';
      return;
    }

    busy = true;
    balance -= stake;
    renderBalance();
    placeButton.disabled = true;
    placeButton.textContent = 'Simulating…';
    const order = {
      market: document.getElementById('marketSelect').value,
      side: direction,
      stake,
      entry: currentPrice,
    };
    messageEl.textContent = 'Demo order started. A synthetic price path will settle it; no live order was sent.';

    window.setTimeout(() => {
      const change = (currentPrice - order.entry) / order.entry;
      const signedChange = order.side === 'buy' ? change : -change;
      const pnl = Math.max(-stake, Math.round(stake * signedChange * 1000) / 100);
      balance += stake + pnl;
      renderBalance();
      addHistoryRow({ ...order, pnl });
      messageEl.textContent = 'Simulated demo result: ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + ' demo credits. This is not a real trade result.';
      busy = false;
      placeButton.disabled = false;
      placeButton.textContent = 'Place demo order';
    }, duration * 1000);
  });

  window.setInterval(() => {
    const movement = (Math.random() - 0.5) * (currentPrice > 10 ? 0.12 : 0.0008);
    currentPrice = Math.max(0.0001, currentPrice + movement);
    priceEl.textContent = currentPrice.toFixed(currentPrice > 10 ? 3 : 5);
    ticks.push(ticks[ticks.length - 1] + (Math.random() - 0.5) * 16);
    ticks = ticks.slice(-40);
    draw();
  }, 1200);

  fetch('/api/forex/status', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('status unavailable')))
    .then((status) => {
      const banner = document.getElementById('systemState');
      if (status.mode === 'demo' && status.realTradingEnabled === false && status.paymentsEnabled === false) {
        banner.textContent = 'Demo only · real trading and payments disabled';
      }
    })
    .catch(() => {
      document.getElementById('systemState').textContent = 'Demo preview only · status unavailable';
    });

  renderBalance();
  draw();
})();
