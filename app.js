document.addEventListener('DOMContentLoaded', () => {
  const state = {
    symbol: 'frxEURUSD',
    symbolName: 'EUR/USD',
    price: null,
    previousPrice: null,
    socket: null,
    connected: false,
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
    prices: document.querySelectorAll('[data-price]'),
    moves: document.querySelectorAll('[data-move]'),
    markets: document.querySelectorAll('[data-market]'),
    statuses: document.querySelectorAll('[data-market-status]'),
    marketButtons: document.querySelectorAll('[data-market-button]'),
    chart: document.querySelector('#live-chart'),
    timeframeButtons: document.querySelectorAll('.timeframe')
  };

  /* =========================================
     ANALYTICS
  ========================================= */

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
    } catch (_) {}
  }

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


  /* =========================================
     UI
  ========================================= */

  function setPrices(value) {
    elements.prices.forEach(el => {
      el.textContent = value;
    });
  }

  function setMoves(value, direction = null) {
    elements.moves.forEach(el => {
      el.textContent = value;

      el.classList.remove(
        'positive',
        'negative'
      );

      if (direction) {
        el.classList.add(direction);
      }
    });
  }

  function setMarket(name) {
    elements.markets.forEach(el => {
      el.textContent = name;
    });
  }

  function setStatus(text, connected = false) {
    elements.statuses.forEach(el => {
      el.textContent = text;
      el.classList.toggle(
        'connected',
        connected
      );
    });
  }


  /* =========================================
     PRICE
  ========================================= */

  function formatPrice(price) {
    if (state.symbol === 'frxUSDJPY') {
      return price.toFixed(3);
    }

    return price.toFixed(5);
  }

  function updatePrice(price) {
    if (!Number.isFinite(price)) {
      return;
    }

    state.previousPrice = state.price;
    state.price = price;

    setPrices(formatPrice(price));

    if (state.previousPrice !== null) {
      const movement =
        ((state.price - state.previousPrice) /
          state.previousPrice) * 100;

      const sign =
        movement >= 0 ? '+' : '';

      setMoves(
        `${sign}${movement.toFixed(3)}%`,
        movement >= 0
          ? 'positive'
          : 'negative'
      );
    }

    addChartPoint(price);
  }


  /* =========================================
     CHART
  ========================================= */

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

    let line =
      svg.querySelector('[data-live-line]');

    if (!line) {
      line =
        document.createElementNS(
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

    const width = 900;
    const height = 360;

    const min =
      Math.min(...state.history);

    const max =
      Math.max(...state.history);

    const range =
      max - min || 1;

    const points =
      state.history.map(
        (value, index) => {

          const x =
            (index /
              Math.max(
                state.history.length - 1,
                1
              )) * width;

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


  /* =========================================
     DERIV PUBLIC MARKET DATA
  ========================================= */

  function connectDeriv() {
    disconnectDeriv();

    setStatus('CONNECTING');

    openSocket(
      'wss://ws.derivws.com/websockets/v3'
    );
  }

  function openSocket(url) {
    try {
      state.socket =
        new WebSocket(url);
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

    setPrices('—');
    setMoves('—');

    state.socket.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1
      })
    );
  }

  function handleSocketMessage(event) {
    let data;

    try {
      data =
        JSON.parse(event.data);
    } catch (_) {
      return;
    }

    if (data.error) {
      console.warn(
        'Market data error:',
        data.error.message
      );

      setStatus('DATA ERROR');
      return;
    }

    if (
      data.msg_type === 'tick' &&
      data.tick
    ) {
      updatePrice(
        Number(data.tick.quote)
      );

      setStatus('LIVE', true);
    }
  }

  function handleSocketError() {
    state.connected = false;

    setStatus('CONNECTION ERROR');
  }

  function handleSocketClose() {
    state.connected = false;

    setStatus('RECONNECTING');

    setTimeout(() => {
      connectDeriv();
    }, 3000);
  }

  function disconnectDeriv() {
    if (state.socket) {
      try {
        state.socket.close();
      } catch (_) {}
    }

    state.socket = null;
    state.connected = false;
  }


  /* =========================================
     MARKET SELECTOR
  ========================================= */

  elements.marketButtons.forEach(button => {

    button.addEventListener('click', () => {

      const name =
        button.dataset.marketButton;

      const symbol =
        Object.keys(SYMBOLS).find(
          key => SYMBOLS[key] === name
        );

      if (!symbol) {
        return;
      }

      state.symbol = symbol;
      state.symbolName = name;

      elements.marketButtons.forEach(
        item => {
          item.classList.toggle(
            'active',
            item === button
          );
        }
      );

      setMarket(name);
      setPrices('—');
      setMoves('—');

      state.history = [];
      state.price = null;
      state.previousPrice = null;

      subscribeToSymbol(symbol);

      track(
        'market_change',
        {
          symbol: name
        }
      );
    });

  });


  /* =========================================
     TIMEFRAMES
  ========================================= */

  elements.timeframeButtons.forEach(button => {

    button.addEventListener('click', () => {

      elements.timeframeButtons.forEach(
        item => {
          item.classList.remove('active');
        }
      );

      button.classList.add('active');

      track(
        'timeframe_change',
        {
          timeframe:
            button.textContent.trim()
        }
      );

    });

  });


  /* =========================================
     SESSION
  ========================================= */

  async function checkSession() {
    try {
      const response =
        await fetch('/api/session', {
          credentials: 'include',
          cache: 'no-store'
        });

      if (!response.ok) {
        return;
      }

      const data =
        await response.json();

      if (data.authenticated) {

        document
          .querySelectorAll(
            'a[href="/api/deriv/login"]'
          )
          .forEach(link => {
            link.textContent =
              'TRADING ACCOUNT';
          });

        document
          .querySelectorAll(
            'a[href="/api/deriv/signup"]'
          )
          .forEach(link => {
            link.textContent =
              'OPEN TERMINAL';
          });
      }

    } catch (_) {}
  }


  /* =========================================
     OAUTH MESSAGE
  ========================================= */

  function handleOAuthResult() {

    const params =
      new URLSearchParams(
        window.location.search
      );

    if (params.get('trading') === '1') {

      showNotice(
        'Trading account connected successfully.',
        false
      );

      track('oauth_success');
    }

    if (params.get('oauth_error')) {

      showNotice(
        'Account connection could not be completed. Please try again.',
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


  /* =========================================
     NOTICE
  ========================================= */

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
        background: error
          ? '#35151d'
          : '#102b20',
        color: '#fff',
        border: error
          ? '1px solid #843447'
          : '1px solid #2e8061',
        fontFamily:
          'Inter, Arial, sans-serif',
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


  /* =========================================
     START
  ========================================= */

  async function init() {

    handleOAuthResult();

    await checkSession();

    connectDeriv();
  }

  init();


  /* =========================================
     CLEANUP
  ========================================= */

  window.addEventListener(
    'beforeunload',
    disconnectDeriv
  );

});
