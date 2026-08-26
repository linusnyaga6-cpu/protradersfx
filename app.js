(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /*
  ============================================================
  PROTRADERS FX
  PUBLIC LIVE MARKET ENGINE
  ============================================================
  */

  const state = {
    socket: null,
    connected: false,
    connecting: false,
    reconnectTimer: null,
    reconnectAttempts: 0,

    symbol: "frxEURUSD",
    symbolName: "EUR/USD",

    price: null,
    previousPrice: null,
    openPrice: null,

    prices: [],
    maxPoints: 180,

    lastTickTime: null,

    markets: {
      "EUR/USD": "frxEURUSD",
      "GBP/USD": "frxGBPUSD",
      "USD/JPY": "frxUSDJPY",
      "AUD/USD": "frxAUDUSD",
      "USD/CAD": "frxUSDCAD",
      "USD/CHF": "frxUSDCHF"
    }
  };


  /*
  ============================================================
  DOM HELPERS
  ============================================================
  */

  function all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }


  function first(selector) {
    return document.querySelector(selector);
  }


  function setText(selector, value) {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  }


  /*
  ============================================================
  FORMAT PRICE
  ============================================================
  */

  function formatPrice(price) {

    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(Number(price))
    ) {
      return "—";
    }

    const number = Number(price);

    if (number >= 100) {
      return number.toFixed(3);
    }

    if (number >= 10) {
      return number.toFixed(4);
    }

    return number.toFixed(5);
  }


  /*
  ============================================================
  FORMAT CHANGE
  ============================================================
  */

  function formatChange(current, previous) {

    if (
      current === null ||
      previous === null ||
      !Number.isFinite(Number(current)) ||
      !Number.isFinite(Number(previous))
    ) {
      return "—";
    }

    const change =
      Number(current) - Number(previous);

    const percentage =
      previous !== 0
        ? (change / Number(previous)) * 100
        : 0;

    const sign =
      change > 0
        ? "+"
        : change < 0
          ? ""
          : "";

    return (
      `${sign}${change.toFixed(5)} ` +
      `(${sign}${percentage.toFixed(3)}%)`
    );
  }


  /*
  ============================================================
  CONNECTION STATUS
  ============================================================
  */

  function setConnectionStatus(text, mode) {

    all("[data-market-status]").forEach((element) => {

      element.textContent = text;

      element.classList.remove(
        "connected",
        "connecting",
        "error"
      );

      if (mode) {
        element.classList.add(mode);
      }

    });
  }


  /*
  ============================================================
  UPDATE MARKET NAME
  ============================================================
  */

  function updateMarketName() {

    setText(
      "[data-market]",
      state.symbolName
    );

    setText(
      "[data-analysis-market]",
      state.symbolName
    );

  }


  /*
  ============================================================
  UPDATE PRICE
  ============================================================
  */

  function updatePrice() {

    const price =
      formatPrice(state.price);

    setText(
      "[data-price]",
      price
    );

    const movement =
      formatChange(
        state.price,
        state.previousPrice
      );

    setText(
      "[data-move]",
      movement
    );

    all("[data-move]").forEach((element) => {

      element.classList.remove(
        "positive",
        "negative"
      );

      if (
        state.price !== null &&
        state.previousPrice !== null
      ) {

        if (
          Number(state.price) >
          Number(state.previousPrice)
        ) {
          element.classList.add("positive");
        }

        if (
          Number(state.price) <
          Number(state.previousPrice)
        ) {
          element.classList.add("negative");
        }

      }

    });

  }


  /*
  ============================================================
  CALCULATE MARKET ANALYSIS
  ============================================================
  */

  function updateAnalysis() {

    if (state.prices.length < 5) {

      setText(
        "[data-trend]",
        "WAIT"
      );

      setText(
        "[data-momentum]",
        "—"
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

      return;
    }


    const recent =
      state.prices.slice(-5);

    const firstPrice =
      Number(recent[0]);

    const lastPrice =
      Number(recent[recent.length - 1]);

    const difference =
      lastPrice - firstPrice;


    let direction = "WAIT";
    let trend = "NEUTRAL";
    let momentum = "FLAT";
    let signal = "WAIT";
    let confidence = "—";


    if (difference > 0) {

      direction = "UP";
      trend = "BULLISH";
      momentum = "POSITIVE";
      signal = "BUY";
      confidence = "HIGH";

    } else if (difference < 0) {

      direction = "DOWN";
      trend = "BEARISH";
      momentum = "NEGATIVE";
      signal = "SELL";
      confidence = "HIGH";

    }


    setText(
      "[data-trend]",
      trend
    );

    setText(
      "[data-momentum]",
      momentum
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
      signal
    );

    setText(
      "[data-ai-confidence]",
      confidence
    );


    all("[data-signal]").forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "BUY") {
        element.classList.add("buy");
      }

      if (signal === "SELL") {
        element.classList.add("sell");
      }

      if (signal === "WAIT") {
        element.classList.add("wait");
      }

    });


    all("[data-direction]").forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (direction === "UP") {
        element.classList.add("buy");
      }

      if (direction === "DOWN") {
        element.classList.add("sell");
      }

      if (direction === "WAIT") {
        element.classList.add("wait");
      }

    });


    updateTradeLevels();

  }


  /*
  ============================================================
  TRADE LEVELS
  ============================================================
  */

  function updateTradeLevels() {

    if (
      state.price === null ||
      !Number.isFinite(Number(state.price))
    ) {
      return;
    }


    const price =
      Number(state.price);


    const precision =
      price >= 100
        ? 3
        : price >= 10
          ? 4
          : 5;


    const pip =
      price >= 100
        ? 0.01
        : price >= 10
          ? 0.0001
          : 0.0001;


    let entry =
      price;

    let stop =
      price - (pip * 20);

    let target =
      price + (pip * 40);


    const direction =
      first("[data-direction]")
        ? first("[data-direction]").textContent
        : "WAIT";


    if (direction === "DOWN") {

      stop =
        price + (pip * 20);

      target =
        price - (pip * 40);

    }


    setText(
      "[data-entry]",
      entry.toFixed(precision)
    );

    setText(
      "[data-stop]",
      stop.toFixed(precision)
    );

    setText(
      "[data-target]",
      target.toFixed(precision)
    );


    const message =
      first("#ai-message");

    if (message) {

      if (direction === "UP") {

        message.textContent =
          `${state.symbolName} is showing upward short-term momentum.`;

      } else if (direction === "DOWN") {

        message.textContent =
          `${state.symbolName} is showing downward short-term momentum.`;

      } else {

        message.textContent =
          "Waiting for stronger short-term market movement.";

      }

    }

  }


  /*
  ============================================================
  CHART
  ============================================================
  */

  function drawChart() {

    const svg =
      first(".price-chart");

    if (!svg) {
      return;
    }


    const line =
      svg.querySelector(
        "[data-live-line]"
      );

    if (!line) {
      return;
    }


    if (state.prices.length < 2) {

      line.setAttribute(
        "points",
        ""
      );

      return;
    }


    const values =
      state.prices.slice(-state.maxPoints);


    let min =
      Math.min(...values);

    let max =
      Math.max(...values);


    if (min === max) {

      min -= 0.00001;
      max += 0.00001;

    }


    const width = 1000;
    const height = 360;
    const padding = 12;


    const points =
      values.map((value, index) => {

        const x =
          padding +
          (
            index /
            Math.max(values.length - 1, 1)
          ) *
          (width - padding * 2);


        const y =
          height -
          padding -
          (
            (Number(value) - min) /
            (max - min)
          ) *
          (height - padding * 2);


        return `${x.toFixed(2)},${y.toFixed(2)}`;

      });


    line.setAttribute(
      "points",
      points.join(" ")
    );


    updateChartAxis(
      min,
      max
    );

  }


  /*
  ============================================================
  CHART AXIS
  ============================================================
  */

  function updateChartAxis(min, max) {

    const axis =
      first(".chart-axis");

    if (!axis) {
      return;
    }


    const values = [];


    for (let i = 0; i < 5; i++) {

      const value =
        max -
        (
          (max - min) *
          (i / 4)
        );

      values.push(value);

    }


    const spans =
      axis.querySelectorAll("span");


    spans.forEach(
      (element, index) => {

        if (values[index] !== undefined) {

          element.textContent =
            formatPrice(values[index]);

        }

      }
    );

  }


  /*
  ============================================================
  PROCESS TICK
  ============================================================
  */

  function processTick(message) {

    if (
      !message ||
      !message.tick
    ) {
      return;
    }


    const tick =
      message.tick;


    const quote =
      Number(tick.quote);


    if (
      !Number.isFinite(quote)
    ) {
      return;
    }


    state.previousPrice =
      state.price;


    state.price =
      quote;


    state.lastTickTime =
      Date.now();


    state.prices.push(
      quote
    );


    if (
      state.prices.length >
      state.maxPoints
    ) {

      state.prices.shift();

    }


    if (
      state.openPrice === null
    ) {

      state.openPrice =
        quote;

    }


    updatePrice();

    updateAnalysis();

    drawChart();

  }


  /*
  ============================================================
  SEND
  ============================================================
  */

  function send(data) {

    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }


    try {

      state.socket.send(
        JSON.stringify(data)
      );

      return true;

    } catch (error) {

      console.error(
        "PROTRADERS FX SEND ERROR:",
        error
      );

      return false;

    }

  }


  /*
  ============================================================
  SUBSCRIBE TO MARKET
  ============================================================
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
      state.symbol
    );


    send({
      forget_all: "ticks"
    });


    setTimeout(() => {

      send({
        ticks: state.symbol,
        subscribe: 1
      });

    }, 150);

  }


  /*
  ============================================================
  CONNECT
  ============================================================
  */

  function connect() {

    if (state.connecting) {
      return;
    }


    if (
      state.socket &&
      state.socket.readyState === WebSocket.OPEN
    ) {
      return;
    }


    state.connecting = true;

    setConnectionStatus(
      "CONNECTING",
      "connecting"
    );


    /*
    IMPORTANT:
    Do NOT add an app_id here.

    Deriv's public websocket endpoint can
    provide public tick data without OAuth.
    */


    const websocketUrl =
      "wss://ws.derivws.com/websockets/v3";


    console.log(
      "PROTRADERS FX CONNECTING:",
      websocketUrl
    );


    try {

      state.socket =
        new WebSocket(
          websocketUrl
        );

    } catch (error) {

      console.error(
        "PROTRADERS FX WEBSOCKET CREATE ERROR:",
        error
      );

      state.connecting = false;

      scheduleReconnect();

      return;

    }


    state.socket.onopen =
      () => {

        console.log(
          "PROTRADERS FX MARKET SOCKET CONNECTED"
        );


        state.connected = true;
        state.connecting = false;
        state.reconnectAttempts = 0;


        setConnectionStatus(
          "LIVE",
          "connected"
        );


        subscribe();

      };


    state.socket.onmessage =
      (event) => {

        let message;

        try {

          message =
            JSON.parse(
              event.data
            );

        } catch (error) {

          console.error(
            "PROTRADERS FX INVALID MESSAGE:",
            event.data
          );

          return;

        }


        if (message.error) {

          console.error(
            "DERIV MARKET ERROR:",
            message.error
          );


          /*
          Don't allow one invalid request
          to kill the whole interface.
          */

          setConnectionStatus(
            "MARKET ERROR",
            "error"
          );

          return;

        }


        if (message.tick) {

          setConnectionStatus(
            "LIVE",
            "connected"
          );

          processTick(
            message
          );

        }

      };


    state.socket.onerror =
      (error) => {

        console.error(
          "DERIV WebSocket error:",
          error
        );


        state.connected = false;

        setConnectionStatus(
          "RECONNECTING",
          "error"
        );

      };


    state.socket.onclose =
      (event) => {

        console.log(
          "Deriv WebSocket closed:",
          event.code,
          event.reason || ""
        );


        state.connected = false;
        state.connecting = false;


        setConnectionStatus(
          "RECONNECTING",
          "connecting"
        );


        scheduleReconnect();

      };

  }


  /*
  ============================================================
  RECONNECT
  ============================================================
  */

  function scheduleReconnect() {

    if (state.reconnectTimer) {
      return;
    }


    state.reconnectAttempts++;


    const delay =
      Math.min(
        1000 *
        Math.pow(
          1.5,
          Math.min(
            state.reconnectAttempts,
            8
          )
        ),
        15000
      );


    state.reconnectTimer =
      setTimeout(() => {

        state.reconnectTimer =
          null;

        connect();

      }, delay);

  }


  /*
  ============================================================
  CHANGE MARKET
  ============================================================
  */

  function changeMarket(
    marketName
  ) {

    const symbol =
      state.markets[marketName];


    if (!symbol) {
      return;
    }


    console.log(
      "PROTRADERS FX MARKET CHANGE:",
      marketName,
      symbol
    );


    state.symbolName =
      marketName;

    state.symbol =
      symbol;


    state.price =
      null;

    state.previousPrice =
      null;

    state.openPrice =
      null;

    state.prices =
      [];


    updateMarketName();

    updatePrice();

    updateAnalysis();

    drawChart();


    all(".market-item")
      .forEach((button) => {

        button.classList.toggle(
          "active",
          button.dataset.symbol ===
            marketName
        );

      });


    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {

      subscribe();

    }

  }


  /*
  ============================================================
  MARKET BUTTONS
  ============================================================
  */

  function initializeMarketButtons() {

    all(
      ".market-item"
    ).forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          const market =
            button.dataset.symbol;

          changeMarket(
            market
          );

        }
      );

    });

  }


  /*
  ============================================================
  TIMEFRAME BUTTONS
  ============================================================
  */

  function initializeTimeframes() {

    all(
      ".timeframe"
    ).forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          all(
            ".timeframe"
          ).forEach((item) => {

            item.classList.remove(
              "active"
            );

          });


          button.classList.add(
            "active"
          );


          /*
          Keep the live tick stream running.
          The buttons control how much history
          is displayed rather than reconnecting.
          */

          const value =
            button.textContent
              .trim()
              .toUpperCase();


          if (value === "1M") {
            state.maxPoints = 60;
          }

          if (value === "5M") {
            state.maxPoints = 100;
          }

          if (value === "15M") {
            state.maxPoints = 140;
          }

          if (value === "1H") {
            state.maxPoints = 180;
          }

          if (value === "4H") {
            state.maxPoints = 180;
          }


          drawChart();

        }
      );

    });

  }


  /*
  ============================================================
  LOGIN / TRADING UI
  ============================================================
  */

  function initializeTradingButtons() {

    const buy =
      first("#buy-button");

    const sell =
      first("#sell-button");

    const message =
      first("[data-trade-message]");


    function notAuthenticated() {

      if (message) {

        message.textContent =
          "LOG IN TO TRADE";

      }

    }


    if (buy) {

      buy.addEventListener(
        "click",
        notAuthenticated
      );

    }


    if (sell) {

      sell.addEventListener(
        "click",
        notAuthenticated
      );

    }

  }


  /*
  ============================================================
  SESSION CHECK
  ============================================================
  */

  async function checkSession() {

    try {

      const response =
        await fetch(
          "/api/session",
          {
            method: "GET",
            credentials: "same-origin",
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

        document.body.classList.add(
          "authenticated"
        );


        const publicNavigation =
          first(
            "#public-navigation"
          );

        const tradingNavigation =
          first(
            "#trading-navigation"
          );

        const loggedOut =
          first(
            "#logged-out-actions"
          );

        const accountPanel =
          first(
            "#account-panel"
          );


        if (publicNavigation) {
          publicNavigation.hidden = true;
        }

        if (tradingNavigation) {
          tradingNavigation.hidden = false;
        }

        if (loggedOut) {
          loggedOut.hidden = true;
        }

        if (accountPanel) {
          accountPanel.hidden = false;
        }

      }

    } catch (error) {

      /*
      Session checking must never stop
      public market data.
      */

      console.warn(
        "PROTRADERS FX SESSION CHECK:",
        error
      );

    }

  }


  /*
  ============================================================
  INITIAL UI
  ============================================================
  */

  function initializeUI() {

    updateMarketName();

    updatePrice();

    updateAnalysis();

    initializeMarketButtons();

    initializeTimeframes();

    initializeTradingButtons();

  }


  /*
  ============================================================
  START
  ============================================================
  */

  async function init() {

    console.log(
      "PROTRADERS FX INITIALIZING"
    );


    initializeUI();


    /*
    Public market data starts independently
    of login/OAuth.
    */

    connect();


    /*
    Authentication is optional.
    */

    checkSession();

  }


  /*
  ============================================================
  START AFTER DOM
  ============================================================
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
