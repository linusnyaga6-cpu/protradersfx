document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX STARTING");

  /* =========================================================
     DERIV PUBLIC MARKET DATA
  ========================================================= */

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";


  /* =========================================================
     STATE
  ========================================================= */

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

    authenticated: false,
    sessionExpiresAt: null,

    timeframe: "1m",

    destroyed: false
  };


  /* =========================================================
     DOM HELPERS
  ========================================================= */

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));


  const one = (selector) =>
    document.querySelector(selector);


  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };


  /* =========================================================
     STATUS
  ========================================================= */

  const setStatus = (status) => {
    setAll(
      "[data-market-status]",
      status
    );

    console.log(
      "MARKET:",
      status
    );
  };


  const setAccountStatus = (status) => {
    setAll(
      "[data-account-status]",
      status
    );

    console.log(
      "ACCOUNT:",
      status
    );
  };


  /* =========================================================
     SUPPORTED MARKETS
  ========================================================= */

  const supportedMarkets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };


  /* =========================================================
     NORMALISE MARKET
  ========================================================= */

  const normaliseMarketName = (value) => {

    if (!value) {
      return "";
    }

    let text =
      String(value).trim();


    if (
      Object.prototype.hasOwnProperty.call(
        supportedMarkets,
        text
      )
    ) {
      return text;
    }


    text =
      text
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


  /* =========================================================
     PRICE FORMAT
  ========================================================= */

  const formatPrice = (price) => {

    const number =
      Number(price);


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


  /* =========================================================
     MARKET DISPLAY
  ========================================================= */

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


  /* =========================================================
     CHART WINDOW
  ========================================================= */

  const getChartWindow = () => {

    const sizes = {
      "1m": 60,
      "5m": 60,
      "15m": 80,
      "1h": 100,
      "4h": 120
    };


    return (
      sizes[state.timeframe] ||
      60
    );
  };


  /* =========================================================
     CHART
  ========================================================= */

  const updateChart = () => {

    const line =
      one("[data-live-line]");


    if (!line) {
      return;
    }


    const values =
      state.prices.slice(
        -getChartWindow()
      );


    if (
      values.length < 2
    ) {

      line.setAttribute(
        "points",
        ""
      );

      return;
    }


    const width = 1000;
    const height = 400;

    const paddingX = 22;
    const paddingY = 22;


    let min =
      Math.min(...values);

    let max =
      Math.max(...values);


    /*
     * Prevent a completely flat
     * chart when consecutive ticks
     * have the same quote.
     */

    if (max === min) {

      const padding =
        Math.abs(max) * 0.0001 ||
        0.00001;

      min -= padding;
      max += padding;
    }


    const range =
      max - min;


    const points =
      values
        .map((value, index) => {

          const x =
            paddingX +
            (
              index /
              Math.max(
                values.length - 1,
                1
              )
            ) *
            (
              width -
              paddingX * 2
            );


          const y =
            height -
            paddingY -
            (
              (
                value - min
              ) /
              range
            ) *
            (
              height -
              paddingY * 2
            );


          return (
            x.toFixed(2) +
            "," +
            y.toFixed(2)
          );
        })
        .join(" ");


    line.setAttribute(
      "points",
      points
    );


    /* Y AXIS */

    const axis =
      all(".chart-y-axis span");


    if (
      axis.length >= 5
    ) {

      axis.forEach(
        (element, index) => {

          const value =
            max -
            (
              (
                max - min
              ) /
              4
            ) *
            index;


          element.textContent =
            formatPrice(value);
        }
      );
    }
  };


  /* =========================================================
     ANALYSIS
  ========================================================= */

  const updateAnalysis = () => {

    if (
      state.prices.length < 5
    ) {
      return;
    }


    const values =
      state.prices.slice(-10);


    const first =
      values[0];


    const last =
      values[values.length - 1];


    const difference =
      last - first;


    const absoluteMove =
      Math.abs(difference);


    const percentageMove =
      first !== 0
        ? (
            absoluteMove /
            first
          ) * 100
        : 0;


    let trend = "NEUTRAL";
    let momentum = "LOW";
    let direction = "FLAT";
    let signal = "WAIT";


    /*
     * This is a simple market
     * direction scanner.
     *
     * It does NOT pretend to be
     * guaranteed trading advice.
     */

    if (
      difference > 0
    ) {

      trend = "BULLISH";
      direction = "UP";

      momentum =
        percentageMove >= 0.02
          ? "HIGH"
          : "POSITIVE";


      if (
        state.prices.length >= 10 &&
        percentageMove >= 0.01
      ) {
        signal = "CALL";
      }

    } else if (
      difference < 0
    ) {

      trend = "BEARISH";
      direction = "DOWN";

      momentum =
        percentageMove >= 0.02
          ? "HIGH"
          : "NEGATIVE";


      if (
        state.prices.length >= 10 &&
        percentageMove >= 0.01
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


    all(
      "[data-signal]"
    ).forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );


        if (
          signal === "CALL"
        ) {

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


    /* =======================================================
       LEVELS
    ======================================================= */

    if (
      state.price !== null
    ) {

      /*
       * Use a small dynamic range
       * around the current price.
       */

      const movement =
        Math.max(
          Math.abs(difference),
          state.price * 0.0005
        );


      let stop;
      let target;


      if (
        signal === "PUT"
      ) {

        stop =
          state.price +
          movement;

        target =
          state.price -
          movement;

      } else {

        stop =
          state.price -
          movement;

        target =
          state.price +
          movement;
      }


      setAll(
        "[data-entry]",
        formatPrice(
          state.price
        )
      );


      setAll(
        "[data-stop]",
        formatPrice(stop)
      );


      setAll(
        "[data-target]",
        formatPrice(target)
      );
    }
  };


  /* =========================================================
     PRICE UPDATE
  ========================================================= */

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
      state.prices.length > 150
    ) {

      state.prices =
        state.prices.slice(-150);
    }


    setAll(
      "[data-price]",
      formatPrice(
        numericPrice
      )
    );


    /* =======================================================
       PRICE CHANGE
    ======================================================= */

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
        ) * 100;


      const move =
        (
          change >= 0
            ? "+"
            : ""
        ) +
        change.toFixed(3) +
        "%";


      setAll(
        "[data-move]",
        move
      );


      all(
        "[data-move]"
      ).forEach(
        (element) => {

          element.classList.remove(
            "positive",
            "negative"
          );


          element.classList.add(
            change >= 0
              ? "positive"
              : "negative"
          );
        }
      );
    }


    updateChart();
    updateAnalysis();
  };


  /* =========================================================
     RESET MARKET
  ========================================================= */

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


    all(
      "[data-move]"
    ).forEach(
      (element) => {

        element.classList.remove(
          "positive",
          "negative"
        );
      }
    );


    const line =
      one("[data-live-line]");


    if (line) {

      line.setAttribute(
        "points",
        ""
      );
    }
  };


  /* =========================================================
     FIND DERIV SYMBOL
  ========================================================= */

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
      "FINDING SYMBOL:",
      requestedMarket,
      wanted
    );


    /*
     * First: exact market name.
     */

    const exact =
      state.activeSymbols.find(
        (item) => {

          const name =
            String(
              item.underlying_symbol_name ||
              ""
            )
              .replace(
                /[^A-Za-z]/g,
                ""
              )
              .toUpperCase();


          return (
            name === wanted
          );
        }
      );


    if (
      exact &&
      exact.underlying_symbol
    ) {
      return exact;
    }


    /*
     * Second: symbol code.
     */

    const fallback =
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


          return (
            symbol === wanted
          );
        }
      );


    return fallback || null;
  };


  /* =========================================================
     REQUEST ACTIVE SYMBOLS
  ========================================================= */

  const requestActiveSymbols = () => {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }


    const request = {
      active_symbols: "brief",
      req_id: ++state.requestId
    };


    console.log(
      "REQUEST ACTIVE SYMBOLS:",
      request
    );


    setStatus(
      "LOADING MARKETS"
    );


    try {

      state.socket.send(
        JSON.stringify(request)
      );

    } catch (error) {

      console.error(
        "ACTIVE SYMBOL REQUEST FAILED:",
        error
      );


      setStatus(
        "MARKET ERROR"
      );
    }
  };


  /* =========================================================
     FORGET CURRENT TICKS
  ========================================================= */

  const forgetTicks = () => {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }


    try {

      state.socket.send(
        JSON.stringify({
          forget_all: "ticks",
          req_id: ++state.requestId
        })
      );

    } catch (error) {

      console.warn(
        "FORGET TICKS FAILED:",
        error
      );
    }
  };


  /* =========================================================
     SUBSCRIBE MARKET
  ========================================================= */

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
      "DERIV MARKET:",
      state.symbolName,
      "=>",
      state.symbol
    );


    /*
     * Clear old price/chart before
     * subscribing to a new market.
     */

    resetMarketState();


    /*
     * Remove previous tick
     * subscriptions.
     */

    forgetTicks();


    const request = {
      ticks: state.symbol,
      subscribe: 1,
      req_id: ++state.requestId
    };


    console.log(
      "TICK REQUEST:",
      request
    );


    try {

      state.socket.send(
        JSON.stringify(request)
      );


    } catch (error) {

      console.error(
        "TICK SUBSCRIPTION FAILED:",
        error
      );


      setStatus(
        "MARKET ERROR"
      );


      return;
    }


    /*
     * Do not declare LIVE simply
     * because the request was sent.
     *
     * LIVE is confirmed by the
     * first actual tick.
     */

    setStatus(
      "WAITING FOR DATA"
    );
  };


  /* =========================================================
     CHANGE MARKET
  ========================================================= */

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
            button.dataset.name ||
            button.textContent
          );


        button.classList.toggle(
          "active",
          buttonMarket ===
          marketName
        );
      }
    );


    if (
      state.connected &&
      state.activeSymbols.length
    ) {

      subscribeToMarket();

    } else {

      setStatus(
        "CONNECTING"
      );
    }
  };


  /* =========================================================
     MARKET BUTTONS
  ========================================================= */

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
              button.dataset.name ||
              button.textContent
            );
          }
        );
      }
    );
  };


  /* =========================================================
     TIMEFRAMES
  ========================================================= */

  const setupTimeframes = () => {

    all(
      "[data-timeframe]"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const timeframe =
              button.dataset.timeframe ||
              "1m";


            state.timeframe =
              timeframe;


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


            updateChart();


            console.log(
              "TIMEFRAME:",
              timeframe
            );
          }
        );
      }
    );
  };


  /* =========================================================
     SESSION
  ========================================================= */

  const checkSession = async () => {

    try {

      const response =
        await fetch(
          "/api/session",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store"
          }
        );


      if (!response.ok) {

        throw new Error(
          `Session request failed: ${response.status}`
        );
      }


      const data =
        await response.json();


      console.log(
        "SESSION:",
        data
      );


      if (
        data &&
        data.authenticated === true
      ) {

        state.authenticated =
          true;


        state.sessionExpiresAt =
          data.expiresAt || null;


        setAccountStatus(
          "CONNECTED"
        );


        enableAuthenticatedUI();


        setTradeMessage(
          "ACCOUNT CONNECTED"
        );


        return true;
      }


      state.authenticated =
        false;


      state.sessionExpiresAt =
        null;


      setAccountStatus(
        "NOT CONNECTED"
      );


      disableAuthenticatedUI();


      return false;

    } catch (error) {

      console.error(
        "SESSION ERROR:",
        error
      );


      state.authenticated =
        false;


      setAccountStatus(
        "NOT CONNECTED"
      );


      disableAuthenticatedUI();


      return false;
    }
  };


  /* =========================================================
     ACCOUNT UI
  ========================================================= */

  const enableAuthenticatedUI = () => {

    const buy =
      one("#buy-button");


    const sell =
      one("#sell-button");


    if (buy) {
      buy.disabled = false;
    }


    if (sell) {
      sell.disabled = false;
    }


    setAll(
      "[data-account-status]",
      "CONNECTED"
    );
  };


  const disableAuthenticatedUI = () => {

    const buy =
      one("#buy-button");


    const sell =
      one("#sell-button");


    /*
     * Keep the buttons clickable so
     * they can redirect the user to
     * login.
     */

    if (buy) {
      buy.disabled = false;
    }


    if (sell) {
      sell.disabled = false;
    }


    setAll(
      "[data-account-status]",
      "NOT CONNECTED"
    );
  };


  /* =========================================================
     TRADE MESSAGE
  ========================================================= */

  const setTradeMessage = (
    message
  ) => {

    const element =
      one("[data-trade-message]");


    if (element) {
      element.textContent =
        message;
    }
  };


  /* =========================================================
     LOGIN
  ========================================================= */

  const goToLogin = () => {

    console.log(
      "OPENING DERIV LOGIN"
    );


    window.location.href =
      "/api/deriv/login";
  };


  /* =========================================================
     ACCOUNT LINKS
  ========================================================= */

  const setupAccountLinks = () => {

    all(
      'a[href="/api/deriv/login"]'
    ).forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "DERIV LOGIN CLICKED"
            );
          }
        );
      }
    );


    all(
      'a[href="/api/deriv/signup"]'
    ).forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "DERIV ACCOUNT CREATION CLICKED"
            );
          }
        );
      }
    );
  };


  /* =========================================================
     TRADING BUTTONS
  ========================================================= */

  const setupTradingButtons = () => {

    const buy =
      one("#buy-button");


    const sell =
      one("#sell-button");


    const stake =
      one("#stake");


    const contract =
      one("#contract-type");


    if (buy) {

      buy.addEventListener(
        "click",
        () => {

          if (
            !state.authenticated
          ) {

            setTradeMessage(
              "LOGIN REQUIRED"
            );


            goToLogin();


            return;
          }


          handleTradeAttempt(
            "BUY",
            stake,
            contract
          );
        }
      );
    }


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          if (
            !state.authenticated
          ) {

            setTradeMessage(
              "LOGIN REQUIRED"
            );


            goToLogin();


            return;
          }


          handleTradeAttempt(
            "SELL",
            stake,
            contract
          );
        }
      );
    }
  };


  /* =========================================================
     TRADE ATTEMPT
  ========================================================= */

  const handleTradeAttempt = (
    side,
    stakeInput,
    contractInput
  ) => {

    const stakeValue =
      Number(
        stakeInput?.value
      );


    const contractType =
      contractInput?.value ||
      "CALL";


    if (
      !Number.isFinite(
        stakeValue
      ) ||
      stakeValue <= 0
    ) {

      setTradeMessage(
        "ENTER A VALID STAKE"
      );


      return;
    }


    if (
      !state.symbol
    ) {

      setTradeMessage(
        "WAIT FOR MARKET DATA"
      );


      return;
    }


    console.log(
      "TRADE REQUEST:",
      {
        side,
        stake: stakeValue,
        contract: contractType,
        symbol: state.symbol
      }
    );


    /*
     * IMPORTANT:
     *
     * Real authenticated order
     * execution must happen through
     * the backend using the secured
     * Deriv session.
     *
     * The browser must NOT receive
     * or expose the OAuth access token.
     */

    setTradeMessage(
      "ORDER CONNECTION NOT ENABLED"
    );
  };


  /* =========================================================
     DERIV MESSAGE HANDLER
  ========================================================= */

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


    /*
     * Log important messages but
     * avoid flooding the console
     * with every tick.
     */

    if (
      data.msg_type !== "tick"
    ) {

      console.log(
        "DERIV:",
        data
      );
    }


    /* =======================================================
       DERIV ERROR
    ======================================================= */

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


      /*
       * If the requested symbol is
       * rejected, don't immediately
       * reconnect in a loop.
       */

      return;
    }


    /* =======================================================
       ACTIVE SYMBOLS
    ======================================================= */

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
        "ACTIVE SYMBOLS:",
        symbols.length
      );


      const forex =
        symbols.filter(
          (item) =>
            item.market ===
            "forex"
        );


      console.log(
        "FOREX MARKETS:",
        forex.length
      );


      if (
        !symbols.length
      ) {

        setStatus(
          "NO MARKETS RETURNED"
        );


        return;
      }


      subscribeToMarket();


      return;
    }


    /* =======================================================
       FORGET ALL RESPONSE
    ======================================================= */

    if (
      data.msg_type ===
      "forget_all"
    ) {

      /*
       * Nothing else required.
       *
       * The new tick subscription
       * has already been sent.
       */

      return;
    }


    /* =======================================================
       TICK
    ======================================================= */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const tick =
        data.tick;


      /*
       * Ignore ticks from another
       * symbol.
       */

      if (
        state.symbol &&
        tick.symbol &&
        tick.symbol !==
        state.symbol
      ) {

        console.warn(
          "IGNORING OTHER SYMBOL:",
          tick.symbol
        );


        return;
      }


      if (
        tick.quote !== undefined
      ) {

        /*
         * First valid quote confirms
         * that the market is actually
         * LIVE.
         */

        if (
          state.connected
        ) {

          setStatus(
            "LIVE"
          );
        }


        updatePrice(
          tick.quote
        );
      }


      return;
    }


    /* =======================================================
       FALLBACK TICK
    ======================================================= */

    if (
      data.tick &&
      data.tick.quote !== undefined
    ) {

      setStatus(
        "LIVE"
      );


      updatePrice(
        data.tick.quote
      );
    }
  };


  /* =========================================================
     CONNECT TO DERIV
  ========================================================= */

  const connectToDeriv = () => {

    if (
      state.destroyed
    ) {
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
      "DERIV PUBLIC MARKET DATA CONNECTING"
    );


    let socket;


    try {

      socket =
        new WebSocket(
          DERIV_PUBLIC_WS
        );

    } catch (error) {

      console.error(
        "DERIV WEBSOCKET ERROR:",
        error
      );


      state.connected =
        false;


      setStatus(
        "OFFLINE"
      );


      scheduleReconnect();


      return;
    }


    state.socket =
      socket;


    /* =======================================================
       OPEN
    ======================================================= */

    socket.addEventListener(
      "open",
      () => {

        if (
          state.socket !==
          socket
        ) {
          return;
        }


        state.connected =
          true;


        state.reconnectAttempts =
          0;


        console.log(
          "DERIV PUBLIC MARKET DATA CONNECTED"
        );


        requestActiveSymbols();
      }
    );


    /* =======================================================
       MESSAGE
    ======================================================= */

    socket.addEventListener(
      "message",
      handleMessage
    );


    /* =======================================================
       ERROR
    ======================================================= */

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


    /* =======================================================
       CLOSE
    ======================================================= */

    socket.addEventListener(
      "close",
      (event) => {

        console.warn(
          "DERIV CONNECTION CLOSED:",
          event.code,
          event.reason
        );


        if (
          state.socket ===
          socket
        ) {

          state.socket =
            null;
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


  /* =========================================================
     RECONNECT
  ========================================================= */

  const scheduleReconnect = () => {

    if (
      state.destroyed
    ) {
      return;
    }


    if (
      state.reconnectTimer
    ) {
      return;
    }


    state.reconnectAttempts +=
      1;


    const delay =
      Math.min(
        3000 *
        state.reconnectAttempts,
        15000
      );


    console.log(
      "RECONNECTING IN:",
      delay,
      "ms"
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


  /* =========================================================
     OAUTH RESULT
  ========================================================= */

  const handleOAuthResult = () => {

    const params =
      new URLSearchParams(
        window.location.search
      );


    const oauthError =
      params.get(
        "oauth_error"
      );


    if (
      !oauthError
    ) {
      return;
    }


    console.error(
      "OAUTH ERROR:",
      oauthError
    );


    setAccountStatus(
      "AUTHENTICATION FAILED"
    );


    setTradeMessage(
      "DERIV LOGIN FAILED"
    );


    let notice =
      one("#protraders-notice");


    if (!notice) {

      notice =
        document.createElement(
          "div"
        );


      notice.id =
        "protraders-notice";


      document.body.appendChild(
        notice
      );
    }


    notice.textContent =
      "Deriv authentication was not completed. Please try LOGIN again.";


    setTimeout(
      () => {

        if (notice) {
          notice.remove();
        }

      },
      6000
    );


    const cleanUrl =
      window.location.origin +
      window.location.pathname;


    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );
  };


  /* =========================================================
     INITIALISE
  ========================================================= */

  const initialise = async () => {

    state.requestedMarket =
      "EUR/USD";


    state.symbolName =
      "EUR/USD";


    state.timeframe =
      "1m";


    updateMarketDisplay();


    setAll(
      "[data-price]",
      "—"
    );


    setAll(
      "[data-move]",
      "—"
    );


    setStatus(
      "CONNECTING"
    );


    setAccountStatus(
      "CHECKING"
    );


    setupMarketButtons();

    setupTimeframes();

    setupTradingButtons();

    setupAccountLinks();

    handleOAuthResult();


    await checkSession();


    connectToDeriv();
  };


  /* =========================================================
     START
  ========================================================= */

  initialise();


  /* =========================================================
     CLEANUP
  ========================================================= */

  window.addEventListener(
    "beforeunload",
    () => {

      state.destroyed =
        true;


      if (
        state.reconnectTimer
      ) {

        clearTimeout(
          state.reconnectTimer
        );
      }


      if (
        state.socket
      ) {

        try {

          state.socket.close();

        } catch (_) {}
      }
    }
  );
});
