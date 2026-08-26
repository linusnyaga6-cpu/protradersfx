/* =========================================================
   PROTRADERS FX
   LIVE MARKET ENGINE
   ========================================================= */

(() => {
  "use strict";

  /* =======================================================
     CONFIGURATION
  ======================================================= */

  const WS_URL =
    "wss://ws.binaryws.com/websockets/v3";

  const MARKETS = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };

  const DEFAULT_MARKET = "EUR/USD";

  const MAX_POINTS = 160;

  let socket = null;
  let reconnectTimer = null;

  let activeMarket = DEFAULT_MARKET;
  let activeSymbol = MARKETS[DEFAULT_MARKET];

  let previousPrice = null;
  let currentPrice = null;

  let prices = [];

  let requestId = 1;

  let connected = false;

  let reconnectAttempts = 0;

  /* =======================================================
     DOM HELPERS
  ======================================================= */

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));

  function setText(selector, value) {

    $$(selector).forEach((element) => {
      element.textContent = value;
    });

  }

  /* =======================================================
     PRICE FORMATTING
  ======================================================= */

  function getDecimals(symbol, price) {

    if (
      symbol === "frxUSDJPY"
    ) {
      return 3;
    }

    if (
      symbol === "frxEURUSD" ||
      symbol === "frxGBPUSD" ||
      symbol === "frxAUDUSD" ||
      symbol === "frxUSDCAD" ||
      symbol === "frxUSDCHF"
    ) {
      return 5;
    }

    const stringPrice =
      String(price);

    const decimal =
      stringPrice.split(".")[1];

    return decimal
      ? Math.min(decimal.length, 6)
      : 2;

  }


  function formatPrice(price, symbol = activeSymbol) {

    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(Number(price))
    ) {
      return "—";
    }

    const decimals =
      getDecimals(symbol, price);

    return Number(price).toFixed(decimals);

  }


  function formatChange(change) {

    if (
      change === null ||
      change === undefined ||
      !Number.isFinite(Number(change))
    ) {
      return "—";
    }

    const value =
      Number(change);

    const sign =
      value > 0
        ? "+"
        : "";

    return `${sign}${value.toFixed(5)}`;

  }


  /* =======================================================
     CONNECTION STATUS
  ======================================================= */

  function setConnectionStatus(text) {

    setText(
      "[data-market-status]",
      text
    );

  }


  function setLiveState(isLive) {

    $$(".live-badge").forEach((badge) => {

      badge.textContent =
        isLive
          ? "LIVE"
          : "OFFLINE";

    });

  }


  /* =======================================================
     MARKET UI
  ======================================================= */

  function updateMarketName() {

    setText(
      "[data-market]",
      activeMarket
    );

    setText(
      "[data-analysis-market]",
      activeMarket
    );

  }


  function resetMarketData() {

    previousPrice = null;

    currentPrice = null;

    prices = [];

    setText(
      "[data-price]",
      "—"
    );

    setText(
      "[data-move]",
      "—"
    );

    setText(
      "[data-entry]",
      "—"
    );

    setText(
      "[data-stop]",
      "—"
    );

    setText(
      "[data-target]",
      "—"
    );

    setText(
      "[data-momentum]",
      "—"
    );

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
      "[data-ai-bias]",
      "WAIT"
    );

    setText(
      "[data-ai-confidence]",
      "—"
    );

    const message =
      $("#ai-message");

    if (message) {

      message.textContent =
        "Waiting for live market data.";

    }

    updateChart();

  }


  function activateMarketButton() {

    $$(".market-item").forEach((button) => {

      const market =
        button.dataset.symbol;

      button.classList.toggle(
        "active",
        market === activeMarket
      );

    });

  }


  /* =======================================================
     WEBSOCKET
  ======================================================= */

  function connect() {

    if (
      socket &&
      (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    setConnectionStatus(
      "CONNECTING"
    );

    setLiveState(false);

    try {

      socket =
        new WebSocket(WS_URL);

    } catch (error) {

      console.error(
        "WebSocket creation failed:",
        error
      );

      scheduleReconnect();

      return;

    }


    socket.onopen = () => {

      connected = true;

      reconnectAttempts = 0;

      setConnectionStatus(
        "LIVE"
      );

      setLiveState(true);

      subscribeToMarket(
        activeSymbol
      );

      requestHistory(
        activeSymbol
      );

    };


    socket.onmessage = (event) => {

      let data;

      try {

        data =
          JSON.parse(event.data);

      } catch (error) {

        console.error(
          "Invalid WebSocket message:",
          event.data
        );

        return;

      }

      handleMessage(data);

    };


    socket.onerror = (error) => {

      console.error(
        "Deriv WebSocket error:",
        error
      );

      setConnectionStatus(
        "CONNECTION ERROR"
      );

    };


    socket.onclose = () => {

      connected = false;

      setConnectionStatus(
        "RECONNECTING"
      );

      setLiveState(false);

      scheduleReconnect();

    };

  }


  /* =======================================================
     RECONNECT
  ======================================================= */

  function scheduleReconnect() {

    if (reconnectTimer) {
      return;
    }

    reconnectAttempts += 1;

    const delay =
      Math.min(
        1000 * reconnectAttempts,
        10000
      );

    reconnectTimer =
      setTimeout(() => {

        reconnectTimer = null;

        connect();

      }, delay);

  }


  /* =======================================================
     REQUEST ID
  ======================================================= */

  function nextRequestId() {

    requestId += 1;

    return requestId;

  }


  /* =======================================================
     SEND
  ======================================================= */

  function send(payload) {

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    try {

      socket.send(
        JSON.stringify(payload)
      );

      return true;

    } catch (error) {

      console.error(
        "WebSocket send error:",
        error
      );

      return false;

    }

  }


  /* =======================================================
     SUBSCRIBE TO TICKS
  ======================================================= */

  function subscribeToMarket(symbol) {

    if (!symbol) {
      return;
    }

    send({
      ticks: symbol,
      subscribe: 1,
      req_id: nextRequestId()
    });

  }


  /* =======================================================
     HISTORICAL DATA
  ======================================================= */

  function requestHistory(symbol) {

    if (!symbol) {
      return;
    }

    send({
      ticks_history: symbol,
      end: "latest",
      count: 120,
      style: "ticks",
      subscribe: 0,
      req_id: nextRequestId()
    });

  }


  /* =======================================================
     HANDLE DERIV RESPONSE
  ======================================================= */

  function handleMessage(data) {

    if (data.error) {

      console.error(
        "DERIV API ERROR:",
        data.error
      );

      setConnectionStatus(
        data.error.message || "API ERROR"
      );

      return;

    }


    /*
     * LIVE TICK
     */

    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      const quote =
        Number(data.tick.quote);

      if (
        !Number.isFinite(quote)
      ) {
        return;
      }

      handleTick(
        quote,
        data.tick.epoch
      );

      return;

    }


    /*
     * HISTORICAL TICKS
     */

    if (
      data.msg_type === "history" &&
      data.history
    ) {

      const history =
        Array.isArray(
          data.history.prices
        )
          ? data.history.prices
          : [];

      prices =
        history
          .map(Number)
          .filter(
            Number.isFinite
          )
          .slice(-MAX_POINTS);

      if (prices.length) {

        currentPrice =
          prices[prices.length - 1];

        updatePriceDisplay();

        calculateAnalysis();

        updateChart();

      }

      return;

    }


    /*
     * ACTIVE SYMBOL RESPONSE
     */

    if (
      data.msg_type === "active_symbols"
    ) {

      console.log(
        "Active symbols received:",
        data.active_symbols
      );

      return;

    }

  }


  /* =======================================================
     HANDLE TICK
  ======================================================= */

  function handleTick(
    price,
    epoch
  ) {

    previousPrice =
      currentPrice;

    currentPrice =
      price;

    prices.push(price);

    if (
      prices.length > MAX_POINTS
    ) {

      prices.shift();

    }

    updatePriceDisplay();

    calculateAnalysis();

    updateChart();

  }


  /* =======================================================
     PRICE DISPLAY
  ======================================================= */

  function updatePriceDisplay() {

    const formatted =
      formatPrice(
        currentPrice,
        activeSymbol
      );

    setText(
      "[data-price]",
      formatted
    );


    if (
      previousPrice !== null &&
      currentPrice !== null
    ) {

      const change =
        currentPrice -
        previousPrice;

      setText(
        "[data-move]",
        formatChange(change)
      );


      $$(".price-movement").forEach(
        (element) => {

          element.classList.remove(
            "positive",
            "negative"
          );

          if (change > 0) {

            element.classList.add(
              "positive"
            );

          }

          if (change < 0) {

            element.classList.add(
              "negative"
            );

          }

        }
      );

    }

  }


  /* =======================================================
     ANALYSIS ENGINE
  ======================================================= */

  function calculateAnalysis() {

    if (
      prices.length < 5 ||
      currentPrice === null
    ) {
      return;
    }


    const shortWindow =
      prices.slice(-5);

    const mediumWindow =
      prices.slice(-20);


    const shortStart =
      shortWindow[0];

    const shortEnd =
      shortWindow[
        shortWindow.length - 1
      ];


    const mediumStart =
      mediumWindow[0];

    const mediumEnd =
      mediumWindow[
        mediumWindow.length - 1
      ];


    const shortChange =
      shortEnd -
      shortStart;


    const mediumChange =
      mediumEnd -
      mediumStart;


    let direction =
      "WAIT";

    let signal =
      "WAIT";

    let trend =
      "WAIT";

    let bias =
      "WAIT";


    if (
      shortChange > 0 &&
      mediumChange > 0
    ) {

      direction =
        "UP";

      signal =
        "BUY";

      trend =
        "BULLISH";

      bias =
        "BUY";

    } else if (
      shortChange < 0 &&
      mediumChange < 0
    ) {

      direction =
        "DOWN";

      signal =
        "SELL";

      trend =
        "BEARISH";

      bias =
        "SELL";

    }


    const momentum =
      Math.abs(shortChange);


    let confidence = 50;

    if (
      prices.length >= 20
    ) {

      const ratio =
        Math.abs(
          shortChange
        ) /
        (
          Math.abs(
            mediumChange
          ) || 0.0000001
        );

      confidence =
        Math.round(
          Math.min(
            95,
            Math.max(
              50,
              50 + ratio * 20
            )
          )
        );

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
      "[data-ai-bias]",
      bias
    );

    setText(
      "[data-ai-confidence]",
      `${confidence}%`
    );


    setText(
      "[data-momentum]",
      formatPrice(
        momentum,
        activeSymbol
      )
    );


    calculateLevels(
      signal
    );


    updateSignalClasses(
      signal
    );


    updateAnalysisMessage(
      signal,
      confidence
    );

  }


  /* =======================================================
     TRADE LEVELS
  ======================================================= */

  function calculateLevels(
    signal
  ) {

    if (
      currentPrice === null
    ) {
      return;
    }


    /*
     * Approximate short-term levels.
     * These are displayed as analytical
     * reference levels, not guaranteed prices.
     */

    const pip =
      activeSymbol === "frxUSDJPY"
        ? 0.01
        : 0.0001;


    const distance =
      pip * 12;


    let entry =
      currentPrice;

    let stop =
      currentPrice;

    let target =
      currentPrice;


    if (
      signal === "BUY"
    ) {

      stop =
        currentPrice -
        distance;

      target =
        currentPrice +
        distance * 2;

    } else if (
      signal === "SELL"
    ) {

      stop =
        currentPrice +
        distance;

      target =
        currentPrice -
        distance * 2;

    }


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


  /* =======================================================
     SIGNAL CLASSES
  ======================================================= */

  function updateSignalClasses(
    signal
  ) {

    $$("[data-signal]").forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (
          signal === "BUY"
        ) {

          element.classList.add(
            "buy"
          );

        } else if (
          signal === "SELL"
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


    $$("[data-direction]").forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (
          signal === "BUY"
        ) {

          element.classList.add(
            "buy"
          );

        } else if (
          signal === "SELL"
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

  }


  /* =======================================================
     ANALYSIS MESSAGE
  ======================================================= */

  function updateAnalysisMessage(
    signal,
    confidence
  ) {

    const message =
      $("#ai-message");

    if (!message) {
      return;
    }


    if (
      signal === "BUY"
    ) {

      message.textContent =
        `Short-term market bias is upward. Current analytical confidence: ${confidence}%.`;

    } else if (
      signal === "SELL"
    ) {

      message.textContent =
        `Short-term market bias is downward. Current analytical confidence: ${confidence}%.`;

    } else {

      message.textContent =
        "Market direction is currently mixed. Waiting for stronger price movement.";

    }

  }


  /* =======================================================
     SVG CHART
  ======================================================= */

  function updateChart() {

    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }


    if (
      prices.length < 2
    ) {

      line.setAttribute(
        "points",
        ""
      );

      return;

    }


    const width =
      1000;

    const height =
      360;

    const padding =
      18;


    const visible =
      prices.slice(-MAX_POINTS);


    let min =
      Math.min(...visible);

    let max =
      Math.max(...visible);


    if (
      min === max
    ) {

      min -= 0.0001;

      max += 0.0001;

    }


    const range =
      max - min;


    const points =
      visible.map(
        (price, index) => {

          const x =
            padding +
            (
              index /
              Math.max(
                visible.length - 1,
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
                price -
                min
              ) /
              range
            ) *
            (
              height -
              padding * 2
            );


          return `${x.toFixed(2)},${y.toFixed(2)}`;

        }
      );


    line.setAttribute(
      "points",
      points.join(" ")
    );


    updateChartAxis(
      min,
      max
    );

  }


  /* =======================================================
     CHART AXIS
  ======================================================= */

  function updateChartAxis(
    min,
    max
  ) {

    const axis =
      $(".chart-axis");

    if (!axis) {
      return;
    }


    const values = [];

    const steps = 5;


    for (
      let i = 0;
      i < steps;
      i++
    ) {

      const value =
        max -
        (
          (max - min) *
          i /
          (steps - 1)
        );

      values.push(
        formatPrice(
          value,
          activeSymbol
        )
      );

    }


    axis.innerHTML =
      values
        .map(
          (value) =>
            `<span>${value}</span>`
        )
        .join("");

  }


  /* =======================================================
     MARKET SWITCHING
  ======================================================= */

  function switchMarket(
    market
  ) {

    if (
      !MARKETS[market]
    ) {
      console.error(
        "Unknown market:",
        market
      );

      return;
    }


    if (
      market === activeMarket
    ) {
      return;
    }


    activeMarket =
      market;

    activeSymbol =
      MARKETS[market];


    updateMarketName();

    activateMarketButton();

    resetMarketData();


    if (
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {

      /*
       * Stop previous subscriptions.
       */

      send({
        forget_all: "ticks",
        req_id: nextRequestId()
      });


      /*
       * Start new market.
       */

      subscribeToMarket(
        activeSymbol
      );

      requestHistory(
        activeSymbol
      );

    } else {

      connect();

    }

  }


  /* =======================================================
     MARKET BUTTON EVENTS
  ======================================================= */

  function setupMarketButtons() {

    $$(".market-item").forEach(
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


  /* =======================================================
     TIMEFRAME BUTTONS
  ======================================================= */

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


  /* =======================================================
     TRADE BUTTONS
  ======================================================= */

  function setupTradeButtons() {

    const buy =
      $("#buy-button");

    const sell =
      $("#sell-button");


    if (buy) {

      buy.addEventListener(
        "click",
        () => {

          const message =
            $("[data-trade-message]");

          if (message) {

            message.textContent =
              "LOGIN REQUIRED TO PLACE A TRADE.";

          }

        }
      );

    }


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          const message =
            $("[data-trade-message]");

          if (message) {

            message.textContent =
              "LOGIN REQUIRED TO PLACE A TRADE.";

          }

        }
      );

    }

  }


  /* =======================================================
     STAKE DISPLAY
  ======================================================= */

  function setupStake() {

    const stake =
      $("#stake");

    const risk =
      $("#risk-stake");


    if (
      !stake ||
      !risk
    ) {
      return;
    }


    stake.addEventListener(
      "input",
      () => {

        const value =
          Number(stake.value);


        risk.textContent =
          Number.isFinite(value)
            ? `${value} USD`
            : "—";

      }
    );

  }


  /* =======================================================
     LOGIN SESSION CHECK
  ======================================================= */

  async function checkSession() {

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
        return;
      }


      const data =
        await response.json();


      if (
        data &&
        data.authenticated
      ) {

        showAuthenticatedUI(
          data
        );

      }

    } catch (error) {

      console.log(
        "Session check unavailable."
      );

    }

  }


  function showAuthenticatedUI(
    data
  ) {

    const loggedOut =
      $("#logged-out-actions");

    const publicNav =
      $("#public-navigation");

    const tradingNav =
      $("#trading-navigation");

    const accountPanel =
      $("#account-panel");


    if (loggedOut) {
      loggedOut.hidden = true;
    }

    if (publicNav) {
      publicNav.hidden = true;
    }

    if (tradingNav) {
      tradingNav.hidden = false;
    }

    if (accountPanel) {
      accountPanel.hidden = false;
    }


    if (
      data &&
      data.account
    ) {

      const id =
        $("#account-id");

      if (id) {
        id.textContent =
          data.account;
      }

    }

  }


  /* =======================================================
     VISIBILITY / TAB SAFETY
  ======================================================= */

  document.addEventListener(
    "visibilitychange",
    () => {

      if (
        document.visibilityState ===
        "visible"
      ) {

        if (
          !socket ||
          socket.readyState !== WebSocket.OPEN
        ) {

          connect();

        }

      }

    }
  );


  /* =======================================================
     INITIALIZE
  ======================================================= */

  function init() {

    console.log(
      "PROTRADERS FX MARKET ENGINE STARTING"
    );


    updateMarketName();

    activateMarketButton();

    setupMarketButtons();

    setupTimeframes();

    setupTradeButtons();

    setupStake();

    checkSession();

    connect();

  }


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
