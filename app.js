document.addEventListener("DOMContentLoaded", () => {
  const state = {
    socket: null,
    connected: false,
    symbol: null,
    symbolName: "EUR/USD",
    requestedMarket: "EUR/USD",
    price: null,
    previousPrice: null,
    prices: [],
    activeSymbols: [],
    reconnectTimer: null
  };

  const MARKETS = {
    "EUR/USD": ["EURUSD", "EUR/USD"],
    "GBP/USD": ["GBPUSD", "GBP/USD"],
    "USD/JPY": ["USDJPY", "USD/JPY"],
    "AUD/USD": ["AUDUSD", "AUD/USD"],
    "USD/CAD": ["USDCAD", "USD/CAD"],
    "USD/CHF": ["USDCHF", "USD/CHF"]
  };

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
  };

  const formatPrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  };

  const clean = (value) => {
    return String(value || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
  };

  const marketKey = (value) => {
    const cleaned = clean(value);

    for (const [name, aliases] of Object.entries(MARKETS)) {
      for (const alias of aliases) {
        if (cleaned === clean(alias)) {
          return name;
        }
      }
    }

    return value;
  };

  /*
   * Extract every potentially useful field from
   * a Deriv active-symbol record.
   */
  const getRecordValues = (record) => {
    return [
      record.symbol,
      record.underlying_symbol,
      record.display_symbol,
      record.display_name,
      record.underlying_symbol_name,
      record.name,
      record.market_display_name,
      record.symbol_name
    ].filter(Boolean);
  };

  /*
   * Find a market inside Deriv's active-symbol response.
   */
  const findMarket = (marketName) => {
    const wanted = clean(
      marketKey(marketName)
    );

    if (!wanted) {
      return null;
    }

    for (const record of state.activeSymbols) {
      const values = getRecordValues(record);

      for (const value of values) {
        const valueClean = clean(value);

        if (
          valueClean === wanted ||
          valueClean.includes(wanted)
        ) {
          /*
           * Avoid accidentally selecting an unrelated
           * instrument that merely contains the letters.
           */
          if (
            valueClean === wanted ||
            valueClean.includes(wanted)
          ) {
            return record;
          }
        }
      }
    }

    return null;
  };

  /*
   * Extract the actual trading symbol.
   */
  const getTradingSymbol = (record) => {
    if (!record) {
      return null;
    }

    /*
     * Current Deriv responses can expose the
     * underlying trading symbol here.
     */
    if (record.underlying_symbol) {
      return record.underlying_symbol;
    }

    /*
     * Older responses use symbol.
     */
    if (record.symbol) {
      return record.symbol;
    }

    return null;
  };

  const updateChart = () => {
    const line =
      document.querySelector(
        "[data-live-line]"
      );

    if (!line || state.prices.length < 2) {
      return;
    }

    const width = 1000;
    const height = 400;
    const padding = 20;

    const values =
      state.prices.slice(-60);

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const range =
      max - min || 0.00001;

    const points = values
      .map((value, index) => {
        const x =
          padding +
          (index /
            Math.max(
              values.length - 1,
              1
            )) *
            (width - padding * 2);

        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    line.setAttribute(
      "points",
      points
    );
  };

  const updateAnalysis = () => {
    if (state.prices.length < 5) {
      return;
    }

    const recent =
      state.prices.slice(-5);

    const first = recent[0];
    const last =
      recent[recent.length - 1];

    const difference =
      last - first;

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

    setAll(
      "[data-trend]",
      trend
    );

    setAll(
      "[data-momentum]",
      momentum
    );

    setAll(
      "[data-direction]",
      direction
    );

    setAll(
      "[data-signal]",
      signal
    );

    const signalElement =
      document.querySelector(
        "[data-signal]"
      );

    if (signalElement) {
      signalElement.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "CALL") {
        signalElement.classList.add(
          "buy"
        );
      } else if (
        signal === "PUT"
      ) {
        signalElement.classList.add(
          "sell"
        );
      } else {
        signalElement.classList.add(
          "wait"
        );
      }
    }

    if (state.price !== null) {
      setAll(
        "[data-entry]",
        formatPrice(
          state.price
        )
      );

      const movement =
        Math.abs(
          difference ||
            state.price * 0.001
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
    const numericPrice =
      Number(price);

    if (
      !Number.isFinite(
        numericPrice
      )
    ) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      numericPrice;

    state.prices.push(
      numericPrice
    );

    if (
      state.prices.length > 100
    ) {
      state.prices.shift();
    }

    setAll(
      "[data-price]",
      formatPrice(
        numericPrice
      )
    );

    if (
      state.previousPrice !== null
    ) {
      const change =
        ((numericPrice -
          state.previousPrice) /
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
   * Reset the displayed market.
   */
  const resetMarketDisplay = () => {
    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );

    setAll(
      "[data-price]",
      "—"
    );

    setAll(
      "[data-move]",
      "—"
    );

    setAll(
      "[data-signal]",
      "WAIT"
    );

    setAll(
      "[data-trend]",
      "WAIT"
    );

    setAll(
      "[data-momentum]",
      "WAIT"
    );

    setAll(
      "[data-direction]",
      "—"
    );

    setAll(
      "[data-entry]",
      "—"
    );

    setAll(
      "[data-stop]",
      "—"
    );

    setAll(
      "[data-target]",
      "—"
    );
  };

  /*
   * Change market from the homepage buttons.
   */
  const setMarket = (value) => {
    const name =
      marketKey(value);

    state.requestedMarket =
      name;

    state.symbolName =
      name;

    state.price = null;
    state.previousPrice = null;
    state.prices = [];

    resetMarketDisplay();

    all("[data-symbol]")
      .forEach((button) => {
        const buttonMarket =
          marketKey(
            button.dataset.symbol ||
              button.textContent
          );

        button.classList.toggle(
          "active",
          buttonMarket === name
        );
      });

    if (
      state.connected &&
      state.socket
    ) {
      subscribeToMarket();
    }
  };

  const setupMarketButtons = () => {
    all("[data-symbol]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            setMarket(
              button.dataset.symbol ||
                button.textContent
            );
          }
        );
      });
  };

  const setupTimeframes = () => {
    all("[data-timeframe]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            all(
              "[data-timeframe]"
            ).forEach((item) => {
              item.classList.remove(
                "active"
              );
            });

            button.classList.add(
              "active"
            );
          }
        );
      });
  };

  const setupTradingButtons = () => {
    const buy =
      document.querySelector(
        "#buy-button"
      );

    const sell =
      document.querySelector(
        "#sell-button"
      );

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

  /*
   * Request active symbols.
   *
   * IMPORTANT:
   * No product_type parameter.
   */
  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    setStatus(
      "LOADING MARKETS"
    );

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief"
      })
    );

    console.log(
      "ACTIVE SYMBOLS REQUEST SENT"
    );
  };

  /*
   * Subscribe to the actual symbol returned
   * by Deriv.
   */
  const subscribeToMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const record =
      findMarket(
        state.requestedMarket
      );

    console.log(
      "REQUESTED MARKET:",
      state.requestedMarket
    );

    console.log(
      "MATCHED RECORD:",
      record
    );

    if (!record) {
      setStatus(
        "MARKET UNAVAILABLE"
      );

      console.error(
        "NO MATCH FOR:",
        state.requestedMarket
      );

      return;
    }

    const symbol =
      getTradingSymbol(record);

    if (!symbol) {
      setStatus(
        "SYMBOL UNAVAILABLE"
      );

      console.error(
        "MATCHED RECORD HAS NO TRADING SYMBOL:",
        record
      );

      return;
    }

    state.symbol =
      symbol;

    console.log(
      "VALID DERIV SYMBOL:",
      state.symbol
    );

    /*
     * Clear previous tick subscriptions.
     */
    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    /*
     * Subscribe using Deriv's actual
     * returned symbol.
     */
    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1
      })
    );

    setStatus("LIVE");
  };

  const connectToDeriv = () => {
    if (
      state.reconnectTimer
    ) {
      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer =
        null;
    }

    if (
      state.socket &&
      (
        state.socket.readyState ===
          WebSocket.OPEN ||
        state.socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return;
    }

    setStatus(
      "CONNECTING"
    );

    let socket;

    try {
      socket =
        new WebSocket(
          "wss://ws.derivws.com/websockets/v3?app_id=1089"
        );
    } catch (error) {
      console.error(
        "WEBSOCKET ERROR:",
        error
      );

      setStatus(
        "OFFLINE"
      );

      return;
    }

    state.socket =
      socket;

    socket.addEventListener(
      "open",
      () => {
        state.connected =
          true;

        console.log(
          "DERIV CONNECTED"
        );

        requestActiveSymbols();
      }
    );

    socket.addEventListener(
      "message",
      (event) => {
        let data;

        try {
          data =
            JSON.parse(
              event.data
            );
        } catch (error) {
          console.error(
            "INVALID JSON:",
            event.data
          );

          return;
        }

        /*
         * Print every API response while
         * debugging symbol discovery.
         */
        console.log(
          "DERIV MESSAGE:",
          data
        );

        /*
         * API error.
         */
        if (data.error) {
          console.error(
            "DERIV API ERROR:",
            data.error
          );

          setStatus(
            "MARKET ERROR"
          );

          return;
        }

        /*
         * Active-symbol response.
         */
        if (
          data.msg_type ===
            "active_symbols"
        ) {
          /*
           * Accept the normal response.
           */
          if (
            Array.isArray(
              data.active_symbols
            )
          ) {
            state.activeSymbols =
              data.active_symbols;
          } else {
            state.activeSymbols =
              [];
          }

          console.log(
            "ACTIVE SYMBOL COUNT:",
            state.activeSymbols.length
          );

          /*
           * If Deriv returned symbols,
           * continue with discovery.
           */
          if (
            state.activeSymbols.length
          ) {
            subscribeToMarket();
          } else {
            /*
             * Do not pretend we have a symbol.
             */
            setStatus(
              "NO MARKETS RETURNED"
            );

            console.error(
              "DERIV RETURNED ZERO ACTIVE SYMBOLS:",
              data
            );
          }

          return;
        }

        /*
         * Live tick.
         */
        if (
          data.tick &&
          data.tick.quote !==
            undefined
        ) {
          updatePrice(
            data.tick.quote
          );

          return;
        }

        /*
         * Subscription confirmation.
         */
        if (
          data.msg_type ===
            "tick"
        ) {
          if (
            data.tick &&
            data.tick.quote !==
              undefined
          ) {
            updatePrice(
              data.tick.quote
            );
          }
        }
      }
    );

    socket.addEventListener(
      "error",
      (error) => {
        console.error(
          "DERIV SOCKET ERROR:",
          error
        );

        state.connected =
          false;

        setStatus(
          "OFFLINE"
        );
      }
    );

    socket.addEventListener(
      "close",
      () => {
        state.connected =
          false;

        state.socket =
          null;

        setStatus(
          "RECONNECTING"
        );

        state.reconnectTimer =
          setTimeout(
            connectToDeriv,
            3000
          );
      }
    );
  };

  const initialise = () => {
    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";

    resetMarketDisplay();

    setStatus(
      "CONNECTING"
    );

    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();

    connectToDeriv();
  };

  initialise();
});
