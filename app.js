document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /*
   * PROTRADERS FX
   * Live Deriv market data
   *
   * Uses Deriv's current public market-data WebSocket.
   * No hard-coded Deriv symbol codes are used.
   */

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const state = {
    socket: null,
    connected: false,

    requestedMarket: "EUR/USD",
    symbolName: "EUR/USD",
    symbol: null,

    activeSymbols: [],

    price: null,
    previousPrice: null,

    prices: [],

    requestId: 0,

    reconnectTimer: null,
    reconnectAttempts: 0,

    destroyed: false
  };


  /* =====================================================
     DOM HELPERS
  ===================================================== */

  const all = (selector) => {
    return Array.from(
      document.querySelectorAll(selector)
    );
  };


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


  /* =====================================================
     MARKET NAMES
  ===================================================== */

  const supportedMarkets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };


  /*
   * Convert any of these:
   *
   * EUR/USD
   * EURUSD
   * frxEURUSD
   *
   * into:
   *
   * EUR/USD
   */

  const normaliseMarketName = (value) => {
    if (!value) {
      return "";
    }

    let text = String(value).trim();

    if (
      Object.prototype.hasOwnProperty.call(
        supportedMarkets,
        text
      )
    ) {
      return text;
    }

    text = text
      .replace(/^frx/i, "")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();

    const pairs = [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "USDCAD",
      "USDCHF"
    ];

    if (pairs.includes(text)) {
      return (
        text.substring(0, 3) +
        "/" +
        text.substring(3, 6)
      );
    }

    return String(value).trim();
  };


  /* =====================================================
     PRICE FORMAT
  ===================================================== */

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


  /* =====================================================
     CHART
  ===================================================== */

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
          (
            index /
            Math.max(
              values.length - 1,
              1
            )
          ) *
          (width - padding * 2);

        const y =
          height -
          padding -
          (
            (value - min) /
            range
          ) *
          (height - padding * 2);

        return (
          x.toFixed(1) +
          "," +
          y.toFixed(1)
        );
      })
      .join(" ");

    line.setAttribute(
      "points",
      points
    );
  };


  /* =====================================================
     ANALYSIS
  ===================================================== */

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


    const signalElements =
      all("[data-signal]");

    signalElements.forEach(
      (element) => {
        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (signal === "CALL") {
          element.classList.add(
            "buy"
          );
        } else if (
          signal === "PUT"
        ) {
          element.classList.add(
            "sell"
          );
        } else {
          element.classList.add(
            "wait"
          );
        }
      }
    );


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


  /* =====================================================
     PRICE UPDATE
  ===================================================== */

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
      state.previousPrice !== null &&
      state.previousPrice !== 0
    ) {
      const change =
        (
          (
            numericPrice -
            state.previousPrice
          ) /
          state.previousPrice
        ) *
        100;

      setAll(
        "[data-move]",
        (
          change >= 0
            ? "+"
            : ""
        ) +
        change.toFixed(3) +
        "%"
      );
    }


    updateChart();

    updateAnalysis();
  };


  /* =====================================================
     MARKET DISPLAY
  ===================================================== */

  const updateMarketDisplay = () => {
    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );
  };


  /* =====================================================
     FIND SYMBOL
  ===================================================== */

  const findSymbol = (
    requestedMarket
  ) => {
    const wanted =
      normaliseMarketName(
        requestedMarket
      )
      .replace(
        /[^A-Za-z]/g,
        ""
      )
      .toUpperCase();


    console.log(
      "LOOKING FOR MARKET:",
      wanted
    );


    /*
     * Current Deriv API:
     *
     * underlying_symbol
     * underlying_symbol_name
     */

    const exact =
      state.activeSymbols.find(
        (item) => {
          const display =
            String(
              item.underlying_symbol_name ||
              ""
            )
            .replace(
              /[^A-Za-z]/g,
              ""
            )
            .toUpperCase();

          return display === wanted;
        }
      );


    if (
      exact &&
      exact.underlying_symbol
    ) {
      return exact;
    }


    /*
     * Fallback:
     * compare the underlying symbol itself.
     */

    const bySymbol =
      state.activeSymbols.find(
        (item) => {
          const symbol =
            String(
              item.underlying_symbol ||
              ""
            )
            .replace(
              /^frx/i,
              ""
            )
            .replace(
              /[^A-Za-z]/g,
              ""
            )
            .toUpperCase();

          return symbol === wanted;
        }
      );


    return bySymbol || null;
  };


  /* =====================================================
     REQUEST ACTIVE SYMBOLS
  ===================================================== */

  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }


    const reqId =
      ++state.requestId;


    const request = {
      active_symbols: "brief",
      req_id: reqId
    };


    console.log(
      "REQUESTING ACTIVE SYMBOLS:",
      request
    );


    setStatus(
      "LOADING MARKETS"
    );


    state.socket.send(
      JSON.stringify(request)
    );
  };


  /* =====================================================
     SUBSCRIBE TO MARKET
  ===================================================== */

  const subscribeToMarket = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }


    const market =
      findSymbol(
        state.requestedMarket
      );


    if (
      !market ||
      !market.underlying_symbol
    ) {
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


    state.symbol =
      market.underlying_symbol;


    state.symbolName =
      market.underlying_symbol_name ||
      state.requestedMarket;


    updateMarketDisplay();


    console.log(
      "VALID DERIV SYMBOL:",
      state.symbolName,
      "=>",
      state.symbol
    );


    /*
     * Remove previous tick subscriptions.
     */

    try {
      state.socket.send(
        JSON.stringify({
          forget_all: "ticks"
        })
      );
    } catch (error) {
      console.warn(
        "Unable to clear old tick stream:",
        error
      );
    }


    /*
     * Subscribe to the ACTUAL
     * symbol returned by Deriv.
     */

    const request = {
      ticks: state.symbol,
      subscribe: 1,
      req_id: ++state.requestId
    };


    console.log(
      "SUBSCRIBING TO:",
      request
    );


    state.socket.send(
      JSON.stringify(request)
    );


    setStatus("LIVE");
  };


  /* =====================================================
     RESET MARKET STATE
  ===================================================== */

  const resetMarketState = () => {
    state.price = null;
    state.previousPrice = null;
    state.prices = [];
    state.symbol = null;


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


    const line =
      document.querySelector(
        "[data-live-line]"
      );

    if (line) {
      line.setAttribute(
        "points",
        ""
      );
    }
  };


  /* =====================================================
     CHANGE MARKET
  ===================================================== */

  const setMarket = (
    value
  ) => {
    const marketName =
      normaliseMarketName(
        value
      );


    if (!marketName) {
      return;
    }


    console.log(
      "CHANGING MARKET:",
      marketName
    );


    state.requestedMarket =
      marketName;

    state.symbolName =
      marketName;


    resetMarketState();

    updateMarketDisplay();


    all(
      "[data-symbol]"
    ).forEach(
      (button) => {
        const buttonMarket =
          normaliseMarketName(
            button.dataset.symbol ||
            button.textContent
          );

        button.classList.toggle(
          "active",
          buttonMarket ===
            marketName
        );
      }
    );


    /*
     * If connected, immediately
     * find the real symbol and
     * subscribe to it.
     */

    if (
      state.connected &&
      state.activeSymbols.length
    ) {
      subscribeToMarket();
    }
  };


  /* =====================================================
     MARKET BUTTONS
  ===================================================== */

  const setupMarketButtons = () => {
    all(
      "[data-symbol]"
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            setMarket(
              button.dataset.symbol ||
              button.textContent
            );
          }
        );
      }
    );
  };


  /* =====================================================
     TIMEFRAMES
  ===================================================== */

  const setupTimeframes = () => {
    all(
      "[data-timeframe]"
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            all(
              "[data-timeframe]"
            ).forEach(
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


  /* =====================================================
     TRADING BUTTONS
  ===================================================== */

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


    if (buy) {
      buy.addEventListener(
        "click",
        () => {
          if (message) {
            message.textContent =
              "LOGIN REQUIRED";
          }

          window.location.href =
            "/api/deriv/login";
        }
      );
    }


    if (sell) {
      sell.addEventListener(
        "click",
        () => {
          if (message) {
            message.textContent =
              "LOGIN REQUIRED";
          }

          window.location.href =
            "/api/deriv/login";
        }
      );
    }
  };


  /* =====================================================
     HANDLE DERIV MESSAGE
  ===================================================== */

  const handleMessage = (
    event
  ) => {
    let data;


    try {
      data =
        JSON.parse(
          event.data
        );
    } catch (error) {
      console.error(
        "INVALID DERIV MESSAGE:",
        error
      );

      return;
    }


    console.log(
      "DERIV MESSAGE:",
      data
    );


    /* ---------------------------------------------
       API ERROR
    --------------------------------------------- */

    if (data.error) {
      console.error(
        "DERIV ERROR:",
        data.error
      );


      const code =
        data.error.code || "";


      if (
        code ===
        "InvalidSymbol"
      ) {
        setStatus(
          "INVALID SYMBOL"
        );
      } else {
        setStatus(
          "MARKET ERROR"
        );
      }


      return;
    }


    /* ---------------------------------------------
       ACTIVE SYMBOLS
    --------------------------------------------- */

    if (
      data.msg_type ===
        "active_symbols"
    ) {
      const symbols =
        Array.isArray(
          data.active_symbols
        )
          ? data.active_symbols
          : [];


      state.activeSymbols =
        symbols;


      console.log(
        "ACTIVE SYMBOL COUNT:",
        symbols.length
      );


      if (!symbols.length) {
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
       * Debug the first few markets.
       */

      console.log(
        "FIRST ACTIVE SYMBOLS:",
        symbols
          .slice(0, 10)
          .map(
            (item) => ({
              name:
                item.underlying_symbol_name,
              symbol:
                item.underlying_symbol
            })
          )
      );


      subscribeToMarket();

      return;
    }


    /* ---------------------------------------------
       LIVE TICK
    --------------------------------------------- */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {
      const tick =
        data.tick;


      /*
       * Make sure the tick belongs
       * to the selected symbol.
       */

      if (
        state.symbol &&
        tick.symbol &&
        tick.symbol !== state.symbol
      ) {
        return;
      }


      if (
        tick.quote !== undefined
      ) {
        updatePrice(
          tick.quote
        );
      }


      return;
    }


    /* ---------------------------------------------
       TICK RESPONSE WITHOUT msg_type
       FALLBACK
    --------------------------------------------- */

    if (
      data.tick &&
      data.tick.quote !== undefined
    ) {
      updatePrice(
        data.tick.quote
      );

      return;
    }
  };


  /* =====================================================
     CONNECT TO DERIV
  ===================================================== */

  const connectToDeriv = () => {
    if (state.destroyed) {
      return;
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


    console.log(
      "CONNECTING TO DERIV PUBLIC MARKET DATA"
    );


    let socket;


    try {
      socket =
        new WebSocket(
          DERIV_PUBLIC_WS
        );
    } catch (error) {
      console.error(
        "DERIV WEBSOCKET CREATE ERROR:",
        error
      );

      state.connected = false;

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
        if (
          state.socket !== socket
        ) {
          return;
        }


        state.connected =
          true;

        state.reconnectAttempts =
          0;


        console.log(
          "DERIV CONNECTED"
        );


        requestActiveSymbols();
      }
    );


    socket.addEventListener(
      "message",
      handleMessage
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
      (event) => {
        console.warn(
          "DERIV CONNECTION CLOSED:",
          event.code,
          event.reason
        );


        if (
          state.socket === socket
        ) {
          state.socket = null;
        }


        state.connected =
          false;


        setStatus(
          "RECONNECTING"
        );


        scheduleReconnect();
      }
    );
  };


  /* =====================================================
     RECONNECT
  ===================================================== */

  const scheduleReconnect = () => {
    if (state.destroyed) {
      return;
    }


    if (state.reconnectTimer) {
      return;
    }


    state.reconnectAttempts += 1;


    const delay =
      Math.min(
        3000 *
          state.reconnectAttempts,
        15000
      );


    state.reconnectTimer =
      setTimeout(
        () => {
          state.reconnectTimer =
            null;

          connectToDeriv();
        },
        delay
      );
  };


  /* =====================================================
     INITIALISE
  ===================================================== */

  const initialise = () => {
    console.log(
      "PROTRADERS FX APP INITIALISING"
    );


    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";


    updateMarketDisplay();


    setAll(
      "[data-price]",
      "—"
    );

    setAll(
      "[data-move]",
      "—"
    );

    setAll(
      "[data-market-status]",
      "CONNECTING"
    );


    setupMarketButtons();

    setupTimeframes();

    setupTradingButtons();


    connectToDeriv();
  };


  /* =====================================================
     START
  ===================================================== */

  initialise();
});
