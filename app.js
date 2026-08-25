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
    reconnectTimer: null,
    activeSymbols: []
  };

  const marketNames = {
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

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
  };

  const clean = (value) =>
    String(value || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const normaliseMarket = (value) => {
    const cleaned = clean(value);

    if (marketNames[value]) {
      return marketNames[value];
    }

    if (cleaned === "FRXEURUSD") return "EUR/USD";
    if (cleaned === "EURUSD") return "EUR/USD";

    if (cleaned === "FRXGBPUSD") return "GBP/USD";
    if (cleaned === "GBPUSD") return "GBP/USD";

    if (cleaned === "FRXUSDJPY") return "USD/JPY";
    if (cleaned === "USDJPY") return "USD/JPY";

    if (cleaned === "FRXAUDUSD") return "AUD/USD";
    if (cleaned === "AUDUSD") return "AUD/USD";

    if (cleaned === "FRXUSDCAD") return "USD/CAD";
    if (cleaned === "USDCAD") return "USD/CAD";

    if (cleaned === "FRXUSDCHF") return "USD/CHF";
    if (cleaned === "USDCHF") return "USD/CHF";

    return value || "EUR/USD";
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

  /*
   * Find the actual symbol returned by Deriv.
   *
   * Example:
   *
   * underlying_symbol:
   * frxEURUSD
   *
   * underlying_symbol_name:
   * EUR/USD
   */
  const findActiveSymbol = (marketName) => {
    const wanted = clean(marketName);

    console.log(
      "LOOKING FOR MARKET:",
      wanted
    );

    const found =
      state.activeSymbols.find((item) => {
        const name =
          clean(
            item.underlying_symbol_name
          );

        const symbol =
          clean(
            item.underlying_symbol
          );

        return (
          name === wanted ||
          symbol === wanted
        );
      });

    if (found) {
      console.log(
        "MATCHED MARKET:",
        found
      );
    } else {
      console.error(
        "MARKET NOT FOUND:",
        marketName
      );
    }

    return found || null;
  };

  const updateChart = () => {
    const line =
      document.querySelector(
        "[data-live-line]"
      );

    if (
      !line ||
      state.prices.length < 2
    ) {
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
          ((value - min) /
            range) *
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
      } else if (signal === "PUT") {
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
      const movement =
        Math.abs(
          difference ||
            state.price * 0.001
        );

      setAll(
        "[data-entry]",
        formatPrice(
          state.price
        )
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

    if (state.prices.length > 100) {
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
   * STEP 1
   *
   * Ask Deriv for the actual currently
   * active symbols.
   *
   * No EUR/USD code is hard-coded here.
   */
  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    console.log(
      "ACTIVE SYMBOLS REQUEST SENT"
    );

    setStatus(
      "LOADING MARKETS"
    );

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief",
        req_id: 1
      })
    );
  };

  /*
   * STEP 2
   *
   * Find EUR/USD, GBP/USD, etc.
   * inside Deriv's response.
   */
  const subscribeToRequestedMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const market =
      findActiveSymbol(
        state.requestedMarket
      );

    if (!market) {
      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    /*
     * THIS is the important value.
     *
     * Example:
     * frxEURUSD
     */
    const actualSymbol =
      market.underlying_symbol;

    if (!actualSymbol) {
      console.error(
        "DERIV RECORD HAS NO UNDERLYING SYMBOL:",
        market
      );

      setStatus(
        "SYMBOL UNAVAILABLE"
      );

      return;
    }

    state.symbol =
      actualSymbol;

    console.log(
      "VALID DERIV SYMBOL:",
      state.symbol
    );

    /*
     * Stop any previous tick stream.
     */
    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    /*
     * STEP 3
     *
     * Subscribe using the actual
     * symbol returned by Deriv.
     */
    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1,
        req_id: 2
      })
    );

    console.log(
      "TICK SUBSCRIPTION SENT:",
      state.symbol
    );

    setStatus("LIVE");
  };

  /*
   * STEP 4
   *
   * Connect to Deriv's public
   * market-data WebSocket.
   */
  const connectToDeriv = () => {
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
        "DERIV CONNECTION ERROR:",
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
            "DERIV JSON ERROR:",
            error
          );

          return;
        }

        console.log(
          "DERIV MESSAGE:",
          data
        );

        /*
         * API error.
         */
        if (data.error) {
          console.error(
            "DERIV ERROR:",
            data.error
          );

          setStatus(
            "MARKET ERROR"
          );

          return;
        }

        /*
         * ACTIVE SYMBOLS RESPONSE
         */
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
              "DERIV RETURNED ZERO ACTIVE SYMBOLS:",
              data
            );

            setStatus(
              "NO MARKETS RETURNED"
            );

            return;
          }

          /*
           * Print EUR/USD record so
           * we can verify it directly.
           */
          const eur =
            state.activeSymbols.find(
              (item) =>
                clean(
                  item.underlying_symbol_name
                ) === "EURUSD"
            );

          console.log(
            "EUR/USD RECORD:",
            eur || null
          );

          subscribeToRequestedMarket();

          return;
        }

        /*
         * LIVE TICK
         */
        if (
          data.msg_type === "tick" &&
          data.tick &&
          data.tick.quote !==
            undefined
        ) {
          updatePrice(
            data.tick.quote
          );

          return;
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

  const setupMarketButtons = () => {
    all("[data-symbol]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const market =
              normaliseMarket(
                button.dataset.symbol ||
                  button.textContent
              );

            state.requestedMarket =
              market;

            state.symbolName =
              market;

            state.symbol = null;
            state.price = null;
            state.previousPrice =
              null;
            state.prices = [];

            resetMarketDisplay();

            all("[data-symbol]")
              .forEach((item) => {
                const itemMarket =
                  normaliseMarket(
                    item.dataset.symbol ||
                      item.textContent
                  );

                item.classList.toggle(
                  "active",
                  itemMarket === market
                );
              });

            if (
              state.connected
            ) {
              subscribeToRequestedMarket();
            }
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
