document.addEventListener('DOMContentLoaded', () => {
  const state = {
    symbol: 'frxEURUSD',
    symbolName: 'EUR/USD',
    price: null,
    previousPrice: null,
    connected: false,
    authenticated: false,
    socket: null,
    history: []
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
    price: document.querySelector('[data-price]'),
    move: document.querySelector('[data-move]'),
    status: document.querySelector('[data-status]'),
    instrument: document.querySelector('[data-instrument]'),
    chart: document.querySelector('[data-chart]'),
    marketButtons: document.querySelectorAll('[data-symbol]')
  };

  /*
   * ---------------------------------------------------------
   * BASIC ANALYTICS
   * ---------------------------------------------------------
   */

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
    } catch (error) {
      // Analytics must never break the trading interface.
    }
  }

  track('page_view');

  document.querySelectorAll('a[href="/api/deriv/signup"]').forEach(link => {
    link.addEventListener('click', () => {
      track('signup_click');
    });
  });

  document.querySelectorAll('a[href="/api/deriv/login"]').forEach(link => {
    link.addEventListener('click', () => {
      track('login_click');
    });
  });


  /*
   * ---------------------------------------------------------
   * OAUTH RESULT
   * ---------------------------------------------------------
   */

  function handleOAuthResult() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('registered') === '1') {
      showNotice(
        'Deriv account access connected successfully.',
        false
      );

      track('registration_complete');
    }

    if (params.get('logged_in') === '1') {
      showNotice(
        'Deriv account connected successfully.',
        false
      );

      track('oauth_success');
    }

    if (params.get('oauth_error')) {
      showNotice(
        'Deriv authentication could not be completed. Please try again.',
        true
      );

      track('oauth_error', {
        error: params.get('oauth_error')
      });
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
  }


  /*
   * ---------------------------------------------------------
   * SESSION CHECK
   * ---------------------------------------------------------
   */

  async function checkSession() {
    try {
      const response = await fetch('/api/session', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      state.authenticated = Boolean(data.authenticated);

      updateAuthenticationUI();

      return state.authenticated;
    } catch (error) {
      state.authenticated = false;
      updateAuthenticationUI();
      return false;
    }
  }


  /*
   * ---------------------------------------------------------
   * AUTHENTICATION UI
   * ---------------------------------------------------------
   */

  function updateAuthenticationUI() {
    const loginLinks = document.querySelectorAll(
      'a[href="/api/deriv/login"]'
    );

    const accountLinks = document.querySelectorAll(
      'a[href="/api/deriv/signup"]'
    );

    if (state.authenticated) {
      loginLinks.forEach(link => {
        link.textContent = 'TRADING ACCOUNT';
        link.classList.add('authenticated');
      });

      accountLinks.forEach(link => {
        link.textContent = 'OPEN TERMINAL';
      });
    }
  }


  /*
   * ---------------------------------------------------------
   * UI HELPERS
   * ---------------------------------------------------------
   */

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function setStatus(text, connected = false) {
    setText(elements.status, text);

    if (elements.status) {
      elements.status.classList.toggle(
        'connected',
        connected
      );
    }
  }

  function updatePrice(price) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) {
      return;
    }

    state.previousPrice = state.price;
    state.price = numericPrice;

    const formatted = formatPrice(
      numericPrice,
      state.symbol
    );

    setText(elements.price, formatted);

    if (state.previousPrice !== null) {
      const movement =
        ((state.price - state.previousPrice) /
          state.previousPrice) *
        100;

      const sign = movement >= 0 ? '+' : '';

      setText(
        elements.move,
        `${sign}${movement.toFixed(3)}%`
      );

      if (elements.move) {
        elements.move.classList.remove(
          'positive',
          'negative'
        );

        elements.move.classList.add(
          movement >= 0 ? 'positive' : 'negative'
        );
      }
    }

    if (elements.instrument) {
      elements.instrument.textContent =
        state.symbolName;
    }

    addChartPoint(numericPrice);
  }


  function formatPrice(price, symbol) {
    if (symbol === 'frxUSDJPY') {
      return price.toFixed(3);
    }

    return price.toFixed(5);
  }


  /*
   * ---------------------------------------------------------
   * CHART
   * ---------------------------------------------------------
   */

  function addChartPoint(price) {
    state.history.push(price);

    if (state.history.length > 120) {
      state.history.shift();
    }

    drawChart();
  }


  function drawChart() {
    if (!elements.chart) {
      return;
    }

    const svg =
      elements.chart.tagName.toLowerCase() === 'svg'
        ? elements.chart
        : elements.chart.querySelector('svg');

    if (!svg) {
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
        '#61e6a7'
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

    if (state.history.length < 2) {
      return;
    }

    const width =
      svg.viewBox?.baseVal?.width ||
      svg.clientWidth ||
      600;

    const height =
      svg.viewBox?.baseVal?.height ||
      260;

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


  /*
   * ---------------------------------------------------------
   * DERIV WEBSOCKET
   * ---------------------------------------------------------
   */

  async function getDerivToken() {
    /*
     * The server intentionally keeps the OAuth token
     * private. We therefore ask the server for the
     * authenticated session status first.
     *
     * The live public market feed does not require the
     * user's password or OAuth token.
     */

    try {
      const response = await fetch(
        '/api/session',
        {
          credentials: 'include',
          cache: 'no-store'
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      state.authenticated =
        Boolean(data.authenticated);

      updateAuthenticationUI();

      return state.authenticated;
    } catch (error) {
      return false;
    }
  }


  function connectDeriv() {
    disconnectDeriv();

    setStatus('CONNECTING', false);

    /*
     * Deriv public WebSocket endpoint.
     *
     * No private OAuth access token is exposed
     * to the browser.
     */
    const url =
      'wss://ws.derivws.com/websockets/v3?app_id=' +
      encodeURIComponent(
        window.DERIV_APP_ID ||
        document.body.dataset.derivAppId ||
        ''
      );

    /*
     * If the page does not expose an app ID, use the
     * server configuration endpoint instead.
     */
    fetch('/api/config', {
      cache: 'no-store'
    })
      .then(response => response.json())
      .then(config => {
        const appId =
          config.appId ||
          window.DERIV_APP_ID ||
          document.body.dataset.derivAppId;

        if (!appId) {
          /*
           * Fall back to the standard Deriv WebSocket
           * endpoint without an app_id.
           */
          openSocket(
            'wss://ws.derivws.com/websockets/v3'
          );
          return;
        }

        openSocket(
          'wss://ws.derivws.com/websockets/v3?app_id=' +
          encodeURIComponent(appId)
        );
      })
      .catch(() => {
        openSocket(
          'wss://ws.derivws.com/websockets/v3'
        );
      });
  }


  function openSocket(url) {
    try {
      state.socket = new WebSocket(url);
    } catch (error) {
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

    setText(elements.price, '—');
    setText(elements.move, '—');

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
    } catch (error) {
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

    /*
     * Tick response
     */
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

    /*
     * Automatically reconnect.
     */
    setTimeout(() => {
      connectDeriv();
    }, 3000);
  }


  function disconnectDeriv() {
    if (state.socket) {
      try {
        state.socket.close();
      } catch (error) {
        // Ignore close errors.
      }
    }

    state.socket = null;
    state.connected = false;
  }


  /*
   * ---------------------------------------------------------
   * MARKET SELECTOR
   * ---------------------------------------------------------
   */

  function setupMarketSelector() {
    elements.marketButtons.forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const symbol =
            button.dataset.symbol;

          if (!SYMBOLS[symbol]) {
            return;
          }

          state.symbol = symbol;
          state.symbolName =
            SYMBOLS[symbol];

          elements.marketButtons.forEach(
            item => {
              item.classList.toggle(
                'active',
                item === button
              );
            }
          );

          if (elements.instrument) {
            elements.instrument.textContent =
              state.symbolName;
          }

          state.history = [];
          state.price = null;
          state.previousPrice = null;

          setText(elements.price, '—');
          setText(elements.move, '—');

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


  /*
   * ---------------------------------------------------------
   * TIMEFRAME BUTTONS
   * ---------------------------------------------------------
   *
   * These currently control the visual selection.
   * Actual historical candle loading can be connected
   * separately once the live tick stream is confirmed.
   */

  function setupTimeframes() {
    const buttons =
      document.querySelectorAll(
        '[data-timeframe]'
      );

    buttons.forEach(button => {
      button.addEventListener(
        'click',
        () => {
          buttons.forEach(
            item =>
              item.classList.remove(
                'active'
              )
          );

          button.classList.add(
            'active'
          );

          track(
            'timeframe_change',
            {
              timeframe:
                button.dataset.timeframe
            }
          );
        }
      );
    });
  }


  /*
   * ---------------------------------------------------------
   * NOTICE
   * ---------------------------------------------------------
   */

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
        borderRadius: '10px',
        background: error
          ? '#35151d'
          : '#102b20',
        color: '#ffffff',
        border: error
          ? '1px solid #843447'
          : '1px solid #2e8061',
        fontFamily:
          'Inter, system-ui, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        boxShadow:
          '0 20px 50px rgba(0,0,0,.4)',
        transition:
          'opacity .35s ease'
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


  /*
   * ---------------------------------------------------------
   * START APPLICATION
   * ---------------------------------------------------------
   */

  async function init() {
    handleOAuthResult();

    setupMarketSelector();

    setupTimeframes();

    await checkSession();

    /*
     * Public market data can be viewed without login.
     * Login is only required when the user accesses
     * their Deriv account/trading functionality.
     */

    await getDerivToken();

    connectDeriv();
  }

  init();


  /*
   * ---------------------------------------------------------
   * CLEANUP
   * ---------------------------------------------------------
   */

  window.addEventListener(
    'beforeunload',
    () => {
      disconnectDeriv();
    }
  );
});
