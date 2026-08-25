document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const state = {
    socket: null,
    connected: false,
    symbol: null,
    market: "EUR/USD",
    price: null,
    previousPrice: null,
    prices: [],
    activeSymbols: [],
    reconnectTimer: null,
    requestId: 0
  };

  const markets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const status = (value) => {
    setAll("[data-market-status]", value);
    console.log("MARKET STATUS:", value);
  };

  const clean = (value) =>
    String(value || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const normaliseMarket = (value) => {
    const cleaned = clean(value);

    for (const name of Object.keys(markets)) {
      if (clean(name) === cleaned) {
        return name;
      }
    }

    if (cleaned.startsWith("FRX")) {
      const pair = cleaned.substring(3);

      if (pair.length === 6) {
        return `${pair.substring(0, 3)}/${pair.substring(3, 6)}`;
      }
    }

    if (cleaned.length === 6) {
      return `${cleaned.substring(0, 3)}/${cleaned.substring(3, 6)}`;
    }

    return "EUR/USD";
  };

  const formatPrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return number >= 100
      ? number.toFixed(3)
      : number.toFixed(5);
  };

  const resetDisplay = () => {
    setAll("[data-market]", state.market);
    setAll("[data-analysis-market]", state.market);
    setAll("[data-price]", "—");
    setAll("[data-move]", "—");
    setAll("[data-signal]", "WAIT");
    setAll("[data-trend]", "WAIT");
    setAll("[data-momentum]", "WAIT");
    setAll("[data-direction]", "—");
    setAll("[data-entry]", "—");
    setAll("[data-stop]", "—");
    setAll("[data-target]", "—");
  };

  const updateChart = () => {
    const line =
      document.querySelector("[data-live-line]");

    if (!line || state.prices.length < 2) {
      return;
    }

    const width = 1000;
    const height = 400;
    const padding = 20;

    const values = state.prices.slice(-60);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 0.00001;

    const points = values
      .map((value, index) => {
        const x =
          padding +
          (index / Math.max(values.length - 1, 1)) *
            (width - padding * 2);

        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    line.setAttribute("points", points);
  };

  const updateAnalysis = () => {
    if (state.prices.length < 5) {
      return;
    }

    const recent = state.prices.slice(-5);

    const first = recent[0];
    const last = recent[recent.length - 1];

    const difference = last - first;

    let trend = "NEUTRAL";
    let momentum = "LOW";
    let direction = "—";
    let signal = "WAIT";

    if (difference > 0) {
      trend = "BULLISH";
      momentum = "POSITIVE";
      direction = "UP";

      if (state.prices.length >= 10) {
        signal = "CALL";
      }
    }

    if (difference < 0) {
      trend = "BEARISH";
      momentum = "NEGATIVE";
      direction = "DOWN";

      if (state.prices.length >= 10) {
        signal = "PUT";
      }
    }

    setAll("[data-trend]", trend);
    setAll("[data-momentum]", momentum);
    setAll("[data-direction]", direction);
    setAll("[data-signal]", signal);

    const signalElement =
      document.querySelector("[data-signal]");

    if (signalElement) {
      signalElement.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "CALL") {
        signalElement.classList.add("buy");
      } else if (signal === "PUT") {
        signalElement.classList.add("sell");
      } else {
        signalElement.classList.add("wait");
      }
    }

    if (state.price !== null) {
      const movement =
        Math.abs(
          difference ||
          state.price * 0.001
        );

      setAll(
        "[data-entry]",
        formatPrice(state.price)
      );

      setAll(
        "[data-stop]",
        formatPrice(
          state.price - movement
        )
      );

      setAll(
        "[data-target]",
        formatPrice(
          state.price + movement
        )
      );
    }
  };

  const updatePrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return;
    }

    state.previousPrice = state.price;
    state.price = number;

    state.prices.push(number);

    if (state.prices.length > 100) {
      state.prices.shift();
    }

    setAll(
      "[data-price]",
      formatPrice(number)
    );

    if (
      state.previousPrice !== null &&
      state.previousPrice !== 0
    ) {
      const change =
        ((number - state.previousPrice) /
          state.previousPrice) *
        100;

      setAll(
        "[data-move]",
        `${change >= 0 ? "+" : ""}${change.toFixed(3)}%`
      );
    }

    updateChart();
    updateAnalysis();
  };

  /*
   * Find the actual symbol returned
   * by the public Deriv API.
   */
  const findSymbol = () => {
    const wanted = clean(state.market);

    console.log(
      "SEARCHING FOR:",
      state.market
    );

    console.log(
      "ACTIVE SYMBOLS:",
      state.activeSymbols.length
    );

    const result =
      state.activeSymbols.find((item) => {
        const name =
          clean(
            item.display_name ||
            item.underlying_symbol_name
          );

        const symbol =
          clean(
            item.symbol ||
            item.underlying_symbol
          );

        return (
          name === wanted ||
          symbol === clean(
            state.market
          )
        );
      });

    console.log(
      "FOUND SYMBOL:",
      result || null
    );

    return result || null;
  };

  /*
   * Ask the public Deriv endpoint
   * for currently available markets.
   */
  const requestSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    state.requestId++;

    const request = {
      active_symbols: "brief",
      product_type: "basic",
      req_id: state.requestId
    };

    console.log(
      "REQUESTING ACTIVE SYMBOLS:",
      request
    );

    state.socket.send(
      JSON.stringify(request)
    );

    status("LOADING MARKETS");
  };

  /*
   * Subscribe to the actual symbol
   * returned by Deriv.
   */
  const subscribe = () => {
    const record = findSymbol();

    if (!record) {
      console.error(
        "EUR/USD WAS NOT FOUND"
      );

      console.error(
        "AVAILABLE SYMBOLS:",
        state.activeSymbols
      );

      status("MARKET UNAVAILABLE");
      return;
    }

    const symbol =
      record.symbol ||
      record.underlying_symbol;

    if (!symbol) {
      console.error(
        "SYMBOL FIELD MISSING:",
        record
      );

      status("SYMBOL UNAVAILABLE");
      return;
    }

    state.symbol = symbol;

    console.log(
      "VALID DERIV SYMBOL:",
      state.symbol
    );

    try {
      state.socket.send(
        JSON.stringify({
          forget_all: "ticks"
        })
      );
    } catch (error) {
      console.error(
        "FORGET ERROR:",
        error
      );
    }

    state.requestId++;

    const request = {
      ticks: state.symbol,
      subscribe: 1,
      req_id: state.requestId
    };

    console.log(
      "SUBSCRIBING:",
      request
    );

    state.socket.send(
      JSON.stringify(request)
    );

    status("LIVE");
  };

  /*
   * PUBLIC DERIV MARKET DATA
   */
  const connect = () => {
    if (
      state.socket &&
      (
        state.socket.readyState === WebSocket.OPEN ||
        state.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    status("CONNECTING");

    console.log(
      "CONNECTING TO DERIV PUBLIC MARKET DATA"
    );

    let socket;

    try {
      socket = new WebSocket(
        "wss://ws.binaryws.com/websockets/v3"
      );
    } catch (error) {
      console.error(
        "WEBSOCKET CREATION ERROR:",
        error
      );

      status("OFFLINE");
      reconnect();

      return;
    }

    state.socket = socket;

    socket.addEventListener("open", () => {
      state.connected = true;

      console.log(
        "DERIV PUBLIC MARKET DATA CONNECTED"
      );

      requestSymbols();
    });

    socket.addEventListener(
      "message",
      (event) => {
        let data;

        try {
          data = JSON.parse(event.data);
        } catch (error) {
          console.error(
            "INVALID DERIV RESPONSE:",
            event.data
          );

          return;
        }

        console.log(
          "DERIV MESSAGE:",
          data
        );

        if (data.error) {
          console.error(
            "DERIV API ERROR:",
            data.error
          );

          status("MARKET ERROR");
          return;
        }

        if (
          data.msg_type ===
          "active_symbols"
        ) {
          state.activeSymbols =
            Array.isArray(
              data.active_symbols
            )
              ? data.active_symbols
              : [];

          console.log(
            "ACTIVE SYMBOL COUNT:",
            state.activeSymbols.length
          );

          if (
            state.activeSymbols.length === 0
          ) {
            console.error(
              "ZERO ACTIVE SYMBOLS RECEIVED"
            );

            console.error(
              "FULL DERIV RESPONSE:",
              JSON.stringify(
                data,
                null,
                2
              )
            );

            status(
              "NO MARKETS RETURNED"
            );

            return;
          }

          console.log(
            "FIRST SYMBOLS:",
            state.activeSymbols.slice(0, 10)
          );

          subscribe();

          return;
        }

        if (
          data.msg_type === "tick" &&
          data.tick &&
          data.tick.quote !== undefined
        ) {
          console.log(
            "LIVE PRICE:",
            data.tick.quote
          );

          updatePrice(
            data.tick.quote
          );

          status("LIVE");
        }
      }
    );

    socket.addEventListener(
      "error",
      (error) => {
        console.error(
          "DERIV WEBSOCKET ERROR:",
          error
        );

        state.connected = false;
        status("OFFLINE");
      }
    );

    socket.addEventListener(
      "close",
      () => {
        console.log(
          "DERIV CONNECTION CLOSED"
        );

        state.connected = false;
        state.socket = null;

        status("RECONNECTING");

        reconnect();
      }
    );
  };

  const reconnect = () => {
    if (state.reconnectTimer) {
      return;
    }

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, 3000);
  };

  const setupMarkets = () => {
    all("[data-symbol]").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            state.market =
              normaliseMarket(
                button.dataset.symbol ||
                button.textContent
              );

            state.symbol = null;
            state.price = null;
            state.previousPrice = null;
            state.prices = [];

            resetDisplay();

            all("[data-symbol]").forEach(
              (item) => {
                const itemMarket =
                  normaliseMarket(
                    item.dataset.symbol ||
                    item.textContent
                  );

                item.classList.toggle(
                  "active",
                  itemMarket ===
                    state.market
                );
              }
            );

            if (state.connected) {
              subscribe();
            }
          }
        );
      }
    );
  };

  const setupTimeframes = () => {
    all("[data-timeframe]").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            all("[data-timeframe]").forEach(
              (item) => {
                item.classList.remove(
                  "active"
                );
              }
            );

            button.classList.add(
              "active"
            );
          }
        );
      }
    );
  };

  const setupTradingButtons = () => {
    const buy =
      document.querySelector("#buy-button");

    const sell =
      document.querySelector("#sell-button");

    const message =
      document.querySelector(
        "[data-trade-message]"
      );

    const login = () => {
      if (message) {
        message.textContent =
          "LOGIN REQUIRED";
      }

      window.location.href =
        "/api/deriv/login";
    };

    if (buy) {
      buy.addEventListener(
        "click",
        login
      );
    }

    if (sell) {
      sell.addEventListener(
        "click",
        login
      );
    }
  };

  const initialise = () => {
    state.market = "EUR/USD";

    resetDisplay();

    setupMarkets();
    setupTimeframes();
    setupTradingButtons();

    connect();
  };

  initialise();
});
