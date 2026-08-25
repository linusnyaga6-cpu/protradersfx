document.addEventListener('DOMContentLoaded', () => {
  const state = {
    symbol: 'frxEURUSD',
    symbolName: 'EUR/USD',
    price: null,
    previousPrice: null,
    connected: false,
    authenticated: false,
    socket: null,
    history: [],
    reconnectTimer: null
  };

  const SYMBOLS = {
    frxEURUSD: 'EUR/USD',
    frxGBPUSD: 'GBP/USD',
    frxUSDJPY: 'USD/JPY',
    frxAUDUSD: 'AUD/USD',
    frxUSDCAD: 'USD/CAD',
    frxUSDCHF: 'USD/CHF'
  };

  const elements = {
    prices: document.querySelectorAll('[data-price]'),
    moves: document.querySelectorAll('[data-move]'),
    statuses: document.querySelectorAll('[data-market-status]'),
    markets: document.querySelectorAll('[data-market]'),
    marketButtons: document.querySelectorAll('[data-market-button]'),
    chart: document.querySelector('#live-chart'),
    timeframeButtons: document.querySelectorAll('.timeframe')
  };


  /* =========================================================
     ANALYTICS
  ========================================================= */

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
      // Analytics never interrupts the trading interface.
    }
  }

  track('page_view');

  document.querySelectorAll('a[href="/api/deriv/signup"]')
    .forEach(link => {
      link.addEventListener('click', () => {
        track('signup_click');
      });
    });

  document.querySelectorAll('a[href="/api/deriv/login"]')
    .forEach(link => {
      link.addEventListener('click', () => {
        track('login_click');
      });
    });


  /* =========================================================
     UI HELPERS
  ========================================================= */

  function setText(elementsList, value) {
    elementsList.forEach(element => {
      element.textContent = value;
    });
  }

  function setStatus(text, connected = false) {
    setText(elements.statuses, text);

    elements.statuses.forEach(element => {
      element.classList.toggle('connected', connected);
    });
  }

  function updateMarketNames() {
    setText(elements.markets, state.symbolName);
  }


  /* =========================================================
     PRICE
  ========================================================= */

  function formatPrice(price) {
    if (state.symbol === 'frxUSDJPY') {
      return price.toFixed(3);
    }

    return price.toFixed(5);
  }

  function updatePrice(price) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) {
      return;
    }

    state.previousPrice = state.price;
    state.price = numericPrice;

    setText(
      elements.prices,
      formatPrice(numericPrice)
    );

    if (state.previousPrice !== null) {
      const movement =
        ((state.price - state.previousPrice) /
          state.previousPrice) * 100;

      const sign = movement >= 0 ? '+' : '';

      setText(
        elements.moves,
        `${sign}${movement.toFixed(3)}%`
      );

      elements.moves.forEach(element => {
        element.classList.remove(
          'positive',
          'negative'
        );

        element.classList.add(
          movement >= 0
            ? 'positive'
            : 'negative'
        );
      });
    }

    updateMarketNames();
    addChartPoint(numericPrice);
  }


  /* =========================================================
     LIVE CHART
  ========================================================= */

  function addChartPoint(price) {
    state.history.push(price);

    if (state.history.length > 120) {
      state.history.shift();
    }

    drawChart();
  }

  function drawChart() {
    const svg = elements.chart;

    if (!svg || state.history.length < 2) {
      return;
    }

    let line = svg.querySelector(
      '[data-live-line]'
    );

    if (!line) {
      line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'polyline'
      );

      line.setAttribute(
        'data-live-line',
        'true'
      );

      line.setAttribute(
        'fill',
        'none'
      );

      line.setAttribute(
        'stroke',
        '#50e3a4'
      );

      line.setAttribute(
        'stroke-width',
        '2.5'
      );

      line.setAttribute(
        'vector-effect',
        'non-scaling-stroke'
      );

      svg.appendChild(line);
    }

    const width =
      svg.viewBox.baseVal.width || 900;

    const height =
      svg.viewBox.baseVal.height || 360;

    const values = state.history;

    const min = Math.min(...values);
    const max = Math.max(...values);

    const range =
      max - min === 0
        ? 1
        : max - min;

    const points = values.map(
      (value, index) => {
        const x =
          (index /
            Math.max(values.length - 1, 1)) *
          width;

        const normalized =
          (value - min) / range;

        const y =
          height -
          25 -
          normalized *
            (height - 50);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }
    );

    line.setAttribute(
      'points',
      points.join(' ')
    );
  }


  /* =========================================================
     DERIV WEBSOCKET
  ========================================================= */

  async function getAppId() {
    try {
      const response = await fetch(
        '/api/config',
        {
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        return null;
      }

      const config = await response.json();

      return (
        config.appId ||
        window.DERIV_APP_ID ||
        document.body.dataset.derivAppId ||
        null
      );

    } catch (_) {
      return null;
    }
  }


  async function connectDeriv() {
    disconnectDeriv();

    setStatus('CONNECTING', false);

    const appId = await getAppId();

    let url =
      'wss://ws.derivws.com/websockets/v3';

    if (appId) {
      url +=
        `?app_id=${encodeURIComponent(appId)}`;
    }

    openSocket(url);
  }


  function openSocket(url) {
    try {
      state.socket = new WebSocket(url);
    } catch (_) {
      handleSocketError();
      return;
    }

    state.socket.addEventListener(
      'open',
      handleSocketOpen
    );

    state.socket.addEventListener(
      'message',
      handleSocketMessage
    );

    state.socket.addEventListener(
      'error',
      handleSocketError
    );

    state.socket.addEventListener(
      'close',
      handleSocketClose
    );
  }


  function handleSocketOpen() {
    state.connected = true;

    setStatus('LIVE', true);

    subscribeToSymbol(
      state.symbol
    );
  }


  function subscribeToSymbol(symbol) {
    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    state.history = [];
    state.price = null;
    state.previousPrice = null;

    setText(elements.prices, '—');
    setText(elements.moves, '—');

    const request = {
      ticks: symbol,
      subscribe: 1
    };

    state.socket.send(
      JSON.stringify(request)
    );
  }


  function handleSocketMessage(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (data.error) {
      console.warn(
        'Deriv WebSocket error:',
        data.error.message
      );

      setStatus('DATA ERROR', false);

      return;
    }

    if (
      data.msg_type === 'tick' &&
      data.tick
    ) {
      const tick = data.tick;

      if (
        tick.symbol &&
        tick.symbol !== state.symbol
      ) {
        return;
      }

      updatePrice(
        Number(tick.quote)
      );

      setStatus('LIVE', true);
    }
  }


  function handleSocketError() {
    state.connected = false;

    setStatus(
      'CONNECTION ERROR',
      false
    );
  }


  function handleSocketClose() {
    state.connected = false;

    setStatus(
      'RECONNECTING',
      false
    );

    if (state.reconnectTimer) {
      clearTimeout(
        state.reconnectTimer
      );
    }

    state.reconnectTimer =
      setTimeout(() => {
        connectDeriv();
      }, 3000);
  }


  function disconnectDeriv() {
    if (state.reconnectTimer) {
      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer = null;
    }

    if (state.socket) {
      try {
        state.socket.close();
      } catch (_) {
        // Ignore socket close errors.
      }
    }

    state.socket = null;
    state.connected = false;
  }


  /* =========================================================
     MARKET SELECTOR
  ========================================================= */

  function setupMarketSelector() {
    elements.marketButtons.forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const marketName =
            button.dataset.marketButton;

          const symbol =
            Object.keys(SYMBOLS).find(
              key =>
                SYMBOLS[key] === marketName
            );

          if (!symbol) {
            return;
          }

          state.symbol = symbol;
          state.symbolName = marketName;

          elements.marketButtons.forEach(
            item => {
              item.classList.toggle(
                'active',
                item === button
              );
            }
          );

          updateMarketNames();

          state.history = [];
          state.price = null;
          state.previousPrice = null;

          setText(
            elements.prices,
            '—'
          );

          setText(
            elements.moves,
            '—'
          );

          subscribeToSymbol(
            state.symbol
          );

          track(
            'market_change',
            {
              symbol: state.symbolName
            }
          );
        }
      );

    });
  }


  /* =========================================================
     TIMEFRAMES
  ========================================================= */

  function setupTimeframes() {
    elements.timeframeButtons.forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            elements.timeframeButtons
              .forEach(item => {
                item.classList.remove(
                  'active'
                );
              });

            button.classList.add(
              'active'
            );

            track(
              'timeframe_change',
              {
                timeframe:
                  button.textContent.trim()
              }
            );

          }
        );

      }
    );
  }


  /* =========================================================
     AUTHENTICATION
  ========================================================= */

  async function checkSession() {
    try {
      const response =
        await fetch(
          '/api/session',
          {
            credentials: 'include',
            cache: 'no-store'
          }
        );

      if (!response.ok) {
        return;
      }

      const data =
        await response.json();

      state.authenticated =
        Boolean(data.authenticated);

      updateAuthenticationUI();

    } catch (_) {
      state.authenticated = false;
    }
  }


  function updateAuthenticationUI() {
    const loginLinks =
      document.querySelectorAll(
        'a[href="/api/deriv/login"]'
      );

    const signupLinks =
      document.querySelectorAll(
        'a[href="/api/deriv/signup"]'
      );

    if (state.authenticated) {

      loginLinks.forEach(link => {
        link.textContent =
          'TRADING ACCOUNT';

        link.classList.add(
          'authenticated'
        );
      });

      signupLinks.forEach(link => {
        link.textContent =
          'OPEN TERMINAL';
      });

    }
  }


  /* =========================================================
     OAUTH RESULT
  ========================================================= */

  function handleOAuthResult() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    if (
      params.get('trading') === '1'
    ) {
      showNotice(
        'Trading account connected.',
        false
      );

      track('oauth_success');
    }

    if (
      params.get('oauth_error')
    ) {
      showNotice(
        'Account connection could not be completed.',
        true
      );

      track(
        'oauth_error',
        {
          error:
            params.get('oauth_error')
        }
      );
    }

    if (
      params.has('trading') ||
      params.has('oauth_error')
    ) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  }


  /* =========================================================
     NOTICE
  ========================================================= */

  function showNotice(
    message,
    error = false
  ) {
    const existing =
      document.getElementById(
        'protraders-notice'
      );

    if (existing) {
      existing.remove();
    }

    const notice =
      document.createElement('div');

    notice.id =
      'protraders-notice';

    notice.textContent =
      message;

    Object.assign(
      notice.style,
      {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '99999',
        maxWidth: '380px',
        padding: '14px 18px',
        borderRadius: '8px',
        background:
          error
            ? '#35151d'
            : '#102b20',
        color: '#ffffff',
        border:
          error
            ? '1px solid #843447'
            : '1px solid #2e8061',
        fontFamily:
          'Inter, system-ui, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        boxShadow:
          '0 20px 50px rgba(0,0,0,.4)'
      }
    );

    document.body.appendChild(
      notice
    );

    setTimeout(() => {

      notice.style.opacity = '0';

      setTimeout(() => {
        notice.remove();
      }, 400);

    }, 5000);
  }


  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function init() {

    handleOAuthResult();

    setupMarketSelector();

    setupTimeframes();

    updateMarketNames();

    await checkSession();

    connectDeriv();
  }


  init();


  /* =========================================================
     CLEANUP
  ========================================================= */

  window.addEventListener(
    'beforeunload',
    () => {
      disconnectDeriv();
    }
  );
});
