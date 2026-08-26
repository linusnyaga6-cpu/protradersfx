(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /*
  ============================================================
  PROTRADERS FX
  PUBLIC MARKET DATA ENGINE
  ============================================================

  This connection is ONLY for public market data.

  It does NOT require:
  - login
  - token
  - app authorization
  - account authentication

  Trading/account authentication remains separate.
  ============================================================
  */

  const WS_URL =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  /*
  ------------------------------------------------------------
  MARKET DEFINITIONS
  ------------------------------------------------------------
  */

  const MARKETS = {
    "EUR/USD": {
      symbol: "frxEURUSD",
      decimals: 5
    },

    "GBP/USD": {
      symbol: "frxGBPUSD",
      decimals: 5
    },

    "USD/JPY": {
      symbol: "frxUSDJPY",
      decimals: 3
    },

    "AUD/USD": {
      symbol: "frxAUDUSD",
      decimals: 5
    },

    "USD/CAD": {
      symbol: "frxUSDCAD",
      decimals: 5
    },

    "USD/CHF": {
      symbol: "frxUSDCHF",
      decimals: 5
    }
  };


  /*
  ------------------------------------------------------------
  STATE
  ------------------------------------------------------------
  */

  const state = {

    socket: null,

    connected: false,

    reconnectTimer: null,

    reconnectDelay: 2000,

    currentMarket: "EUR/USD",

    currentSymbol: "frxEURUSD",

    decimals: 5,

    price: null,

    previousPrice: null,

    prices: [],

    times: [],

    maxPoints: 180,

    subscriptionId: null,

    requestId: 0,

    destroyed: false

  };


  /*
  ------------------------------------------------------------
  HELPERS
  ------------------------------------------------------------
  */

  function nextRequestId() {

    state.requestId += 1;

    return state.requestId;

  }


  function get(selector) {

    return document.querySelector(selector);

  }


  function getAll(selector) {

    return Array.from(
      document.querySelectorAll(selector)
    );

  }


  function text(selector, value) {

    getAll(selector).forEach((element) => {

      element.textContent =
        value == null ? "—" : String(value);

    });

  }


  function number(value) {

    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : null;

  }


  function formatPrice(value) {

    const n = number(value);

    if (n === null) {
      return "—";
    }

    return n.toFixed(state.decimals);

  }


  function formatChange(value) {

    const n = number(value);

    if (n === null) {
      return "—";
    }

    const sign =
      n > 0
        ? "+"
        : n < 0
          ? ""
          : "";

    return sign +
      n.toFixed(state.decimals);

  }


  /*
  ------------------------------------------------------------
  MARKET STATUS
  ------------------------------------------------------------
  */

  function setStatus(value) {

    text(
      "[data-market-status]",
      value
    );

  }


  /*
  ------------------------------------------------------------
  MARKET NAME
  ------------------------------------------------------------
  */

  function updateMarketName() {

    text(
      "[data-market]",
      state.currentMarket
    );

    text(
      "[data-analysis-market]",
      state.currentMarket
    );

  }


  /*
  ------------------------------------------------------------
  PRICE DISPLAY
  ------------------------------------------------------------
  */

  function updatePriceDisplay() {

    const price =
      state.price;

    const previous =
      state.previousPrice;


    if (price === null) {

      text(
        "[data-price]",
        "—"
      );

      text(
        "[data-move]",
        "—"
      );

      return;

    }


    text(
      "[data-price]",
      formatPrice(price)
    );


    if (previous === null) {

      text(
        "[data-move]",
        "—"
      );

      return;

    }


    const difference =
      price - previous;


    const movement =
      getAll("[data-move]");


    movement.forEach((element) => {

      element.textContent =
        formatChange(difference);


      element.classList.remove(
        "positive",
        "negative"
      );


      if (difference > 0) {

        element.classList.add(
          "positive"
        );

      }


      if (difference < 0) {

        element.classList.add(
          "negative"
        );

      }

    });

  }


  /*
  ------------------------------------------------------------
  STORE PRICE
  ------------------------------------------------------------
  */

  function storePrice(price, epoch) {

    const value =
      number(price);

    if (value === null) {
      return;
    }


    state.previousPrice =
      state.price;


    state.price =
      value;


    state.prices.push(
      value
    );


    state.times.push(
      Number(epoch) ||
      Math.floor(Date.now() / 1000)
    );


    if (
      state.prices.length >
      state.maxPoints
    ) {

      state.prices.shift();

    }


    if (
      state.times.length >
      state.maxPoints
    ) {

      state.times.shift();

    }


    updatePriceDisplay();

    updateAnalysis();

    drawChart();

  }


  /*
  ------------------------------------------------------------
  ANALYSIS
  ------------------------------------------------------------
  */

  function updateAnalysis() {

    if (
      state.prices.length < 2
    ) {

      return;

    }


    const latest =
      state.prices[
        state.prices.length - 1
      ];


    const previous =
      state.prices[
        state.prices.length - 2
      ];


    const difference =
      latest - previous;


    let direction =
      "WAIT";


    if (difference > 0) {

      direction =
        "UP";

    } else if (difference < 0) {

      direction =
        "DOWN";

    }


    text(
      "[data-direction]",
      direction
    );


    text(
      "[data-momentum]",
      difference === 0
        ? "FLAT"
        : difference > 0
          ? "POSITIVE"
          : "NEGATIVE"
    );


    text(
      "[data-trend]",
      direction
    );


    const signals =
      getAll("[data-signal]");


    signals.forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );


      if (direction === "UP") {

        element.textContent =
          "BUY";

        element.classList.add(
          "buy"
        );

      } else if (
        direction === "DOWN"
      ) {

        element.textContent =
          "SELL";

        element.classList.add(
          "sell"
        );

      } else {

        element.textContent =
          "WAIT";

        element.classList.add(
          "wait"
        );

      }

    });


    /*
    Simple calculated levels.
    These are visual market levels only.
    */

    const pip =
      Math.pow(
        10,
        -state.decimals
      );


    const entry =
      latest;


    const stop =
      direction === "UP"
        ? latest - pip * 15
        : latest + pip * 15;


    const target =
      direction === "UP"
        ? latest + pip * 25
        : latest - pip * 25;


    text(
      "[data-entry]",
      formatPrice(entry)
    );


    text(
      "[data-stop]",
      formatPrice(stop)
    );


    text(
      "[data-target]",
      formatPrice(target)
    );


    text(
      "[data-ai-bias]",
      direction
    );


    const confidence =
      state.prices.length >= 5
        ? "LIVE"
        : "—";


    text(
      "[data-ai-confidence]",
      confidence
    );


    const message =
      get("#ai-message");


    if (message) {

      if (direction === "UP") {

        message.textContent =
          `${state.currentMarket} is moving higher. Live price is ${formatPrice(latest)}.`;

      } else if (
        direction === "DOWN"
      ) {

        message.textContent =
          `${state.currentMarket} is moving lower. Live price is ${formatPrice(latest)}.`;

      } else {

        message.textContent =
          `${state.currentMarket} is currently flat at ${formatPrice(latest)}.`;

      }

    }

  }


  /*
  ------------------------------------------------------------
  CHART
  ------------------------------------------------------------
  */

  function drawChart() {

    const svg =
      get("[data-live-line]");


    if (!svg) {
      return;
    }


    const values =
      state.prices;


    if (
      values.length < 2
    ) {

      svg.setAttribute(
        "points",
        ""
      );

      return;

    }


    const width =
      1000;


    const height =
      360;


    let min =
      Math.min(...values);


    let max =
      Math.max(...values);


    if (min === max) {

      min -= 0.0001;

      max += 0.0001;

    }


    const range =
      max - min;


    const padding =
      20;


    const points =
      values.map(
        (value, index) => {

          const x =
            values.length === 1
              ? width / 2
              : (
                  index /
                  (values.length - 1)
                ) *
                (
                  width -
                  padding * 2
                ) +
                padding;


          const y =
            height -
            (
              (
                value -
                min
              ) /
              range
            ) *
            (
              height -
              padding * 2
            ) -
            padding
            );


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

  }


  /*
  ------------------------------------------------------------
  CHART AXIS
  ------------------------------------------------------------
  */

  function updateChartAxis() {

    const values =
      state.prices;


    if (!values.length) {
      return;
    }


    const min =
      Math.min(...values);


    const max =
      Math.max(...values);


    const mid =
      (min + max) / 2;


    const labels =
      getAll(".chart-axis span");


    if (!labels.length) {
      return;
    }


    const list = [

      max,

      max - (
        max - min
      ) * 0.25,

      mid,

      min + (
        max - min
      ) * 0.25,

      min

    ];


    labels.forEach(
      (element, index) => {

        element.textContent =
          formatPrice(
            list[index]
          );

      }
    );

  }


  /*
  ------------------------------------------------------------
  SOCKET SEND
  ------------------------------------------------------------
  */

  function send(data) {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
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
  ------------------------------------------------------------
  REQUEST HISTORY
  ------------------------------------------------------------
  */

  function requestHistory() {

    console.log(
      "PROTRADERS FX REQUESTING HISTORY:",
      state.currentSymbol
    );


    send({

      ticks_history:
        state.currentSymbol,

      end:
        "latest",

      count:
        120,

      style:
        "ticks",

      subscribe:
        0,

      req_id:
        nextRequestId()

    });

  }


  /*
  ------------------------------------------------------------
  SUBSCRIBE LIVE TICKS
  ------------------------------------------------------------
  */

  function subscribeTicks() {

    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.currentSymbol
    );


    send({

      ticks:
        state.currentSymbol,

      subscribe:
        1,

      req_id:
        nextRequestId()

    });

  }


  /*
  ------------------------------------------------------------
  PROCESS HISTORY
  ------------------------------------------------------------
  */

  function processHistory(data) {

    const history =
      data.history;


    if (!history) {
      return;
    }


    const prices =
      Array.isArray(
        history.prices
      )
        ? history.prices
        : [];


    const times =
      Array.isArray(
        history.times
      )
        ? history.times
        : [];


    if (!prices.length) {

      console.warn(
        "PROTRADERS FX: NO HISTORY RECEIVED"
      );

      return;

    }


    state.prices =
      prices
        .map(Number)
        .filter(Number.isFinite)
        .slice(-state.maxPoints);


    state.times =
      times
        .map(Number)
        .filter(Number.isFinite)
        .slice(-state.maxPoints);


    state.previousPrice =
      state.prices.length > 1
        ? state.prices[
            state.prices.length - 2
          ]
        : null;


    state.price =
      state.prices[
        state.prices.length - 1
      ];


    updatePriceDisplay();

    updateAnalysis();

    updateChartAxis();

    drawChart();

  }


  /*
  ------------------------------------------------------------
  PROCESS TICK
  ------------------------------------------------------------
  */

  function processTick(data) {

    if (!data.tick) {
      return;
    }


    const tick =
      data.tick;


    const price =
      number(
        tick.quote
      );


    if (price === null) {
      return;
    }


    if (
      tick.symbol &&
      tick.symbol !==
        state.currentSymbol
    ) {

      return;

    }


    storePrice(
      price,
      tick.epoch
    );


    updateChartAxis();

  }


  /*
  ------------------------------------------------------------
  SOCKET MESSAGE
  ------------------------------------------------------------
  */

  function handleMessage(event) {

    let data;


    try {

      data =
        JSON.parse(
          event.data
        );

    } catch (error) {

      console.error(
        "PROTRADERS FX INVALID JSON:",
        error
      );

      return;

    }


    if (
      data.error
    ) {

      console.error(
        "DERIV MARKET ERROR:",
        data.error
      );

      setStatus(
        "MARKET ERROR"
      );

      return;

    }


    if (
      data.msg_type ===
      "history"
    ) {

      console.log(
        "PROTRADERS FX HISTORY RECEIVED"
      );

      processHistory(
        data
      );

      return;

    }


    if (
      data.msg_type ===
      "tick"
    ) {

      processTick(
        data
      );

      setStatus(
        "LIVE"
      );

      return;

    }

  }


  /*
  ------------------------------------------------------------
  CONNECT
  ------------------------------------------------------------
  */

  function connect() {

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


    console.log(
      "PROTRADERS FX CONNECTING:",
      WS_URL
    );


    setStatus(
      "CONNECTING"
    );


    let socket;


    try {

      socket =
        new WebSocket(
          WS_URL
        );

    } catch (error) {

      console.error(
        "PROTRADERS FX SOCKET CREATE ERROR:",
        error
      );

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


        state.reconnectDelay =
          2000;


        setStatus(
          "LIVE"
        );


        /*
        History first.
        */

        requestHistory();


        /*
        Live stream.
        */

        subscribeTicks();

      };


    socket.onmessage =
      handleMessage;


    socket.onerror =
      (error) => {

        console.error(
          "DERIV WebSocket error:",
          error
        );

      };


    socket.onclose =
      (event) => {

        console.warn(
          "DERIV WebSocket closed:",
          event.code,
          event.reason || ""
        );


        state.connected =
          false;


        state.subscriptionId =
          null;


        setStatus(
          "RECONNECTING"
        );


        scheduleReconnect();

      };

  }


  /*
  ------------------------------------------------------------
  RECONNECT
  ------------------------------------------------------------
  */

  function scheduleReconnect() {

    if (
      state.reconnectTimer ||
      state.destroyed
    ) {

      return;

    }


    const delay =
      state.reconnectDelay;


    console.log(
      `PROTRADERS FX RECONNECTING IN ${Math.round(delay / 1000)}s`
    );


    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;


          connect();


          state.reconnectDelay =
            Math.min(
              state.reconnectDelay * 2,
              30000
            );

        },
        delay
      );

  }


  /*
  ------------------------------------------------------------
  CHANGE MARKET
  ------------------------------------------------------------
  */

  function changeMarket(
    marketName
  ) {

    const market =
      MARKETS[marketName];


    if (!market) {

      console.warn(
        "Unknown market:",
        marketName
      );

      return;

    }


    state.currentMarket =
      marketName;


    state.currentSymbol =
      market.symbol;


    state.decimals =
      market.decimals;


    state.price =
      null;


    state.previousPrice =
      null;


    state.prices =
      [];


    state.times =
      [];


    updateMarketName();

    updatePriceDisplay();

    updateAnalysis();

    drawChart();

    updateChartAxis();


    /*
    If socket is already connected,
    start the new market immediately.
    */

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {

      subscribeTicks();

      requestHistory();

    }

  }


  /*
  ------------------------------------------------------------
  MARKET BUTTONS
  ------------------------------------------------------------
  */

  function setupMarketButtons() {

    getAll(
      ".market-item"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const market =
              button.dataset.symbol;


            getAll(
              ".market-item"
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


            changeMarket(
              market
            );

          }
        );

      }
    );

  }


  /*
  ------------------------------------------------------------
  TIMEFRAME BUTTONS
  ------------------------------------------------------------
  */

  function setupTimeframes() {

    getAll(
      ".timeframe"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            getAll(
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


  /*
  ------------------------------------------------------------
  TRADE BUTTONS
  ------------------------------------------------------------
  */

  function setupTradeButtons() {

    const buy =
      get("#buy-button");


    const sell =
      get("#sell-button");


    const message =
      get("[data-trade-message]");


    if (buy) {

      buy.addEventListener(
        "click",
        () => {

          if (message) {

            message.textContent =
              "LOG IN TO TRADE";

          }

        }
      );

    }


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          if (message) {

            message.textContent =
              "LOG IN TO TRADE";

          }

        }
      );

    }

  }


  /*
  ------------------------------------------------------------
  INITIAL UI
  ------------------------------------------------------------
  */

  function initialiseUI() {

    updateMarketName();

    updatePriceDisplay();

    setupMarketButtons();

    setupTimeframes();

    setupTradeButtons();

  }


  /*
  ------------------------------------------------------------
  INIT
  ------------------------------------------------------------
  */

  function init() {

    console.log(
      "PROTRADERS FX INITIALIZING"
    );


    initialiseUI();


    /*
    Connect to public market data.
    */

    connect();

  }


  /*
  ------------------------------------------------------------
  START
  ------------------------------------------------------------
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
