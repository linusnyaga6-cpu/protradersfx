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

  let ws = null;
  let reconnectTimer = null;
  let chartData = [];
  let previousPrice = null;

  const $ = (selector) => document.querySelector(selector);

  const priceElement = document.querySelector('[data-price]');
  const moveElement = document.querySelector('[data-move]');
  const marketElement = document.querySelector('[data-market]');
  const statusElement = document.querySelector('[data-status]');
  const chartElement = document.querySelector('[data-chart]');

  function setStatus(text, live = false) {
    if (!statusElement) return;

    statusElement.textContent = text;
    statusElement.classList.toggle('live', live);
  }

  function formatPrice(price) {
    if (!Number.isFinite(price)) return '—';

    if (price >= 100) {
      return price.toFixed(3);
    }

    return price.toFixed(5);
  }

  function formatMove(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
      return '—';
    }

    const move = ((current - previous) / previous) * 100;

    return `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`;
  }

  function updatePrice(price) {
    if (!Number.isFinite(price)) return;

    const move = formatMove(price, previousPrice);

    if (priceElement) {
      priceElement.textContent = formatPrice(price);
    }

    if (moveElement) {
      moveElement.textContent = move;

      moveElement.classList.remove('positive', 'negative');

      if (move.startsWith('+')) {
        moveElement.classList.add('positive');
      } else if (move !== '—') {
        moveElement.classList.add('negative');
      }
    }

    previousPrice = price;
  }

  function drawChart(data) {
    if (!chartElement || !data.length) return;

    const values = data
      .map(item => Number(item.price))
      .filter(Number.isFinite);

    if (values.length < 2) return;

    const width = 1000;
    const height = 360;

    const min = Math.min(...values);
    const max = Math.max(...values);

    const range = max - min || 0.00001;

    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;

      const y =
        height -
        ((value - min) / range) * (height - 40) -
        20;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    chartElement.innerHTML = `
      <svg
        viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="none"
        class="live-chart-svg"
        aria-label="${selectedMarket} live chart"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-opacity=".24"></stop>
            <stop offset="100%" stop-opacity="0"></stop>
          </linearGradient>
        </defs>

        <polyline
          class="chart-line"
          points="${points.join(' ')}"
        ></polyline>
      </svg>
    `;
  }

  function connect() {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }

    setStatus('CONNECTING');

    ws = new WebSocket(
      'wss://ws.binaryws.com/websockets/v3'
    );

    ws.addEventListener('open', () => {
      setStatus('LIVE', true);

      subscribeMarket();
      requestHistory();
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          console.error('Deriv API error:', data.error);
          setStatus('ERROR');
          return;
        }

        if (data.msg_type === 'history') {
          processHistory(data);
          return;
        }

        if (data.msg_type === 'tick') {
          processTick(data);
        }
      } catch (error) {
        console.error('Market data error:', error);
      }
    });

    ws.addEventListener('close', () => {
      setStatus('OFFLINE');

      clearTimeout(reconnectTimer);

      reconnectTimer = setTimeout(() => {
        connect();
      }, 3000);
    });

    ws.addEventListener('error', () => {
      setStatus('ERROR');
    });
  }

  function subscribeMarket() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        ticks: selectedSymbol,
        subscribe: 1,
        req_id: 10
      })
    );
  }

  function requestHistory() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    chartData = [];

    ws.send(
      JSON.stringify({
        ticks_history: selectedSymbol,
        end: 'latest',
        count: 120,
        style: 'candles',
        granularity: selectedTimeframe,
        subscribe: 0,
        req_id: 20
      })
    );
  }

  function processHistory(data) {
    if (!data.history) return;

    const prices = data.history.prices || [];
    const times = data.history.times || [];

    chartData = prices.map((price, index) => ({
      time: times[index],
      price: Number(price)
    }));

    drawChart(chartData);

    if (prices.length) {
      updatePrice(Number(prices[prices.length - 1]));
    }
  }

  function processTick(data) {
    if (!data.tick) return;

    const price = Number(data.tick.quote);

    if (!Number.isFinite(price)) return;

    updatePrice(price);

    chartData.push({
      time: Number(data.tick.epoch),
      price
    });

    if (chartData.length > 180) {
      chartData.shift();
    }

    drawChart(chartData);
  }

  function selectMarket(name) {
    if (!markets[name]) return;

    selectedMarket = name;
    selectedSymbol = markets[name];
    previousPrice = null;
    chartData = [];

    if (marketElement) {
      marketElement.textContent = selectedMarket;
    }

    document
      .querySelectorAll('[data-symbol]')
      .forEach(button => {
        button.classList.toggle(
          'active',
          button.dataset.symbol === selectedMarket
        );
      });

    requestHistory();
    subscribeMarket();
  }

  function selectTimeframe(seconds) {
    selectedTimeframe = seconds;

    document
      .querySelectorAll('[data-timeframe]')
      .forEach(button => {
        button.classList.toggle(
          'active',
          Number(button.dataset.timeframe) === seconds
        );
      });

    requestHistory();
  }

  document
    .querySelectorAll('[data-symbol]')
    .forEach(button => {
      button.addEventListener('click', () => {
        selectMarket(button.dataset.symbol);
      });
    });

  document
    .querySelectorAll('[data-timeframe]')
    .forEach(button => {
      button.addEventListener('click', () => {
        selectTimeframe(
          Number(button.dataset.timeframe)
        );
      });
    });

  const signupLinks = document.querySelectorAll(
    'a[href="/api/deriv/signup"]'
  );

  signupLinks.forEach(link => {
    link.addEventListener('click', () => {
      track('signup_click');
    });
  });

  const loginLinks = document.querySelectorAll(
    'a[href="/api/deriv/login"]'
  );

  loginLinks.forEach(link => {
    link.addEventListener('click', () => {
      track('login_click');
    });
  });

  function track(type, extra = {}) {
    try {
      fetch('/api/track', {
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
      }).catch(() => {});
    } catch (_) {}
  }

  track('page_view');

  const params = new URLSearchParams(
    window.location.search
  );

  if (params.get('registered') === '1') {
    showNotice(
      'Deriv account connection completed.'
    );
  }

  if (params.get('logged_in') === '1') {
    showNotice(
      'Deriv account connected successfully.'
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
      window.location.pathname +
      window.location.hash
    );
  }

  connect();
});


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
    top: '22px',
    right: '22px',
    zIndex: '99999',
    maxWidth: '380px',
    padding: '14px 18px',
    borderRadius: '10px',
    background: error ? '#35151d' : '#10271d',
    color: '#fff',
    border: error
      ? '1px solid #743443'
      : '1px solid #28694e',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
    fontWeight: '700',
    boxShadow:
      '0 20px 50px rgba(0,0,0,.45)'
  });

  document.body.appendChild(notice);

  setTimeout(() => {
    notice.style.opacity = '0';
    notice.style.transition =
      'opacity .35s ease';

    setTimeout(() => {
      notice.remove();
    }, 400);
  }, 4500);
}
