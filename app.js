/*
========================================================
 PROTRADERS FX
 LIVE MARKET ENGINE
========================================================
*/

(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /*
  ------------------------------------------------------
  CONFIGURATION
  ------------------------------------------------------
  */

  const DERIV_WS =
    "wss://ws.derivws.com/websockets/v3";

  const MARKETS = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };

  /*
  ------------------------------------------------------
  STATE
  ------------------------------------------------------
  */

  const state = {
    socket: null,
    symbol: "EUR/USD",
    derivSymbol: "frxEURUSD",
    price: null,
    previousPrice: null,
    connected: false,
    reconnectTimer: null,
    reconnectDelay: 2000,
    history: [],
    maxHistory: 120,
    manuallyClosed: false
  };

  /*
  ------------------------------------------------------
  DOM HELPERS
  ------------------------------------------------------
  */

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));

  /*
  ------------------------------------------------------
  FORMAT PRICE
  ------------------------------------------------------
  */

  function formatPrice(price, symbol = state.symbol) {
    if (!Number.isFinite(price)) {
      return "—";
    }

    let decimals = 5;

    if (symbol === "USD/JPY") {
      decimals = 3;
    }

    return Number(price).toFixed(decimals);
  }

  /*
  ------------------------------------------------------
  FORMAT CHANGE
  ------------------------------------------------------
  */

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

    return `${sign}${difference.toFixed(5)} (${sign}${percent.toFixed(3)}%)`;
  }

  /*
  ------------------------------------------------------
  CONNECTION STATUS
  ------------------------------------------------------
  */

  function setStatus(text) {
    $$("[data-market-status]").forEach((element) => {
      element.textContent = text;
    });
  }

  /*
  ------------------------------------------------------
  UPDATE MARKET NAME
  ------------------------------------------------------
  */

  function updateMarketName() {
    $$("[data-market]").forEach((element) => {
      element.textContent = state.symbol;
    });

    $$("[data-analysis-market]").forEach((element) => {
      element.textContent = state.symbol;
    });
  }

  /*
  ------------------------------------------------------
  UPDATE PRICE
  ------------------------------------------------------
  */

  function updatePrice() {
    const priceText =
      formatPrice(
        state.price,
        state.symbol
      );

    $$("[data-price]").forEach((element) => {
      element.textContent = priceText;
    });

    const moveElement =
      $("[data-move]");

    if (!moveElement) {
      return;
    }

    if (
      Number.isFinite(state.price) &&
      Number.isFinite(state.previousPrice)
    ) {
      const difference =
        state.price -
        state.previousPrice;

      moveElement.textContent =
        formatChange(
          state.price,
          state.previousPrice
        );

      moveElement.classList.remove(
        "positive",
        "negative"
      );

      if (difference > 0) {
        moveElement.classList.add("positive");
      }

      if (difference < 0) {
        moveElement.classList.add("negative");
      }
    } else {
      moveElement.textContent = "—";
    }
  }

  /*
  ------------------------------------------------------
  UPDATE CHART
  ------------------------------------------------------
  */

  function updateChart() {
    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }

    if (state.history.length < 2) {
      line.setAttribute("points", "");
      return;
    }

    const values =
      state.history.slice();

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const range =
      max - min || 0.00001;

    const points = [];

    const width = 1000;
    const height = 360;

    values.forEach((value, index) => {
      const x =
        (index /
          Math.max(values.length - 1, 1)) *
        width;

      const normalized =
        (value - min) / range;

      const y =
        height -
        normalized * (height - 30) -
        15;

      points.push(
        `${x.toFixed(2)},${y.toFixed(2)}`
      );
    });

    line.setAttribute(
      "points",
      points.join(" ")
    );

    /*
    Update chart axis.
    */

    const axis =
      $(".chart-axis");

    if (axis) {
      const labels =
        Array.from(
          axis.querySelectorAll("span")
        );

      const steps =
        labels.length - 1;

      labels.forEach((label, index) => {
        const value =
          max -
          ((max - min) *
            index) /
            Math.max(steps, 1);

        label.textContent =
          formatPrice(
            value,
            state.symbol
          );
      });
    }
  }

  /*
  ------------------------------------------------------
  SIMPLE MARKET ANALYSIS
  ------------------------------------------------------
  */

  function updateAnalysis() {
    if (state.history.length < 8) {
      setAnalysis(
        "WAIT",
        "WAIT",
        "WAIT",
        "—"
      );

      return;
    }

    const recent =
      state.history.slice(-8);

    const first =
      recent[0];

    const last =
      recent[recent.length - 1];

    const difference =
      last - first;

    let direction = "WAIT";
    let trend = "WAIT";
    let momentum = "NEUTRAL";
    let signal = "WAIT";

    if (difference > 0) {
      direction = "UP";
      trend = "BULLISH";
      momentum = "POSITIVE";
      signal = "BUY";
    } else if (difference < 0) {
      direction = "DOWN";
      trend = "BEARISH";
      momentum = "NEGATIVE";
      signal = "SELL";
    }

    setAnalysis(
      trend,
      momentum,
      direction,
      signal
    );

    updateLevels();
    updateBias(
      signal,
      difference
    );
  }

  /*
  ------------------------------------------------------
  ANALYSIS OUTPUT
  ------------------------------------------------------
  */

  function setAnalysis(
    trend,
    momentum,
    direction,
    signal
  ) {
    $$("[data-trend]").forEach(
      (element) => {
        element.textContent = trend;
      }
    );

    $$("[data-momentum]").forEach(
      (element) => {
        element.textContent = momentum;
      }
    );

    $$("[data-direction]").forEach(
      (element) => {
        element.textContent = direction;
        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (
          direction === "UP"
        ) {
          element.classList.add("buy");
        } else if (
          direction === "DOWN"
        ) {
          element.classList.add("sell");
        } else {
          element.classList.add("wait");
        }
      }
    );

    $$("[data-signal]").forEach(
      (element) => {
        element.textContent = signal;

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (signal === "BUY") {
          element.classList.add("buy");
        } else if (
          signal === "SELL"
        ) {
          element.classList.add("sell");
        } else {
          element.classList.add("wait");
        }
      }
    );
  }

  /*
  ------------------------------------------------------
  TRADE LEVELS
  ------------------------------------------------------
  */

  function updateLevels() {
    if (!Number.isFinite(state.price)) {
      return;
    }

    const price = state.price;

    let distance;

    if (state.symbol === "USD/JPY") {
      distance = 0.08;
    } else {
      distance = 0.0008;
    }

    const entry = price;

    const target =
      price + distance;

    const stop =
      price - distance;

    $$("[data-entry]").forEach(
      (element) => {
        element.textContent =
          formatPrice(
            entry,
            state.symbol
          );
      }
    );

    $$("[data-target]").forEach(
      (element) => {
        element.textContent =
          formatPrice(
            target,
            state.symbol
          );
      }
    );

    $$("[data-stop]").forEach(
      (element) => {
        element.textContent =
          formatPrice(
            stop,
            state.symbol
          );
      }
    );
  }

  /*
  ------------------------------------------------------
  MARKET BIAS
  ------------------------------------------------------
  */

  function updateBias(
    signal,
    difference
  ) {
    let confidence = "LOW";

    const magnitude =
      Math.abs(difference);

    if (magnitude > 0) {
      confidence = "MEDIUM";
    }

    if (
      state.history.length >= 40 &&
      magnitude >
        Math.abs(
          state.history[
            state.history.length - 40
          ] || 0
        ) * 0.00001
    ) {
      confidence = "HIGH";
    }

    $$("[data-ai-bias]").forEach(
      (element) => {
        element.textContent =
          signal;
      }
    );

    $$("[data-ai-confidence]").forEach(
      (element) => {
        element.textContent =
          confidence;
      }
    );

    const message =
      $("#ai-message");

    if (message) {
      if (signal === "BUY") {
        message.textContent =
          `${state.symbol} is showing short-term upward movement.`;
      } else if (
        signal === "SELL"
      ) {
        message.textContent =
          `${state.symbol} is showing short-term downward movement.`;
      } else {
        message.textContent =
          "Waiting for a clearer market direction.";
      }
    }
  }

  /*
  ------------------------------------------------------
  PROCESS TICK
  ------------------------------------------------------
  */

  function processTick(data) {
    if (!data || !data.tick) {
      return;
    }

    const tick =
      data.tick;

    const quote =
      Number(tick.quote);

    if (!Number.isFinite(quote)) {
      return;
    }

    if (
      Number.isFinite(state.price)
    ) {
      state.previousPrice =
        state.price;
    }

    state.price =
      quote;

    state.history.push(quote);

    if (
      state.history.length >
      state.maxHistory
    ) {
      state.history.shift();
    }

    updatePrice();
    updateChart();
    updateAnalysis();
  }

  /*
  ------------------------------------------------------
  SUBSCRIBE TO MARKET
  ------------------------------------------------------
  */

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

    /*
    Cancel previous subscriptions.
    */

    try {
      state.socket.send(
        JSON.stringify({
          forget_all: "ticks"
        })
      );
    } catch (error) {
      console.warn(
        "Unable to clear previous subscription",
        error
      );
    }

    /*
    Reset market data.
    */

    state.price = null;
    state.previousPrice = null;
    state.history = [];

    updatePrice();
    updateChart();

    /*
    Subscribe to selected forex pair.
    */

    state.socket.send(
      JSON.stringify({
        ticks: state.derivSymbol,
        subscribe: 1
      })
    );

    setStatus("LIVE");
  }

  /*
  ------------------------------------------------------
  CONNECT
  ------------------------------------------------------
  */

  function connect() {
    if (
      state.manuallyClosed
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

    clearTimeout(
      state.reconnectTimer
    );

    setStatus("CONNECTING");

    console.log(
      "PROTRADERS FX CONNECTING:",
      DERIV_WS
    );

    let socket;

    try {
      socket =
        new WebSocket(
          DERIV_WS
        );
    } catch (error) {
      console.error(
        "WebSocket creation failed:",
        error
      );

      setStatus("OFFLINE");
      scheduleReconnect();

      return;
    }

    state.socket =
      socket;

    socket.onopen = () => {
      console.log(
        "PROTRADERS FX MARKET CONNECTION OPEN"
      );

      state.connected = true;
      state.reconnectDelay = 2000;

      setStatus("LIVE");

      subscribe();
    };

    socket.onmessage = (event) => {
      let data;

      try {
        data =
          JSON.parse(
            event.data
          );
      } catch (error) {
        console.warn(
          "Invalid Deriv message:",
          event.data
        );

        return;
      }

      /*
      API error.
      */

      if (data.error) {
        console.error(
          "DERIV MARKET ERROR:",
          data.error
        );

        setStatus(
          "MARKET ERROR"
        );

        return;
      }

      /*
      Tick data.
      */

      if (
        data.msg_type === "tick"
      ) {
        processTick(data);
      }
    };

    socket.onerror = (error) => {
      console.error(
        "DERIV WebSocket error:",
        error
      );

      state.connected = false;

      setStatus("OFFLINE");
    };

    socket.onclose = (event) => {
      console.warn(
        "DERIV WebSocket closed:",
        event.code,
        event.reason || ""
      );

      state.connected = false;

      setStatus("RECONNECTING");

      if (
        !state.manuallyClosed
      ) {
        scheduleReconnect();
      }
    };
  }

  /*
  ------------------------------------------------------
  RECONNECT
  ------------------------------------------------------
  */

  function scheduleReconnect() {
    clearTimeout(
      state.reconnectTimer
    );

    const delay =
      state.reconnectDelay;

    console.log(
      `PROTRADERS FX RECONNECTING IN ${delay / 1000}s`
    );

    state.reconnectTimer =
      setTimeout(() => {
        connect();
      }, delay);

    state.reconnectDelay =
      Math.min(
        state.reconnectDelay * 2,
        30000
      );
  }

  /*
  ------------------------------------------------------
  CHANGE MARKET
  ------------------------------------------------------
  */

  function changeMarket(symbol) {
    if (!MARKETS[symbol]) {
      return;
    }

    if (
      symbol === state.symbol
    ) {
      return;
    }

    console.log(
      "PROTRADERS FX MARKET:",
      symbol
    );

    state.symbol =
      symbol;

    state.derivSymbol =
      MARKETS[symbol];

    updateMarketName();

    /*
    Reset analysis.
    */

    state.price = null;
    state.previousPrice = null;
    state.history = [];

    updatePrice();
    updateChart();

    setAnalysis(
      "WAIT",
      "—",
      "WAIT",
      "WAIT"
    );

    updateLevels();

    /*
    Subscribe immediately if connected.
    */

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      subscribe();
    }
  }

  /*
  ------------------------------------------------------
  MARKET BUTTONS
  ------------------------------------------------------
  */

  function setupMarketButtons() {
    $$(".market-item").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const symbol =
              button.dataset.symbol;

            if (!symbol) {
              return;
            }

            $$(".market-item").forEach(
              (item) => {
                item.classList.remove(
                  "active"
                );
              }
            );

            button.classList.add(
              "active"
            );

            changeMarket(
              symbol
            );
          }
        );
      }
    );
  }

  /*
  ------------------------------------------------------
  TIMEFRAME BUTTONS
  ------------------------------------------------------
  */

  function setupTimeframes() {
    $$(".timeframe").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            $$(".timeframe").forEach(
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

  /*
  ------------------------------------------------------
  TRADE BUTTONS
  ------------------------------------------------------
  */

  function setupTradeButtons() {
    const buy =
      $("#buy-button");

    const sell =
      $("#sell-button");

    const message =
      $("[data-trade-message]");

    const account =
      $("#account-select");

    function showLoginMessage() {
      if (!message) {
        return;
      }

      message.textContent =
        "LOG IN TO TRADE";
    }

    if (buy) {
      buy.addEventListener(
        "click",
        () => {
          showLoginMessage();
        }
      );
    }

    if (sell) {
      sell.addEventListener(
        "click",
        () => {
          showLoginMessage();
        }
      );
    }

    if (account) {
      account.addEventListener(
        "change",
        () => {
          if (
            account.value
          ) {
            if (message) {
              message.textContent =
                "ACCOUNT SELECTED";
            }
          }
        }
      );
    }
  }

  /*
  ------------------------------------------------------
  STAKE DISPLAY
  ------------------------------------------------------
  */

  function setupStake() {
    const stake =
      $("#stake");

    const risk =
      $("#risk-stake");

    if (!stake || !risk) {
      return;
    }

    const update =
      () => {
        const value =
          Number(stake.value);

        if (
          Number.isFinite(value)
        ) {
          risk.textContent =
            `${value} USD`;
        }
      };

    stake.addEventListener(
      "input",
      update
    );

    update();
  }

  /*
  ------------------------------------------------------
  INITIAL UI
  ------------------------------------------------------
  */

  function initializeUI() {
    updateMarketName();

    setStatus(
      "CONNECTING"
    );

    updatePrice();

    setAnalysis(
      "WAIT",
      "—",
      "WAIT",
      "WAIT"
    );

    setupMarketButtons();
    setupTimeframes();
    setupTradeButtons();
    setupStake();
  }

  /*
  ------------------------------------------------------
  REMOVE OLD URL ERROR PARAMETERS
  ------------------------------------------------------
  */

  function cleanUrl() {
    try {
      const url =
        new URL(
          window.location.href
        );

      if (
        url.searchParams.has(
          "utm_source"
        )
      ) {
        url.searchParams.delete(
          "utm_source"
        );

        window.history.replaceState(
          {},
          document.title,
          url.pathname +
            (
              url.search
                ? url.search
                : ""
            )
        );
      }
    } catch (_) {}
  }

  /*
  ------------------------------------------------------
  INIT
  ------------------------------------------------------
  */

  function init() {
    console.log(
      "PROTRADERS FX INITIALIZING"
    );

    cleanUrl();
    initializeUI();
    connect();
  }

  /*
  ------------------------------------------------------
  START
  ------------------------------------------------------
  */

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
