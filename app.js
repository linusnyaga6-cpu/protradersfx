document.addEventListener('DOMContentLoaded', () => {
  const MARKET_SYMBOLS = {
    'EUR/USD': 'frxEURUSD',
    'GBP/USD': 'frxGBPUSD',
    'USD/JPY': 'frxUSDJPY',
    'AUD/USD': 'frxAUDUSD',
    'USD/CAD': 'frxUSDCAD',
    'USD/CHF': 'frxUSDCHF'
  };

  let socket = null;
  let reconnectTimer = null;
  let selectedMarket = 'EUR/USD';
  let currentPrice = null;
  let previousPrice = null;
  let connected = false;

  const $ = (selector) => document.querySelector(selector);

  function formatPrice(price) {
    if (price === null || price === undefined || Number.isNaN(Number(price))) {
      return '—';
    }

    const number = Number(price);

    if (number >= 100) return number.toFixed(2);
    if (number >= 10) return number.toFixed(3);
    return number.toFixed(5);
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function updateStatus(status, live = false) {
    const statusElements = document.querySelectorAll(
      '[data-market-status], .market-status, .connection-status'
    );

    statusElements.forEach(element => {
      element.textContent = status;
    });

    const liveElements = document.querySelectorAll(
      '.live-status, [data-live-status]'
    );

    liveElements.forEach(element => {
      element.classList.toggle('is-live', live);
    });
  }

  function updateMarketDisplay(price) {
    const formatted = formatPrice(price);

    setText('[data-price]', formatted);
    setText('.market-price', formatted);
    setText('.price-value', formatted);

    const moveElements = document.querySelectorAll(
      '[data-move], .market-move, .move-value'
    );

    let movement = '—';

    if (
      previousPrice !== null &&
      currentPrice !== null &&
      previousPrice !== 0
    ) {
      const change =
        ((currentPrice - previousPrice) / previousPrice) * 100;

      movement =
        `${change >= 0 ? '+' : ''}${change.toFixed(3)}%`;

      moveElements.forEach(element => {
        element.textContent = movement;
        element.classList.toggle('positive', change >= 0);
        element.classList.toggle('negative', change < 0);
      });
    }

    moveElements.forEach(element => {
      if (movement === '—') element.textContent = movement;
    });

    drawChart(price);
  }

  /*
   * Draw a lightweight live chart without requiring
   * another charting library.
   */
  const chartPoints = [];

  function drawChart(price) {
    if (!Number.isFinite(Number(price))) return;

    chartPoints.push(Number(price));

    if (chartPoints.length > 80) {
      chartPoints.shift();
    }

    const svg = document.querySelector('#live-chart');

    if (!svg) return;

    const width = 900;
    const height = 360;
    const padding = 20;

    if (chartPoints.length < 2) return;

    const min = Math.min(...chartPoints);
    const max = Math.max(...chartPoints);

    const range = max - min || 0.00001;

    const points = chartPoints.map((value, index) => {
      const x =
        padding +
        (index / Math.max(chartPoints.length - 1, 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((value - min) / range) *
          (height - padding * 2);

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    svg.innerHTML = `
      <polyline
        points="${points.join(' ')}"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    `;
  }

  function clearChart() {
    chartPoints.length = 0;

    const svg = document.querySelector('#live-chart');

    if (svg) {
      svg.innerHTML = '';
    }
  }

  function connectMarket() {
    if (socket) {
      try {
        socket.close();
      } catch (_) {}
    }

    clearTimeout(reconnectTimer);

    updateStatus('CONNECTING', false);

    /*
     * Public Deriv WebSocket.
     * No account token is required for market data.
     */
    socket = new WebSocket(
      'wss://api.derivws.com/trading/v1/options/ws/public'
    );

    socket.addEventListener('open', () => {
      connected = true;

      updateStatus('LIVE', true);

      subscribeToMarket(selectedMarket);
    });

    socket.addEventListener('message', event => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (data.error) {
        console.error('Deriv market error:', data.error);
        updateStatus('ERROR', false);
        return;
      }

      if (data.msg_type === 'tick' && data.tick) {
        const symbol = data.tick.symbol;

        if (symbol !== MARKET_SYMBOLS[selectedMarket]) {
          return;
        }

        const quote = Number(data.tick.quote);

        if (!Number.isFinite(quote)) return;

        previousPrice = currentPrice;
        currentPrice = quote;

        updateMarketDisplay(quote);

        setText('[data-market]', selectedMarket);
        setText('.selected-market', selectedMarket);
      }
    });

    socket.addEventListener('error', error => {
      console.error('Market WebSocket error:', error);

      connected = false;
      updateStatus('OFFLINE', false);
    });

    socket.addEventListener('close', () => {
      connected = false;

      updateStatus('RECONNECTING', false);

      reconnectTimer = setTimeout(() => {
        connectMarket();
      }, 3000);
    });
  }

  function subscribeToMarket(market) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const symbol = MARKET_SYMBOLS[market];

    if (!symbol) return;

    /*
     * Forget previous subscriptions where possible.
     */
    try {
      socket.send(
        JSON.stringify({
          forget_all: 'ticks'
        })
      );
    } catch (_) {}

    currentPrice = null;
    previousPrice = null;

    clearChart();

    setText('[data-market]', market);
    setText('.selected-market', market);
    setText('[data-price]', '—');
    setText('.market-price', '—');
    setText('.price-value', '—');

    document
      .querySelectorAll('[data-move], .market-move, .move-value')
      .forEach(element => {
        element.textContent = '—';
      });

    socket.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1,
        req_id: Date.now()
      })
    );
  }

  function selectMarket(market) {
    if (!MARKET_SYMBOLS[market]) return;

    selectedMarket = market;

    document.querySelectorAll('[data-market-button]').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.marketButton === market
      );
    });

    if (connected) {
      subscribeToMarket(market);
    }
  }

  /*
   * Market buttons.
   *
   * Your HTML can use:
   *
   * <button data-market-button="EUR/USD">EUR/USD</button>
   */
  document.querySelectorAll('[data-market-button]').forEach(button => {
    button.addEventListener('click', () => {
      selectMarket(button.dataset.marketButton);
    });
  });

  /*
   * Support existing plain market links/buttons too.
   */
  document.querySelectorAll('[data-market]').forEach(element => {
    element.addEventListener('click', event => {
      const market = element.dataset.market;

      if (!MARKET_SYMBOLS[market]) return;

      event.preventDefault();
      selectMarket(market);
    });
  });

  /*
   * OAuth notifications.
   */
  const params = new URLSearchParams(window.location.search);

  if (params.get('registered') === '1') {
    showNotice(
      'Deriv account registration completed successfully.'
    );
  }

  if (params.get('logged_in') === '1') {
    showNotice(
      'Deriv login completed successfully.'
    );
  }

  if (params.get('oauth_error')) {
    showNotice(
      'Deriv authentication could not be completed. Please try again.',
      true
    );
  }

  if (
    params.has('registered') ||
    params.has('logged_in') ||
    params.has('oauth_error')
  ) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );
  }

  /*
   * Analytics.
   */
  track('page_view');

  document
    .querySelectorAll('a[href="/api/deriv/signup"]')
    .forEach(link => {
      link.addEventListener('click', () => {
        track('signup_click');
      });
    });

  document
    .querySelectorAll('a[href="/api/deriv/login"]')
    .forEach(link => {
      link.addEventListener('click', () => {
        track('login_click');
      });
    });

  /*
   * Start the live market connection.
   */
  connectMarket();
});


async function track(type, extra = {}) {
  try {
    await fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type,
        path: window.location.pathname,
        ...extra
      }),
      keepalive: true
    });
  } catch (_) {
    // Tracking must never interfere with trading UI.
  }
}


function showNotice(message, error = false) {
  const existing =
    document.getElementById('protraders-notice');

  if (existing) {
    existing.remove();
  }

  const notice = document.createElement('div');

  notice.id = 'protraders-notice';
  notice.textContent = message;

  Object.assign(notice.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '99999',
    maxWidth: '380px',
    padding: '14px 18px',
    borderRadius: '10px',
    background: error ? '#32151b' : '#10271d',
    color: '#ffffff',
    border: error
      ? '1px solid #8f3548'
      : '1px solid #2e8061',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 20px 50px rgba(0,0,0,.45)'
  });

  document.body.appendChild(notice);

  setTimeout(() => {
    notice.style.opacity = '0';
    notice.style.transition = 'opacity .4s ease';

    setTimeout(() => {
      notice.remove();
    }, 400);
  }, 4500);
}
