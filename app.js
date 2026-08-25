document.addEventListener("DOMContentLoaded", () => {
  "use strict";

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

    reconnectTimer: null,
    requestId: 0
  };

  /*
   * These are display names / matching aliases.
   * We do NOT use these as the final Deriv symbol.
   *
   * Deriv will provide the actual underlying_symbol.
   */
  const markets = {
    "EUR/USD": [
      "EUR/USD",
      "EURUSD"
    ],

    "GBP/USD": [
      "GBP/USD",
      "GBPUSD"
    ],

    "USD/JPY": [
      "USD/JPY",
      "USDJPY"
    ],

    "AUD/USD": [
      "AUD/USD",
      "AUDUSD"
    ],

    "USD/CAD": [
      "USD/CAD",
      "USDCAD"
    ],

    "USD/CHF": [
      "USD/CHF",
      "USDCHF"
    ]
  };

  const all = (selector) =>
    Array.from(
      document.querySelectorAll(selector)
    );

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setStatus = (status) => {
    setAll(
      "[data-market-status]",
      status
    );

    console.log(
      "MARKET STATUS:",
      status
    );
  };

  const clean = (value) => {
    return String(value || "")
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      )
      .toUpperCase();
  };

  /*
   * Convert anything such as:
   *
   * EUR/USD
   * EURUSD
   * frxEURUSD
   *
   * into:
   *
   * EUR/USD
   */
  const normaliseMarket = (value) => {
    let text = String(
      value || ""
    ).trim();

    if (
      text.toLowerCase().startsWith(
        "frx"
      )
    ) {
      text = text.substring(3);
    }

    const cleaned = clean(text);

    for (
      const market of Object.keys(markets)
    ) {
      const aliases =
        markets[market];

      if (
        aliases.some(
          (alias) =>
            clean(alias) ===
            cleaned
        )
      ) {
        return market;
      }
    }

    return "EUR/USD";
  };

  const formatPrice = (price) => {
    const number = Number(price);

    if (
      !Number.isFinite(number)
    ) {
      return "—";
    }

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  };

  const resetDisplay = () => {
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
   * LIVE CHART
   */
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

    const points =
      values
        .map(
          (value, index) => {
            const x =
              padding +
              (
                index /
                Math.max(
                  values.length - 1,
                  1
                )
              ) *
              (
                width -
                padding * 2
              );

            const y =
              height -
              padding -
              (
                (
                  value - min
                ) /
                range
              ) *
              (
                height -
                padding * 2
              );

            return `${x.toFixed(
              1
            )},${y.toFixed(1)}`;
          }
        )
        .join(" ");

    line.setAttribute(
      "points",
      points
    );
  };

  /*
   * ANALYSIS
   */
  const updateAnalysis = () => {
    if (
      state.prices.length < 5
    ) {
      return;
    }

    const recent =
      state.prices.slice(-5);

    const first =
      recent[0];

    const last =
      recent[
        recent.length - 1
      ];

    const difference =
      last - first;

    let trend = "NEUTRAL";
    let momentum = "LOW";
    let direction = "—";
    let signal = "WAIT";

    if (
      difference > 0
    ) {
      trend = "BULLISH";
      momentum = "POSITIVE";
      direction = "UP";

      if (
        state.prices.length >=
        10
      ) {
        signal = "CALL";
      }
    }

    if (
      difference < 0
    ) {
      trend = "BEARISH";
      momentum = "NEGATIVE";
      direction = "DOWN";

      if (
        state.prices.length >=
        10
      ) {
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

      if (
        signal === "CALL"
      ) {
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

    if (
      state.price !== null
    ) {
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
          state.price -
          movement
        )
      );

      setAll(
        "[data-target]",
        formatPrice(
          state.price +
          movement
        )
      );
    }
  };

  /*
   * LIVE PRICE
   */
  const updatePrice = (
    price
  ) => {
    const number =
      Number(price);

    if (
      !Number.isFinite(number)
    ) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      number;

    state.prices.push(
      number
    );

    if (
      state.prices.length >
      100
    ) {
      state.prices.shift();
    }

    setAll(
      "[data-price]",
      formatPrice(number)
    );

    if (
      state.previousPrice !==
        null &&
      state.previousPrice !==
        0
    ) {
      const change =
        (
          (
            number -
            state.previousPrice
          ) /
          state.previousPrice
        ) *
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
   * FIND MARKET
   *
   * IMPORTANT:
   *
   * We use the NEW Deriv fields:
   *
   * underlying_symbol
   * underlying_symbol_name
   */
  const findMarket = () => {
    const requested =
      normaliseMarket(
        state.requestedMarket
      );

    const aliases =
      markets[
        requested
      ] || [];

    const cleanedAliases =
      aliases.map(clean);

    console.log(
      "SEARCHING MARKET:",
      requested
    );

    console.log(
      "AVAILABLE SYMBOL COUNT:",
      state.activeSymbols.length
    );

    const found =
      state.activeSymbols.find(
        (item) => {
          const symbol =
            clean(
              item.underlying_symbol
            );

          const name =
            clean(
              item.underlying_symbol_name
            );

          return (
            cleanedAliases.includes(
              symbol
            ) ||
            cleanedAliases.includes(
              name
            )
          );
        }
      );

    console.log(
      "MATCHED MARKET:",
      found || null
    );

    return found || null;
  };

  /*
   * REQUEST CURRENT ACTIVE SYMBOLS
   *
   * IMPORTANT:
   *
   * NO product_type.
   *
   * Deriv removed product_type
   * from the current active_symbols
   * request.
   */
  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      console.error(
        "SYMBOL REQUEST FAILED: SOCKET NOT OPEN"
      );

      return;
    }

    state.requestId++;

    const request = {
      active_symbols:
        "brief",

      req_id:
        state.requestId
    };

    console.log(
      "REQUESTING ACTIVE SYMBOLS:",
      request
    );

    setStatus(
      "LOADING MARKETS"
    );

    state.socket.send(
      JSON.stringify(
        request
      )
    );
  };

  /*
   * SUBSCRIBE TO LIVE TICKS
   */
  const subscribeToMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const market =
      findMarket();

    if (!market) {
      console.error(
        "MARKET NOT FOUND:",
        state.requestedMarket
      );

      console.error(
        "DERIV ACTIVE SYMBOLS:",
        state.activeSymbols
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    /*
     * Current Deriv API:
     *
     * underlying_symbol
     */
    const actualSymbol =
      market.underlying_symbol;

    if (!actualSymbol) {
      console.error(
        "DERIV RECORD HAS NO underlying_symbol:",
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
     * Clear previous tick
     * subscriptions.
     */
    try {
      state.socket.send(
        JSON.stringify({
          forget_all:
            "ticks"
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
      ticks:
        state.symbol,

      subscribe:
        1,

      req_id:
        state.requestId
    };

    console.log(
      "SUBSCRIBING TO:",
      request
    );

    state.socket.send(
      JSON.stringify(
        request
      )
    );

    setStatus(
      "LIVE"
    );
  };

  /*
   * CONNECT TO DERIV
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

    console.log(
      "CONNECTING TO DERIV"
    );

    let socket;

    try {
      /*
       * Keep this endpoint because
       * your current CSP allows
       * wss://*.derivws.com
       */
      socket =
        new WebSocket(
          "wss://ws.derivws.com/websockets/v3?app_id=1089"
        );
    } catch (error) {
      console.error(
        "WEBSOCKET CREATION ERROR:",
        error
      );

      setStatus(
        "OFFLINE"
      );

      scheduleReconnect();

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
            event.data
          );

          return;
        }

        console.log(
          "DERIV MESSAGE:",
          data
        );

        /*
         * API ERROR
         */
        if (
          data.error
        ) {
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
         * ACTIVE SYMBOLS
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

          /*
           * This time we expect
           * actual records.
           */
          if (
            state.activeSymbols.length ===
            0
          ) {
            console.error(
              "DERIV RETURNED ZERO ACTIVE SYMBOLS"
            );

            console.error(
              "FULL RESPONSE:",
              JSON.stringify(
                data,
                null,
                2
              )
            );

            setStatus(
              "NO MARKETS RETURNED"
            );

            return;
          }

          /*
           * Print first few records
           * for debugging.
           */
          console.log(
            "FIRST MARKETS:",
            state.activeSymbols.slice(
              0,
              5
            )
          );

          subscribeToMarket();

          return;
        }

        /*
         * LIVE TICK
         */
        if (
          data.msg_type ===
            "tick" &&
          data.tick &&
          data.tick.quote !==
            undefined
        ) {
          console.log(
            "LIVE PRICE:",
            data.tick.quote
          );

          updatePrice(
            data.tick.quote
          );

          setStatus(
            "LIVE"
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
        console.log(
          "DERIV CONNECTION CLOSED"
        );

        state.connected =
          false;

        state.socket =
          null;

        setStatus(
          "RECONNECTING"
        );

        scheduleReconnect();
      }
    );
  };

  /*
   * RECONNECT
   */
  const scheduleReconnect = () => {
    if (
      state.reconnectTimer
    ) {
      return;
    }

    state.reconnectTimer =
      setTimeout(
        () => {
          state.reconnectTimer =
            null;

          connectToDeriv();
        },
        3000
      );
  };

  /*
   * MARKET BUTTONS
   */
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

            state.symbol =
              null;

            state.price =
              null;

            state.previousPrice =
              null;

            state.prices = [];

            resetDisplay();

            all("[data-symbol]")
              .forEach((item) => {
                const itemMarket =
                  normaliseMarket(
                    item.dataset.symbol ||
                    item.textContent
                  );

                item.classList.toggle(
                  "active",
                  itemMarket ===
                    market
                );
              });

            if (
              state.connected
            ) {
              subscribeToMarket();
            }
          }
        );
      });
  };

  /*
   * TIMEFRAME BUTTONS
   */
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

  /*
   * BUY / SELL
   */
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
   * INITIALISE
   */
  const initialise = () => {
    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";

    resetDisplay();

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
