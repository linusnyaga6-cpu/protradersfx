document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX STARTING");

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

    authenticated: false,
    sessionExpiresAt: null,

    destroyed: false
  };


  /* ============================================================
     DOM
  ============================================================ */

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const one = (selector) =>
    document.querySelector(selector);

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };


  /* ============================================================
     STATUS
  ============================================================ */

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
    console.log("MARKET:", status);
  };


  const setAccountStatus = (status) => {
    setAll("[data-account-status]", status);
    console.log("ACCOUNT:", status);
  };


  /* ============================================================
     MARKETS
  ============================================================ */

  const supportedMarkets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };


  const normaliseMarketName = (value) => {
    if (!value) return "";

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


  /* ============================================================
     PRICE
  ============================================================ */

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


  /* ============================================================
     MARKET DISPLAY
  ============================================================ */

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


  /* ============================================================
     CHART
  ============================================================ */

  const updateChart = () => {
    const line = one("[data-live-line]");

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

    const points =
      values
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


    const axis =
      all(".chart-y-axis span");

    if (axis.length >= 5) {

      const steps = 4;

      axis.forEach(
        (element, index) => {

          const value =
            max -
            (
              (
                max - min
              ) /
              steps
            ) *
            index;

          element.textContent =
            formatPrice(value);
        }
      );
    }
  };


  /* ============================================================
     ANALYSIS
  ============================================================ */

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

      if (
        state.prices.length >= 10
      ) {
        signal = "CALL";
      }
    }


    if (difference < 0) {

      trend = "BEARISH";
      momentum = "NEGATIVE";
      direction = "DOWN";

      if (
        state.prices.length >= 10
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


    all("[data-signal]").forEach(
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


  /* ============================================================
     PRICE UPDATE
  ============================================================ */

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


      all("[data-move]").forEach(
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


  /* ============================================================
     RESET
  ============================================================ */

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
      one("[data-live-line]");

    if (line) {
      line.setAttribute(
        "points",
        ""
      );
    }
  };


  /* ============================================================
     FIND SYMBOL
  ============================================================ */

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


  /* ============================================================
     ACTIVE SYMBOLS
  ============================================================ */

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


    state.socket.send(
      JSON.stringify(request)
    );
  };


  /* ============================================================
     SUBSCRIBE
  ============================================================ */

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
     * Remove existing tick
     * subscriptions.
     */

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


    /*
     * Subscribe using the
     * symbol returned directly
     * by Deriv.
     */

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

      console.log(
        "TICK SUBSCRIPTION SENT:",
        state.symbol
      );

      setStatus(
        "LIVE"
      );

    } catch (error) {

      console.error(
        "TICK SUBSCRIPTION FAILED:",
        error
      );

      setStatus(
        "MARKET ERROR"
      );
    }
  };


  /* ============================================================
     CHANGE MARKET
  ============================================================ */

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


    all("[data-symbol]").forEach(
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


    if (
      state.connected &&
      state.activeSymbols.length
    ) {
      subscribeToMarket();
    }
  };


  /* ============================================================
     MARKET BUTTONS
  ============================================================ */

  const setupMarketButtons = () => {

    all("[data-symbol]").forEach(
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


  /* ============================================================
     TIMEFRAMES
  ============================================================ */

  const setupTimeframes = () => {

    all("[data-timeframe]").forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            all(
              "[data-timeframe]"
            ).forEach(
              (item) =>
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
  };


  /* ============================================================
     SESSION
  ============================================================ */

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


  /* ============================================================
     ACCOUNT UI
  ============================================================ */

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


    if (buy) {
      buy.disabled = false;
    }

    if (sell) {
      sell.disabled = false;
    }
  };


  /* ============================================================
     TRADE MESSAGE
  ============================================================ */

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


  /* ============================================================
     LOGIN
  ============================================================ */

  const goToLogin = () => {

    console.log(
      "OPENING DERIV LOGIN"
    );

    window.location.href =
      "/api/deriv/login";
  };


  /* ============================================================
     ACCOUNT LINKS
  ============================================================ */

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


  /* ============================================================
     TRADING BUTTONS
  ============================================================ */

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

          if (!state.authenticated) {

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

          if (!state.authenticated) {

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


  /* ============================================================
     TRADE ATTEMPT
  ============================================================ */

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


    console.log(
      "TRADE REQUEST READY:",
      {
        side,
        stake: stakeValue,
        contract: contractType,
        symbol: state.symbol
      }
    );


    setTradeMessage(
      "TRADING CONNECTION READY — ORDER API PENDING"
    );
  };


  /* ============================================================
     DERIV MESSAGE
  ============================================================ */

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
     * Show everything except
     * high-frequency ticks.
     */

    if (
      data.msg_type !== "tick"
    ) {

      console.log(
        "DERIV:",
        data
      );
    }


    /* ==========================================================
       ERROR
    ========================================================== */

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


    /* ==========================================================
       ACTIVE SYMBOLS
    ========================================================== */

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
            item.market === "forex"
        );


      console.log(
        "FOREX MARKETS:",
        forex.length
      );


      if (!symbols.length) {

        setStatus(
          "NO MARKETS RETURNED"
        );

        return;
      }


      subscribeToMarket();


      return;
    }


    /* ==========================================================
       TICK
    ========================================================== */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const tick =
        data.tick;


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

        updatePrice(
          tick.quote
        );

        console.log(
          "PRICE:",
          tick.quote
        );
      }


      return;
    }


    /* ==========================================================
       FALLBACK TICK
    ========================================================== */

    if (
      data.tick &&
      data.tick.quote !== undefined
    ) {

      updatePrice(
        data.tick.quote
      );

      console.log(
        "PRICE:",
        data.tick.quote
      );
    }
  };


  /* ============================================================
     CONNECT
  ============================================================ */

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
          "DERIV PUBLIC MARKET DATA CONNECTED"
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


  /* ============================================================
     RECONNECT
  ============================================================ */

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


  /* ============================================================
     OAUTH
  ============================================================ */

  const handleOAuthResult = () => {

    const params =
      new URLSearchParams(
        window.location.search
      );


    const oauthError =
      params.get(
        "oauth_error"
      );


    if (!oauthError) {
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


  /* ============================================================
     INITIALISE
  ============================================================ */

  const initialise = async () => {

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


  /* ============================================================
     START
  ============================================================ */

  initialise();


  /* ============================================================
     CLEANUP
  ============================================================ */

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
