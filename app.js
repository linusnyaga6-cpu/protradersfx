document.addEventListener('DOMContentLoaded', () => {
  const markets = {
    'EUR/USD': 'frxEURUSD',
    'GBP/USD': 'frxGBPUSD',
    'USD/JPY': 'frxUSDJPY',
    'AUD/USD': 'frxAUDUSD',
    'USD/CAD': 'frxUSDCAD',
    'USD/CHF': 'frxUSDCHF'
  };

  let selectedMarket = 'EUR/USD';
  let selectedSymbol = markets[selectedMarket];
  let selectedTimeframe = 60;

  let socket = null;
  let reconnectTimer = null;
  let history = [];
  let previousPrice = null;

  const $ = selector => document.querySelector(selector);

  const priceEl = $('[data-price]');
  const moveEl = $('[data-move]');
  const marketEl = $('[data-market]');
  const statusEl = $('[data-status]');
  const chartEl = $('[data-chart]');

  function setStatus(text, live = false) {
    if (!statusEl) return;

    statusEl.textContent = text;

    statusEl.classList.toggle('live', live);
  }

  function formatPrice(price) {
    if (!Number.isFinite(price)) return '—';

    if (price >= 100) {
      return price.toFixed(3);
    }

    return price.toFixed(5);
  }

  function calculateMove(current) {
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previousPrice) ||
      previousPrice === 0
    ) {
      return null;
    }

    return ((current - previousPrice) / previousPrice) * 100;
  }

  function updatePrice(price) {
    if (!Number.isFinite(price)) return;

    const move = calculateMove(price);

    if (priceEl) {
      priceEl.textContent = formatPrice(price);
    }

    if (moveEl) {
      if (move === null) {
        moveEl.textContent = '—';
      } else {
        moveEl.textContent =
          `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`;

        moveEl.classList.remove(
          'positive',
          'negative'
        );

        moveEl.classList.add(
          move >= 0 ? 'positive' : 'negative'
        );
      }
    }

    previousPrice = price;
  }

  function drawChart() {
    if (!chartEl || history.length < 2) return;

    const values = history
      .map(point => Number(point.price))
      .filter(Number.isFinite);

    if (values.length < 2) return;

    const width = 1000;
    const height = 360;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 0.00001;

    const points = values.map((value, index) => {
      const x =
        (index / (values.length - 1)) *
        width;

      const y =
        height -
        ((value - min) / range) *
          (height - 40) -
        20;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    chartEl.innerHTML = `
      <svg
        viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="none"
        class="live-chart-svg"
      >
        <defs>
          <linearGradient
            id="chartGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stop-opacity=".25"
            />
            <stop
              offset="100%"
              stop-opacity="0"
            />
          </linearGradient>
        </defs>

        <polyline
          class="chart-line"
          points="${points.join(' ')}"
        ></polyline>
      </svg>
    `;
  }

  function unsubscribe() {
    if (!socket) return;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          forget_all: 'ticks'
        })
      );
    }
  }

  function subscribe() {
    if (!socket) return;

    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        ticks: selectedSymbol,
        subscribe: 1
      })
    );
  }

  function loadHistory() {
    if (!socket) return;

    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    history = [];

    socket.send(
      JSON.stringify({
        ticks_history: selectedSymbol,
        end: 'latest',
        count: 100,
        style: 'candles',
        granularity: selectedTimeframe
      })
    );
  }

  function connect() {
    clearTimeout(reconnectTimer);

    setStatus('CONNECTING');

    /*
     * Deriv's public WebSocket endpoint.
     *
     * The market-data stream itself does not require
     * the user's Deriv password or trading token.
     */
    const appId =
      document.body.dataset.derivAppId ||
      '1089';

    const url =
      `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`;

    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.error(
        'WebSocket creation failed:',
        error
      );

      setStatus('CONNECTION ERROR');

      scheduleReconnect();

      return;
    }

    socket.addEventListener('open', () => {
      console.log(
        'ProTraders FX: Deriv market connection opened'
      );

      setStatus('LIVE', true);

      loadHistory();
      subscribe();
    });

    socket.addEventListener('message', event => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error(
          'Invalid Deriv response:',
          error
        );

        return;
      }

      if (data.error) {
        console.error(
          'Deriv API error:',
          data.error
        );

        setStatus('API ERROR');

        return;
      }

      if (data.msg_type === 'history') {
        processHistory(data);
        return;
      }

      if (data.msg_type === 'candles') {
        processCandles(data);
        return;
      }

      if (data.msg_type === 'tick') {
        processTick(data);
      }
    });

    socket.addEventListener('close', event => {
      console.warn(
        'Deriv WebSocket closed:',
        event.code,
        event.reason
      );

      setStatus('RECONNECTING');

      scheduleReconnect();
    });

    socket.addEventListener('error', error => {
      console.error(
        'Deriv WebSocket error:',
        error
      );

      setStatus('CONNECTION ERROR');
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);

    reconnectTimer = setTimeout(() => {
      connect();
    }, 3000);
  }

  function processHistory(data) {
    if (!data.history) return;

    const prices = data.history.prices || [];
    const times = data.history.times || [];

    history = prices.map((price, index) => ({
      time: Number(times[index]),
      price: Number(price)
    }));

    if (history.length) {
      updatePrice(
        history[history.length - 1].price
      );
    }

    drawChart();
  }

  function processCandles(data) {
    if (!Array.isArray(data.candles)) {
      return;
    }

    history = data.candles.map(candle => ({
      time: Number(candle.epoch),
      price: Number(candle.close)
    }));

    if (history.length) {
      updatePrice(
        history[history.length - 1].price
      );
    }

    drawChart();
  }

  function processTick(data) {
    if (!data.tick) return;

    const price = Number(
      data.tick.quote
    );

    if (!Number.isFinite(price)) return;

    updatePrice(price);

    history.push({
      time: Number(data.tick.epoch),
      price
    });

    if (history.length > 150) {
      history.shift();
    }

    drawChart();
  }

  function selectMarket(name) {
    if (!markets[name]) return;

    selectedMarket = name;
    selectedSymbol = markets[name];

    previousPrice = null;
    history = [];

    if (marketEl) {
      marketEl.textContent = selectedMarket;
    }

    document
      .querySelectorAll('[data-symbol]')
      .forEach(button => {
        button.classList.toggle(
          'active',
          button.dataset.symbol ===
            selectedMarket
        );
      });

    unsubscribe();
    loadHistory();
    subscribe();
  }

  function selectTimeframe(seconds) {
    selectedTimeframe = seconds;

    document
      .querySelectorAll('[data-timeframe]')
      .forEach(button => {
        button.classList.toggle(
          'active',
          Number(button.dataset.timeframe) ===
            seconds
        );
      });

    loadHistory();
  }

  document
    .querySelectorAll('[data-symbol]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          selectMarket(
            button.dataset.symbol
          );
        }
      );
    });

  document
    .querySelectorAll('[data-timeframe]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          selectTimeframe(
            Number(
              button.dataset.timeframe
            )
          );
        }
      );
    });

  /*
   * OAuth tracking
   */

  function track(type) {
    fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        type,
        path:
          window.location.pathname
      }),
      keepalive: true
    }).catch(() => {});
  }

  track('page_view');

  document
    .querySelectorAll(
      'a[href="/api/deriv/signup"]'
    )
    .forEach(link => {
      link.addEventListener(
        'click',
        () => track('signup_click')
      );
    });

  document
    .querySelectorAll(
      'a[href="/api/deriv/login"]'
    )
    .forEach(link => {
      link.addEventListener(
        'click',
        () => track('login_click')
      );
    });

  /*
   * OAuth result handling
   */

  const params =
    new URLSearchParams(
      window.location.search
    );

  if (
    params.get('registered') === '1'
  ) {
    showNotice(
      'Deriv account connection completed.'
    );
  }

  if (
    params.get('logged_in') === '1'
  ) {
    showNotice(
      'Deriv account connected successfully.'
    );
  }

  if (
    params.get('oauth_error')
  ) {
    showNotice(
      'Deriv authentication could not be completed.',
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
      window.location.pathname +
        window.location.hash
    );
  }

  /*
   * Start market connection
   */

  connect();
});


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
      top: '22px',
      right: '22px',
      zIndex: '99999',
      maxWidth: '380px',
      padding: '14px 18px',
      borderRadius: '10px',
      background: error
        ? '#35151d'
        : '#10271d',
      color: '#fff',
      border: error
        ? '1px solid #743443'
        : '1px solid #28694e',
      fontFamily:
        'Inter, system-ui, sans-serif',
      fontSize: '13px',
      fontWeight: '700',
      boxShadow:
        '0 20px 50px rgba(0,0,0,.45)'
    }
  );

  document.body.appendChild(
    notice
  );

  setTimeout(() => {
    notice.style.opacity = '0';
    notice.style.transition =
      'opacity .35s ease';

    setTimeout(() => {
      notice.remove();
    }, 400);
  }, 4500);
}
