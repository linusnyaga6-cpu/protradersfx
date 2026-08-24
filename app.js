document.addEventListener('DOMContentLoaded', () => {
  const priceEl = document.querySelector('.price-value');
  const moveEl = document.querySelector('.move-value');
  const marketEl = document.querySelector('.market-symbol');
  const chartEl = document.querySelector('.chart-line');
  const liveEl = document.querySelector('.live-status');

  const markets = [
    { symbol: 'frxEURUSD', name: 'EUR/USD' },
    { symbol: 'frxGBPUSD', name: 'GBP/USD' },
    { symbol: 'frxUSDJPY', name: 'USD/JPY' },
    { symbol: 'frxAUDUSD', name: 'AUD/USD' },
    { symbol: 'frxUSDCAD', name: 'USD/CAD' },
    { symbol: 'frxUSDCHF', name: 'USD/CHF' }
  ];

  let selectedMarket = markets[0];
  let socket = null;
  let previousPrice = null;
  let prices = [];

  function setLive(status) {
    if (!liveEl) return;

    liveEl.textContent = status;
    liveEl.classList.toggle('offline', status !== 'LIVE');
  }

  function formatPrice(price, symbol) {
    if (symbol.includes('JPY')) {
      return Number(price).toFixed(3);
    }

    return Number(price).toFixed(5);
  }

  function updatePrice(price) {
    if (!priceEl) return;

    const formatted = formatPrice(price, selectedMarket.symbol);

    priceEl.textContent = formatted;

    if (previousPrice !== null && moveEl) {
      const change = ((price - previousPrice) / previousPrice) * 100;

      moveEl.textContent =
        `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

      moveEl.classList.toggle('negative', change < 0);
    }

    previousPrice = price;

    prices.push(price);

    if (prices.length > 80) {
      prices.shift();
    }

    drawChart();
  }

  function drawChart() {
    if (!chartEl || prices.length < 2) return;

    const width = 600;
    const height = 260;

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const range = max - min || 0.00001;

    const points = prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y =
        height -
        ((price - min) / range) * (height - 30) -
        15;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    chartEl.setAttribute('points', points.join(' '));
  }

  function connectMarket() {
    if (socket) {
      try {
        socket.close();
      } catch (e) {}
    }

    setLive('CONNECTING');

    socket = new WebSocket(
      'wss://ws.derivws.com/websockets/v3?app_id=1089'
    );

    socket.addEventListener('open', () => {
      setLive('LIVE');

      socket.send(JSON.stringify({
        ticks: selectedMarket.symbol,
        subscribe: 1
      }));
    });

    socket.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data);

        if (data.tick && data.tick.quote) {
          updatePrice(Number(data.tick.quote));
        }
      } catch (error) {
        console.error('Market data error:', error);
      }
    });

    socket.addEventListener('error', error => {
      console.error('WebSocket error:', error);
      setLive('OFFLINE');
    });

    socket.addEventListener('close', () => {
      setLive('OFFLINE');

      setTimeout(() => {
        connectMarket();
      }, 3000);
    });
  }

  function selectMarket(market) {
    selectedMarket = market;
    previousPrice = null;
    prices = [];

    if (marketEl) {
      marketEl.textContent = market.name;
    }

    if (priceEl) {
      priceEl.textContent = '—';
    }

    if (moveEl) {
      moveEl.textContent = '—';
    }

    connectMarket();
  }

  /*
   * Market selector
   */

  document.querySelectorAll('[data-market]').forEach(button => {
    button.addEventListener('click', () => {
      const symbol = button.dataset.market;

      const market = markets.find(
        item => item.symbol === symbol
      );

      if (market) {
        document
          .querySelectorAll('[data-market]')
          .forEach(item => item.classList.remove('active'));

        button.classList.add('active');

        selectMarket(market);
      }
    });
  });

  /*
   * Chart timeframe buttons
   *
   * These currently control the selected timeframe visually.
   * Historical candles can be connected next.
   */

  document.querySelectorAll('[data-timeframe]').forEach(button => {
    button.addEventListener('click', () => {
      document
        .querySelectorAll('[data-timeframe]')
        .forEach(item => item.classList.remove('active'));

      button.classList.add('active');
    });
  });

  /*
   * OAuth messages
   */

  const params = new URLSearchParams(window.location.search);

  if (params.get('registered') === '1') {
    showNotice('Deriv account connection completed.');
  }

  if (params.get('logged_in') === '1') {
    showNotice('Deriv login successful.');
  }

  if (params.get('oauth_error')) {
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
      window.location.pathname + window.location.hash
    );
  }

  /*
   * Start market
   */

  const firstMarket = document.querySelector(
    '[data-market="frxEURUSD"]'
  );

  if (firstMarket) {
    firstMarket.classList.add('active');
  }

  connectMarket();
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

  notice.style.position = 'fixed';
  notice.style.top = '24px';
  notice.style.right = '24px';
  notice.style.zIndex = '9999';
  notice.style.maxWidth = '380px';
  notice.style.padding = '14px 18px';
  notice.style.borderRadius = '10px';

  notice.style.background =
    error ? '#32151b' : '#102a20';

  notice.style.color = '#fff';

  notice.style.border =
    error
      ? '1px solid #71313e'
      : '1px solid #286c51';

  notice.style.fontFamily =
    'Inter, Arial, sans-serif';

  notice.style.fontSize = '13px';
  notice.style.fontWeight = '700';

  notice.style.boxShadow =
    '0 15px 40px rgba(0,0,0,.35)';

  document.body.appendChild(notice);

  setTimeout(() => {
    notice.style.opacity = '0';
    notice.style.transition = 'opacity .4s ease';

    setTimeout(() => {
      notice.remove();
    }, 400);
  }, 4500);
}
