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

  const MARKET_MAP = {
    "EUR/USD": ["EUR/USD", "EURUSD", "FRXEURUSD"],
    "GBP/USD": ["GBP/USD", "GBPUSD", "FRXGBPUSD"],
    "USD/JPY": ["USD/JPY", "USDJPY", "FRXUSDJPY"],
    "AUD/USD": ["AUD/USD", "AUDUSD", "FRXAUDUSD"],
    "USD/CAD": ["USD/CAD", "USDCAD", "FRXUSDCAD"],
    "USD/CHF": ["USD/CHF", "USDCHF", "FRXUSDCHF"]
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
    console.log("MARKET STATUS:", status);
  };

  const clean = (value) =>
    String(value || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const normaliseMarket = (value) => {
    const cleaned = clean(value);

    for (const [name, aliases] of Object.entries(MARKET_MAP)) {
      if (
        aliases.some(
          (alias) => clean(alias) === cleaned
        )
      ) {
        return name;
      }
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

  const resetMarketDisplay = () => {
    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );

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
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      number;

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
        ((number -
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
   * Find the market inside Deriv's
   * active_symbols response.
   */
  const findMarket = () => {
    const aliases =
      MARKET_MAP[
        state.requestedMarket
      ] || [];

    const cleanedAliases =
      aliases.map(clean);

    console.log(
      "SEARCHING FOR MARKET:",
      state.requestedMarket
    );

    console.log(
      "MARKET ALIASES:",
      cleanedAliases
    );

    const result =
      state.activeSymbols.find(
        (item) => {
          const values = [
            item.symbol,
            item.underlying_symbol,
            item.underlying_symbol_name,
            item.display_name,
            item.display_symbol,
            item.name
          ];

          return values.some(
            (value) =>
              cleanedAliases.includes(
                clean(value)
              )
          );
        }
      );

    console.log(
      "MARKET MATCH:",
      result || null
    );

    return result || null;
  };

  /*
   * Request Deriv's current symbols.
   */
  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      console.error(
        "CANNOT REQUEST SYMBOLS: SOCKET NOT OPEN"
      );

      return;
    }

    state.requestId++;

    const request = {
      active_symbols: "brief",
      product_type: "basic",
      req_id: state.requestId
    };

    console.log(
      "ACTIVE SYMBOLS REQUEST:",
      request
    );

    console.log(
      "ACTIVE SYMBOLS REQUEST JSON:",
      JSON.stringify(
        request
      )
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
   * Subscribe only after Deriv
   * has supplied the actual symbol.
   */
  const subscribeToMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const record =
      findMarket();

    if (!record) {
      console.error(
        "MARKET NOT FOUND:",
        state.requestedMarket
      );

      console.error(
        "AVAILABLE SYMBOLS:",
        state.activeSymbols
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    /*
     * Prefer underlying_symbol.
     * Fall back to symbol if necessary.
     */
    const actualSymbol =
      record.underlying_symbol ||
      record.symbol;

    if (!actualSymbol) {
      console.error(
        "SYMBOL RECORD DOES NOT CONTAIN A VALID SYMBOL:",
        record
      );

      setStatus(
        "SYMBOL UNAVAILABLE"
      );

      return;
    }

    state.symbol =
      actualSymbol;

    console.log(
      "ACTUAL DERIV SYMBOL:",
      state.symbol
    );

    /*
     * Stop previous tick subscription.
     */
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

    /*
     * Subscribe to the actual
     * symbol returned by Deriv.
     */
    state.requestId++;

    const tickRequest = {
      ticks: state.symbol,
      subscribe: 1,
      req_id: state.requestId
    };

    console.log(
      "TICK REQUEST:",
      tickRequest
    );

    state.socket.send(
      JSON.stringify(
        tickRequest
      )
    );

    setStatus("LIVE");
  };

  /*
   * Deriv WebSocket.
   *
   * This domain is already permitted
   * by the website CSP.
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
            "INVALID DERIV JSON:",
            event.data
          );

          return;
        }

        /*
         * Print the complete response.
         */
        console.log(
          "DERIV MESSAGE:",
          data
        );

        console.log(
          "DERIV MESSAGE FULL:",
          JSON.stringify(
            data,
            null,
            2
          )
        );

        /*
         * Print API errors.
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
         * Active symbols response.
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
            state.activeSymbols.length
          ) {
            console.log(
              "FIRST ACTIVE SYMBOLS:",
              state.activeSymbols.slice(
                0,
                10
              )
            );

            subscribeToMarket();
          } else {
            console.error(
              "NO ACTIVE SYMBOLS RETURNED"
            );

            console.error(
              "ECHO REQUEST:",
              JSON.stringify(
                data.echo_req,
                null,
                2
              )
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
          }

          return;
        }

        /*
         * Live price.
         */
        if (
          data.msg_type === "tick" &&
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
            state.previousPrice = null;
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
              subscribeToMarket();
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
