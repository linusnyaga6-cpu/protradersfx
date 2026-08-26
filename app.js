(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  const WS_URL =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const markets = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };

  const state = {
    socket: null,
    symbol: "EUR/USD",
    derivSymbol: "frxEURUSD",
    price: null,
    previous: null,
    prices: [],
    reconnectTimer: null,
    reconnectDelay: 2000,
    connected: false
  };

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    [...document.querySelectorAll(selector)];

  function status(text) {
    $$("[data-market-status]").forEach(el => {
      el.textContent = text;
    });
  }

  function priceDecimals(symbol) {
    return symbol === "USD/JPY" ? 3 : 5;
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return "—";

    return value.toFixed(
      priceDecimals(state.symbol)
    );
  }

  function updateMarketName() {
    $$("[data-market]").forEach(el => {
      el.textContent = state.symbol;
    });

    $$("[data-analysis-market]").forEach(el => {
      el.textContent = state.symbol;
    });
  }

  function updatePrice() {
    const value = formatPrice(state.price);

    $$("[data-price]").forEach(el => {
      el.textContent = value;
    });

    const move = $("[data-move]");

    if (!move) return;

    if (
      Number.isFinite(state.price) &&
      Number.isFinite(state.previous)
    ) {
      const difference =
        state.price - state.previous;

      const percent =
        state.previous !== 0
          ? (difference / state.previous) * 100
          : 0;

      const sign =
        difference > 0
          ? "+"
          : "";

      move.textContent =
        `${sign}${difference.toFixed(5)} (${sign}${percent.toFixed(3)}%)`;

      move.classList.remove(
        "positive",
        "negative"
      );

      if (difference > 0) {
        move.classList.add("positive");
      }

      if (difference < 0) {
        move.classList.add("negative");
      }
    } else {
      move.textContent = "—";
    }
  }

  function updateChart() {
    const line =
      $("[data-live-line]");

    if (!line || state.prices.length < 2) {
      return;
    }

    const values =
      state.prices.slice();

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const range =
      max - min || 0.00001;

    const points =
      values.map((value, index) => {
        const x =
          (index /
            (values.length - 1)) *
          1000;

        const y =
          345 -
          ((value - min) / range) *
            315;

        return `${x},${y}`;
      });

    line.setAttribute(
      "points",
      points.join(" ")
    );

    const labels =
      $$(".chart-axis span");

    labels.forEach((label, index) => {
      const ratio =
        index /
        Math.max(labels.length - 1, 1);

      const value =
        max -
        (max - min) * ratio;

      label.textContent =
        formatPrice(value);
    });
  }

  function updateAnalysis() {
    if (state.prices.length < 5) {
      return;
    }

    const first =
      state.prices[
        Math.max(
          0,
          state.prices.length - 10
        )
      ];

    const last =
      state.prices[
        state.prices.length - 1
      ];

    const movement =
      last - first;

    let trend = "WAIT";
    let direction = "WAIT";
    let momentum = "NEUTRAL";
    let signal = "WAIT";

    if (movement > 0) {
      trend = "BULLISH";
      direction = "UP";
      momentum = "POSITIVE";
      signal = "BUY";
    }

    if (movement < 0) {
      trend = "BEARISH";
      direction = "DOWN";
      momentum = "NEGATIVE";
      signal = "SELL";
    }

    $$("[data-trend]").forEach(el => {
      el.textContent = trend;
    });

    $$("[data-momentum]").forEach(el => {
      el.textContent = momentum;
    });

    $$("[data-direction]").forEach(el => {
      el.textContent = direction;

      el.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (direction === "UP") {
        el.classList.add("buy");
      } else if (direction === "DOWN") {
        el.classList.add("sell");
      } else {
        el.classList.add("wait");
      }
    });

    $$("[data-signal]").forEach(el => {
      el.textContent = signal;

      el.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "BUY") {
        el.classList.add("buy");
      } else if (signal === "SELL") {
        el.classList.add("sell");
      } else {
        el.classList.add("wait");
      }
    });

    $$("[data-ai-bias]").forEach(el => {
      el.textContent = signal;
    });

    $$("[data-ai-confidence]").forEach(el => {
      el.textContent =
        state.prices.length >= 10
          ? "MEDIUM"
          : "LOW";
    });

    const message =
      $("#ai-message");

    if (message) {
      if (signal === "BUY") {
        message.textContent =
          `${state.symbol} is showing upward short-term movement.`;
      } else if (signal === "SELL") {
        message.textContent =
          `${state.symbol} is showing downward short-term movement.`;
      } else {
        message.textContent =
          "Waiting for clearer market movement.";
      }
    }

    updateLevels();
  }

  function updateLevels() {
    if (!Number.isFinite(state.price)) {
      return;
    }

    const distance =
      state.symbol === "USD/JPY"
        ? 0.08
        : 0.0008;

    $$("[data-entry]").forEach(el => {
      el.textContent =
        formatPrice(state.price);
    });

    $$("[data-target]").forEach(el => {
      el.textContent =
        formatPrice(
          state.price + distance
        );
    });

    $$("[data-stop]").forEach(el => {
      el.textContent =
        formatPrice(
          state.price - distance
        );
    });
  }

  function processTick(data) {
    if (!data || !data.tick) {
      return;
    }

    const quote =
      Number(data.tick.quote);

    if (!Number.isFinite(quote)) {
      return;
    }

    state.previous =
      state.price;

    state.price =
      quote;

    state.prices.push(quote);

    if (state.prices.length > 120) {
      state.prices.shift();
    }

    updatePrice();
    updateChart();
    updateAnalysis();
  }

  function subscribe() {
    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.derivSymbol
    );

    state.price = null;
    state.previous = null;
    state.prices = [];

    updatePrice();

    state.socket.send(
      JSON.stringify({
        ticks: state.derivSymbol,
        subscribe: 1
      })
    );
  }

  function connect() {
    clearTimeout(
      state.reconnectTimer
    );

    console.log(
      "PROTRADERS FX CONNECTING:",
      WS_URL
    );

    status("CONNECTING");

    try {
      state.socket =
        new WebSocket(WS_URL);
    } catch (error) {
      console.error(
        "WEBSOCKET CREATION ERROR:",
        error
      );

      status("OFFLINE");
      reconnect();

      return;
    }

    state.socket.onopen = () => {
      console.log(
        "PROTRADERS FX MARKET CONNECTION OPEN"
      );

      state.connected = true;
      state.reconnectDelay = 2000;

      status("LIVE");

      /*
       * First ask Deriv for active symbols.
       * This endpoint requires no authentication.
       */
      state.socket.send(
        JSON.stringify({
          active_symbols: "brief",
          product_type: "basic"
        })
      );

      /*
       * Then subscribe to our selected market.
       */
      subscribe();
    };

    state.socket.onmessage =
      event => {
        let data;

        try {
          data =
            JSON.parse(event.data);
        } catch (error) {
          console.warn(
            "Invalid WebSocket message",
            event.data
          );

          return;
        }

        if (data.error) {
          console.error(
            "DERIV MARKET ERROR:",
            data.error
          );

          status("MARKET ERROR");

          return;
        }

        if (
          data.msg_type ===
          "active_symbols"
        ) {
          console.log(
            "DERIV ACTIVE SYMBOLS RECEIVED:",
            data.active_symbols?.length || 0
          );

          return;
        }

        if (
          data.msg_type === "tick"
        ) {
          processTick(data);
        }
      };

    state.socket.onerror =
      error => {
        console.error(
          "DERIV WebSocket error:",
          error
        );

        state.connected = false;
        status("OFFLINE");
      };

    state.socket.onclose =
      event => {
        console.warn(
          "DERIV WebSocket closed:",
          event.code,
          event.reason || ""
        );

        state.connected = false;

        status("RECONNECTING");

        reconnect();
      };
  }

  function reconnect() {
    clearTimeout(
      state.reconnectTimer
    );

    const delay =
      state.reconnectDelay;

    console.log(
      `PROTRADERS FX RECONNECTING IN ${delay / 1000}s`
    );

    state.reconnectTimer =
      setTimeout(
        connect,
        delay
      );

    state.reconnectDelay =
      Math.min(
        state.reconnectDelay * 2,
        30000
      );
  }

  function selectMarket(symbol) {
    if (!markets[symbol]) {
      return;
    }

    console.log(
      "PROTRADERS FX SELECTED:",
      symbol
    );

    state.symbol =
      symbol;

    state.derivSymbol =
      markets[symbol];

    state.price = null;
    state.previous = null;
    state.prices = [];

    updateMarketName();
    updatePrice();

    $$(".market-item").forEach(
      button => {
        button.classList.toggle(
          "active",
          button.dataset.symbol ===
            symbol
        );
      }
    );

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      subscribe();
    }
  }

  function setupMarketButtons() {
    $$(".market-item").forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            selectMarket(
              button.dataset.symbol
            );
          }
        );
      }
    );
  }

  function setupTimeframes() {
    $$(".timeframe").forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            $$(".timeframe").forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

            button.classList.add(
              "active"
            );
          }
        );
      }
    );
  }

  function setupTradeButtons() {
    const message =
      $("[data-trade-message]");

    $("#buy-button")?.addEventListener(
      "click",
      () => {
        if (message) {
          message.textContent =
            "LOG IN TO TRADE";
        }
      }
    );

    $("#sell-button")?.addEventListener(
      "click",
      () => {
        if (message) {
          message.textContent =
            "LOG IN TO TRADE";
        }
      }
    );
  }

  function init() {
    console.log(
      "PROTRADERS FX INITIALIZING"
    );

    updateMarketName();

    setupMarketButtons();
    setupTimeframes();
    setupTradeButtons();

    status("CONNECTING");

    connect();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();
