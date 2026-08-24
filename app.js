document.addEventListener('DOMContentLoaded', () => {

  /*
   * ============================================================
   * PROTRADERS FX
   * Trading / Market Analysis Frontend
   * ============================================================
   */

  const track = async (type, extra = {}) => {
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
      console.warn('Tracking unavailable');
    }
  };


  /*
   * ============================================================
   * PAGE TRACKING
   * ============================================================
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
   * ============================================================
   * OAUTH RESULT
   * ============================================================
   */

  const params = new URLSearchParams(window.location.search);

  if (params.get('registered') === '1') {

    showNotice(
      'Deriv account connection completed.',
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


  /*
   * Remove temporary OAuth parameters.
   */

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
   * ============================================================
   * LIVE DERIV MARKET DATA
   * ============================================================
   */

  startMarketData();

});


/*
 * ============================================================
 * LIVE MARKET DATA
 * ============================================================
 */

function startMarketData() {

  /*
   * Current Deriv public WebSocket.
   * Public market data does not require the user's login.
   */

  const WS_URL =
    'wss://api.derivws.com/trading/v1/options/ws/public';

  let socket = null;
  let reconnectTimer = null;

  const symbols = {
    'EUR/USD': 'frxEURUSD',
    'GBP/USD': 'frxGBPUSD',
    'USD/JPY': 'frxUSDJPY'
  };


  function connect() {

    try {

      socket = new WebSocket(WS_URL);

    } catch (error) {

      console.error(
        'Unable to create Deriv WebSocket:',
        error
      );

      scheduleReconnect();

      return;

    }


    socket.addEventListener('open', () => {

      console.log(
        '[ProTraders FX] Market connection established'
      );

      setLiveStatus(true);

      /*
       * Subscribe to each selected market.
       */

      Object.entries(symbols).forEach(
        ([name, symbol], index) => {

          socket.send(
            JSON.stringify({
              ticks: symbol,
              subscribe: 1,
              req_id: index + 10
            })
          );

        }
      );

    });


    socket.addEventListener('message', event => {

      try {

        const data = JSON.parse(event.data);

        if (data.msg_type === 'tick') {

          updateMarketFromTick(data);

        }

      } catch (error) {

        console.warn(
          'Invalid market message',
          error
        );

      }

    });


    socket.addEventListener('error', error => {

      console.warn(
        '[ProTraders FX] Market WebSocket error',
        error
      );

    });


    socket.addEventListener('close', () => {

      console.warn(
        '[ProTraders FX] Market connection closed'
      );

      setLiveStatus(false);

      scheduleReconnect();

    });

  }


  function scheduleReconnect() {

    if (reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {

      reconnectTimer = null;

      connect();

    }, 5000);

  }


  connect();

}


/*
 * ============================================================
 * UPDATE MARKET DATA
 * ============================================================
 */

function updateMarketFromTick(data) {

  const tick = data.tick;

  if (!tick) {
    return;
  }


  const symbol = tick.symbol;
  const quote = Number(tick.quote);

  if (!Number.isFinite(quote)) {
    return;
  }


  let marketName = null;

  if (symbol === 'frxEURUSD') {
    marketName = 'EUR/USD';
  }

  if (symbol === 'frxGBPUSD') {
    marketName = 'GBP/USD';
  }

  if (symbol === 'frxUSDJPY') {
    marketName = 'USD/JPY';
  }

  if (!marketName) {
    return;
  }


  /*
   * Find the corresponding ticker card.
   */

  const cards = document.querySelectorAll('.ticker-card');

  cards.forEach(card => {

    const name =
      card.querySelector('.ticker-head span');

    if (!name) {
      return;
    }

    if (name.textContent.trim() !== marketName) {
      return;
    }


    const price =
      card.querySelector('strong');

    if (price) {

      price.textContent =
        formatPrice(marketName, quote);

    }

  });


  /*
   * Update the large analysis terminal
   * when EUR/USD is selected.
   */

  if (marketName === 'EUR/USD') {

    updateMainPrice(quote);

    updateChart(quote);

  }

}


/*
 * ============================================================
 * MAIN TERMINAL PRICE
 * ============================================================
 */

function updateMainPrice(price) {

  const priceElements =
    document.querySelectorAll(
      '.chart-toolbar .price strong'
    );

  priceElements.forEach(element => {

    element.textContent =
      formatPrice('EUR/USD', price);

  });


  const marker =
    document.querySelector('.chart-marker');

  if (marker) {

    marker.textContent =
      formatPrice('EUR/USD', price);

  }


  /*
   * Also update the first market card.
   */

  const firstCard =
    document.querySelector('.ticker-card strong');

  if (firstCard) {

    firstCard.textContent =
      formatPrice('EUR/USD', price);

  }

}


/*
 * ============================================================
 * CHART ANIMATION
 * ============================================================
 */

const priceHistory = [];

function updateChart(price) {

  priceHistory.push(price);

  /*
   * Keep the chart lightweight.
   */

  if (priceHistory.length > 60) {

    priceHistory.shift();

  }


  const svg =
    document.querySelector('.main-chart svg');

  if (!svg) {
    return;
  }


  const polyline =
    svg.querySelector('polyline');

  if (!polyline) {
    return;
  }


  if (priceHistory.length < 2) {
    return;
  }


  const min =
    Math.min(...priceHistory);

  const max =
    Math.max(...priceHistory);

  const range =
    max - min || 0.0001;


  const points =
    priceHistory
      .map((value, index) => {

        const x =
          (index /
            Math.max(priceHistory.length - 1, 1)) *
          900;

        const y =
          350 -
          ((value - min) / range) *
          280;

        return `${x},${y}`;

      })
      .join(' ');


  polyline.setAttribute(
    'points',
    points
  );

}


/*
 * ============================================================
 * PRICE FORMATTING
 * ============================================================
 */

function formatPrice(symbol, value) {

  if (symbol === 'USD/JPY') {

    return value.toFixed(3);

  }

  return value.toFixed(5);

}


/*
 * ============================================================
 * LIVE STATUS
 * ============================================================
 */

function setLiveStatus(connected) {

  const badges =
    document.querySelectorAll(
      '.live-badge, .market-status strong'
    );


  badges.forEach(element => {

    const indicator =
      element.querySelector('i');

    if (connected) {

      if (element.classList.contains('live-badge')) {

        element.innerHTML =
          '<i></i> LIVE';

      }

      if (
        element.classList.contains('market-status') ||
        element.tagName === 'STRONG'
      ) {

        element.innerHTML =
          '<i></i> OPEN';

      }

    } else {

      if (element.classList.contains('live-badge')) {

        element.innerHTML =
          '<i></i> CONNECTING';

      }

    }

  });


  const dots =
    document.querySelectorAll(
      '.status-dot, .live-badge i'
    );


  dots.forEach(dot => {

    dot.style.opacity =
      connected ? '1' : '.45';

  });

}


/*
 * ============================================================
 * NOTIFICATION
 * ============================================================
 */

function showNotice(message, error = false) {

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


  notice.style.position =
    'fixed';

  notice.style.top =
    '24px';

  notice.style.right =
    '24px';

  notice.style.zIndex =
    '9999';

  notice.style.maxWidth =
    '420px';

  notice.style.padding =
    '15px 18px';

  notice.style.borderRadius =
    '10px';

  notice.style.background =
    error
      ? '#32151d'
      : '#10271f';

  notice.style.color =
    '#ffffff';

  notice.style.border =
    error
      ? '1px solid #803746'
      : '1px solid #287557';

  notice.style.fontFamily =
    'Inter, system-ui, sans-serif';

  notice.style.fontSize =
    '13px';

  notice.style.fontWeight =
    '700';

  notice.style.boxShadow =
    '0 15px 40px rgba(0,0,0,.35)';

  notice.style.transition =
    'opacity .4s ease';


  document.body.appendChild(
    notice
  );


  setTimeout(() => {

    notice.style.opacity =
      '0';

    setTimeout(() => {

      notice.remove();

    }, 400);

  }, 5000);

}
