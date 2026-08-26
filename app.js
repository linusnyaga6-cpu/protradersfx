(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /* =========================================================
     CONFIG
  ========================================================= */

  const WS_URL =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const SYMBOLS = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };

  const RECONNECT_DELAY = 3000;
  const MAX_POINTS = 80;

  /* =========================================================
     STATE
  ========================================================= */

  const state = {
    socket: null,
    connected: false,
    connecting: false,
    reconnectTimer: null,

    market: "EUR/USD",
    symbol: "frxEURUSD",

    price: null,
    previousPrice: null,

    prices: [],
    timestamps: [],

    requestId: 1,

    decimals: 5,

    lastTickTime: null
  };

  /* =========================================================
     DOM HELPERS
  ========================================================= */

  function all(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    );
  }

  function one(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function safeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }

  /* =========================================================
     PRICE FORMATTING
  ========================================================= */

  function detectDecimals(price) {
    if (!Number.isFinite(price)) {
      return 5;
    }

    if (price >= 100) {
      return 3;
    }

    return 5;
  }

  function formatPrice(price) {
    if (!Number.isFinite(price)) {
      return "—";
    }

    const decimals = detectDecimals(price);

    return price.toFixed(decimals);
  }

  function formatChange(current, previous) {
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous)
    ) {
      return "—";
    }

    const difference = current - previous;

    const percent =
      previous !== 0
        ? (difference / previous) * 100
        : 0;

    const sign =
      difference > 0
        ? "+"
        : difference < 0
          ? ""
          : "";

    return (
      sign +
      difference.toFixed(state.decimals) +
      " (" +
      sign +
      percent.toFixed(3) +
      "%)"
    );
  }

  /* =========================================================
     CONNECTION STATUS
  ========================================================= */

  function setConnectionStatus(text) {
    setText(
      "[data-market-status]",
      text
    );
  }

  function connectionOnline() {
    setConnectionStatus("LIVE");

    all(".live-badge").forEach((el) => {
      el.textContent = "LIVE";
    });
  }

  function connectionOffline() {
    setConnectionStatus("OFFLINE");

    all(".live-badge").forEach((el) => {
      el.textContent = "OFFLINE";
    });
  }

  /* =========================================================
     MARKET UI
  ========================================================= */

  function updateMarketUI() {
    setText(
      "[data-market]",
      state.market
    );

    setText(
      "[data-analysis-market]",
      state.market
    );

    setText(
      "[data-market-status]",
      state.connected
        ? "LIVE"
        : "CONNECTING"
    );

    all(".market-item").forEach((button) => {
      const active =
        button.dataset.symbol === state.market;

      button.classList.toggle(
        "active",
        active
      );
    });
  }

  /* =========================================================
     PRICE UI
  ========================================================= */

  function updatePriceUI() {
    const current =
      state.price;

    const previous =
      state.previousPrice;

    setText(
      "[data-price]",
      formatPrice(current)
    );

    const moveElement =
      one("[data-move]");

    if (!moveElement) {
      return;
    }

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous)
    ) {
      moveElement.textContent = "—";

      moveElement.classList.remove(
        "positive",
        "negative"
      );

      return;
    }

    const difference =
      current - previous;

    moveElement.textContent =
      formatChange(
        current,
        previous
      );

    moveElement.classList.remove(
      "positive",
      "negative"
    );

    if (difference > 0) {
      moveElement.classList.add(
        "positive"
      );
    }

    if (difference < 0) {
      moveElement.classList.add(
        "negative"
      );
    }
  }

  /* =========================================================
     CHART
  ========================================================= */

  function updateChart() {
    const svg =
      one("[data-live-line]");

    if (!svg) {
      return;
    }

    const prices =
      state.prices;

    if (
      prices.length < 2
    ) {
      svg.setAttribute(
        "points",
        ""
      );

      return;
    }

    let min =
      Math.min(...prices);

    let max =
      Math.max(...prices);

    if (min === max) {
      min -= 0.0001;
      max += 0.0001;
    }

    const width = 1000;
    const height = 360;

    const padding = 18;

    const range =
      max - min;

    const points =
      prices.map(
        (price, index) => {

          const x =
            prices.length === 1
              ? width / 2
              : (index /
                  (prices.length - 1)) *
                width;

          const normalized =
            (price - min) /
            range;

          const y =
            height -
            padding -
            normalized *
              (height -
                padding * 2);

          return (
            x.toFixed(2) +
            "," +
            y.toFixed(2)
          );
        }
      );

    svg.setAttribute(
      "points",
      points.join(" ")
    );

    updateChartAxis(
      min,
      max
    );
  }

  function updateChartAxis(min, max) {
    const axes =
      all(".chart-axis span");

    if (!axes.length) {
      return;
    }

    const difference =
      max - min;

    axes.forEach(
      (element, index) => {

        const ratio =
          index /
          Math.max(
            axes.length - 1,
            1
          );

        const value =
          max -
          difference * ratio;

        element.textContent =
          formatPrice(value);
      }
    );
  }

  /* =========================================================
     MARKET ANALYSIS
  ========================================================= */

  function updateAnalysis() {
    const current =
      state.price;

    const previous =
      state.previousPrice;

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous)
    ) {
      setText(
        "[data-trend]",
        "WAIT"
      );

      setText(
        "[data-direction]",
        "WAIT"
      );

      setText(
        "[data-signal]",
        "WAIT"
      );

      setText(
        "[data-momentum]",
        "—"
      );

      setText(
        "[data-ai-bias]",
        "WAIT"
      );

      setText(
        "[data-ai-confidence]",
        "—"
      );

      return;
    }

    const difference =
      current - previous;

    let direction =
      "WAIT";

    let signal =
      "WAIT";

    let trend =
      "NEUTRAL";

    let momentum =
      "NEUTRAL";

    if (difference > 0) {
      direction = "UP";
      signal = "BUY";
      trend = "BULLISH";
      momentum = "POSITIVE";
    }

    if (difference < 0) {
      direction = "DOWN";
      signal = "SELL";
      trend = "BEARISH";
      momentum = "NEGATIVE";
    }

    setText(
      "[data-trend]",
      trend
    );

    setText(
      "[data-direction]",
      direction
    );

    setText(
      "[data-signal]",
      signal
    );

    setText(
      "[data-momentum]",
      momentum
    );

    setText(
      "[data-ai-bias]",
      signal
    );

    setText(
      "[data-ai-confidence]",
      "LIVE"
    );

    all("[data-signal]").forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (signal === "BUY") {
          element.classList.add(
            "buy"
          );
        }

        if (signal === "SELL") {
          element.classList.add(
            "sell"
          );
        }

        if (signal === "WAIT") {
          element.classList.add(
            "wait"
          );
        }
      }
    );

    all("[data-direction]").forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (direction === "UP") {
          element.classList.add(
            "buy"
          );
        }

        if (direction === "DOWN") {
          element.classList.add(
            "sell"
          );
        }

        if (direction === "WAIT") {
          element.classList.add(
            "wait"
          );
        }
      }
    );

    updateTradeLevels();
    updateMarketMessage(
      signal,
      momentum
    );
  }

  /* =========================================================
     TRADE LEVELS
  ========================================================= */

  function updateTradeLevels() {
    const price =
      state.price;

    if (!Number.isFinite(price)) {
      return;
    }

    const step =
      state.market === "USD/JPY"
        ? 0.05
        : 0.0005;

    const entry =
      price;

    const stop =
      price - step;

    const target =
      price + step * 2;

    setText(
      "[data-entry]",
      formatPrice(entry)
    );

    setText(
      "[data-stop]",
      formatPrice(stop)
    );

    setText(
      "[data-target]",
      formatPrice(target)
    );
  }

  function updateMarketMessage(
    signal,
    momentum
  ) {
    const message =
      one("#ai-message");

    if (!message) {
      return;
    }

    if (signal === "BUY") {
      message.textContent =
        "Live market movement is currently positive. Monitor price action before entering a position.";
      return;
    }

    if (signal === "SELL") {
      message.textContent =
        "Live market movement is currently negative. Monitor price action before entering a position.";
      return;
    }

    message.textContent =
      "Waiting for sufficient live market movement.";
  }

  /* =========================================================
     TICK HANDLING
  ========================================================= */

  function handleTick(data) {
    if (
      !data ||
      !data.tick
    ) {
      return;
    }

    const tick =
      data.tick;

    const quote =
      safeNumber(
        tick.quote
      );

    if (!Number.isFinite(quote)) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      quote;

    state.lastTickTime =
      Date.now();

    state.decimals =
      detectDecimals(
        quote
      );

    state.prices.push(
      quote
    );

    state.timestamps.push(
      Date.now()
    );

    if (
      state.prices.length >
      MAX_POINTS
    ) {
      state.prices.shift();
      state.timestamps.shift();
    }

    updatePriceUI();
    updateChart();
    updateAnalysis();

    if (
      state.connected
    ) {
      setConnectionStatus(
        "LIVE"
      );
    }
  }

  /* =========================================================
     SUBSCRIBE
  ========================================================= */

  function subscribe() {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    const requestId =
      state.requestId++;

    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.symbol
    );

    /*
      IMPORTANT:

      Do NOT send product_type here.

      The current public Options WebSocket
      accepts public tick subscriptions without
      authentication.
    */

    const request = {
      ticks: state.symbol,
      subscribe: 1,
      req_id: requestId
    };

    state.socket.send(
      JSON.stringify(
        request
      )
    );
  }

  /* =========================================================
     HISTORICAL DATA
  ========================================================= */

  function requestHistory() {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    /*
      Historical tick request.

      No product_type is sent.
    */

    const request = {
      ticks_history: state.symbol,
      count: 80,
      end: "latest",
      style: "ticks",
      req_id: state.requestId++
    };

    try {
      state.socket.send(
        JSON.stringify(
          request
        )
      );
    } catch (error) {
      console.error(
        "HISTORY REQUEST ERROR:",
        error
      );
    }
  }

  function handleHistory(data) {
    if (
      !data ||
      !data.history
    ) {
      return;
    }

    const history =
      data.history;

    if (
      !Array.isArray(
        history.prices
      )
    ) {
      return;
    }

    const prices =
      history.prices
        .map(safeNumber)
        .filter(
          (value) =>
            Number.isFinite(value)
        );

    if (!prices.length) {
      return;
    }

    state.prices =
      prices.slice(
        -MAX_POINTS
      );

    state.timestamps =
      Array(
        state.prices.length
      ).fill(
        Date.now()
      );

    state.price =
      state.prices[
        state.prices.length - 1
      ];

    if (
      state.prices.length > 1
    ) {
      state.previousPrice =
        state.prices[
          state.prices.length - 2
        ];
    }

    updatePriceUI();
    updateChart();
    updateAnalysis();
  }

  /* =========================================================
     SOCKET MESSAGE
  ========================================================= */

  function handleMessage(event) {
    let data;

    try {
      data =
        JSON.parse(
          event.data
        );
    } catch (error) {
      console.error(
        "DERIV INVALID MESSAGE:",
        event.data
      );

      return;
    }

    if (data.error) {
      console.error(
        "DERIV MARKET ERROR:",
        data.error
      );

      setConnectionStatus(
        "MARKET ERROR"
      );

      return;
    }

    if (
      data.msg_type ===
      "tick"
    ) {
      handleTick(
        data
      );

      return;
    }

    if (
      data.msg_type ===
      "history"
    ) {
      handleHistory(
        data
      );

      return;
    }

    if (
      data.msg_type ===
      "subscription"
    ) {
      console.log(
        "PROTRADERS FX SUBSCRIPTION ACTIVE:",
        data.subscription
      );

      return;
    }
  }

  /* =========================================================
     CONNECT
  ========================================================= */

  function connect() {
    if (
      state.connecting
    ) {
      return;
    }

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      return;
    }

    state.connecting =
      true;

    connectionOffline();

    console.log(
      "PROTRADERS FX CONNECTING:",
      WS_URL
    );

    let socket;

    try {
      socket =
        new WebSocket(
          WS_URL
        );
    } catch (error) {
      console.error(
        "WEBSOCKET CREATE ERROR:",
        error
      );

      state.connecting =
        false;

      scheduleReconnect();

      return;
    }

    state.socket =
      socket;

    socket.onopen =
      () => {

        console.log(
          "PROTRADERS FX MARKET CONNECTION OPEN"
        );

        state.connected =
          true;

        state.connecting =
          false;

        connectionOnline();

        /*
          Load a small historical window first,
          then subscribe to live ticks.
        */

        requestHistory();

        subscribe();
      };

    socket.onmessage =
      handleMessage;

    socket.onerror =
      (error) => {

        console.error(
          "DERIV WebSocket error:",
          error
        );

        setConnectionStatus(
          "CONNECTION ERROR"
        );
      };

    socket.onclose =
      (event) => {

        console.log(
          "PROTRADERS FX MARKET SOCKET CLOSED:",
          event.code,
          event.reason || ""
        );

        state.connected =
          false;

        state.connecting =
          false;

        connectionOffline();

        scheduleReconnect();
      };
  }

  /* =========================================================
     RECONNECT
  ========================================================= */

  function scheduleReconnect() {
    if (
      state.reconnectTimer
    ) {
      return;
    }

    console.log(
      "PROTRADERS FX RECONNECTING IN 3s"
    );

    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;

          connect();

        },
        RECONNECT_DELAY
      );
  }

  /* =========================================================
     MARKET SWITCHING
  ========================================================= */

  function switchMarket(
    market
  ) {
    if (
      !SYMBOLS[market]
    ) {
      return;
    }

    if (
      state.market ===
      market
    ) {
      return;
    }

    console.log(
      "PROTRADERS FX MARKET SWITCH:",
      market
    );

    state.market =
      market;

    state.symbol =
      SYMBOLS[market];

    state.price =
      null;

    state.previousPrice =
      null;

    state.prices =
      [];

    state.timestamps =
      [];

    updateMarketUI();
    updatePriceUI();
    updateAnalysis();

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {

      /*
        Remove previous tick subscription
        before subscribing to the new symbol.
      */

      try {

        state.socket.send(
          JSON.stringify({
            forget_all: "ticks",
            req_id:
              state.requestId++
          })
        );

      } catch (error) {

        console.error(
          "FORGET ERROR:",
          error
        );
      }

      setTimeout(
        () => {

          if (
            state.socket &&
            state.socket.readyState ===
              WebSocket.OPEN
          ) {

            requestHistory();
            subscribe();

          }

        },
        100
      );

    }
  }

  function bindMarketButtons() {
    all(
      ".market-item"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            switchMarket(
              button.dataset.symbol
            );

          }
        );

      }
    );
  }

  /* =========================================================
     TIMEFRAME BUTTONS
  ========================================================= */

  function bindTimeframes() {
    all(
      ".timeframe"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            all(
              ".timeframe"
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
  }

  /* =========================================================
     TRADING BUTTONS
  ========================================================= */

  function bindTradingButtons() {
    const buy =
      one("#buy-button");

    const sell =
      one("#sell-button");

    const message =
      one("[data-trade-message]");

    if (buy) {
      buy.addEventListener(
        "click",
        () => {

          if (message) {
            message.textContent =
              "LOGIN REQUIRED TO PLACE A BUY TRADE";
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
              "LOGIN REQUIRED TO PLACE A SELL TRADE";
          }

          window.location.href =
            "/api/deriv/login";

        }
      );
    }
  }

  /* =========================================================
     STAKE
  ========================================================= */

  function bindStake() {
    const input =
      one("#stake");

    const risk =
      one("#risk-stake");

    if (!input) {
      return;
    }

    input.addEventListener(
      "input",
      () => {

        if (risk) {

          const value =
            Number(
              input.value
            );

          risk.textContent =
            Number.isFinite(
              value
            ) && value > 0
              ? value + " USD"
              : "—";

        }

      }
    );
  }

  /* =========================================================
     INITIAL UI
  ========================================================= */

  function initialiseUI() {
    updateMarketUI();
    updatePriceUI();
    updateAnalysis();

    bindMarketButtons();
    bindTimeframes();
    bindTradingButtons();
    bindStake();
  }

  /* =========================================================
     INIT
  ========================================================= */

  function init() {

    console.log(
      "PROTRADERS FX INITIALIZING"
    );

    initialiseUI();

    connect();
  }

  /* =========================================================
     START
  ========================================================= */

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
