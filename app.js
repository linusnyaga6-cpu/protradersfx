(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /*
  ============================================================
  PROTRADERS FX
  LIVE PUBLIC MARKET ENGINE

  Public market data requires NO login/authentication.

  Login is handled separately by:
    /api/deriv/login

  Signup is handled separately by:
    /api/deriv/signup
  ============================================================
  */

  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const markets = {
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

    maxPoints: 120,

    requestId: 1,

    reconnectDelay: 2000,

    manualClose: false
  };


  /*
  ============================================================
  DOM HELPERS
  ============================================================
  */

  const $ = (selector) =>
    document.querySelector(selector);


  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));


  function setText(selector, value) {
    $$(selector).forEach((element) => {
      element.textContent = value;
    });
  }


  /*
  ============================================================
  FORMAT PRICE
  ============================================================
  */

  function formatPrice(value) {

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return "—";
    }

    const decimals =
      markets[state.market]?.decimals || 5;

    return Number(value).toFixed(decimals);
  }


  /*
  ============================================================
  UPDATE CONNECTION STATUS
  ============================================================
  */

  function updateConnectionStatus(text) {

    $$("[data-market-status]").forEach((element) => {
      element.textContent = text;
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
      state.market
    );

    setText(
      "[data-analysis-market]",
      state.market
    );
  }


  /*
  ============================================================
  PRICE MOVEMENT
  ============================================================
  */

  function updateMovement() {

    if (
      state.price === null ||
      state.previousPrice === null
    ) {
      setText("[data-move]", "—");
      return;
    }


    const difference =
      state.price - state.previousPrice;


    if (difference > 0) {

      setText(
        "[data-move]",
        "▲ +" + formatPrice(difference)
      );

      $$("[data-move]").forEach((element) => {
        element.classList.remove("negative");
        element.classList.add("positive");
      });

    } else if (difference < 0) {

      setText(
        "[data-move]",
        "▼ " + formatPrice(difference)
      );

      $$("[data-move]").forEach((element) => {
        element.classList.remove("positive");
        element.classList.add("negative");
      });

    } else {

      setText(
        "[data-move]",
        "— 0"
      );

    }
  }


  /*
  ============================================================
  CHART
  ============================================================
  */

  function drawChart() {

    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }


    if (state.prices.length < 2) {
      line.setAttribute("points", "");
      return;
    }


    const width = 1000;
    const height = 360;


    const values =
      state.prices.slice(-state.maxPoints);


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


    const points =
      values.map((price, index) => {

        const x =
          (index / (values.length - 1)) *
          width;


        const y =
          height -
          ((price - min) / range) *
          (height - 20) -
          10;


        return `${x.toFixed(2)},${y.toFixed(2)}`;

      }).join(" ");


    line.setAttribute(
      "points",
      points
    );
  }


  /*
  ============================================================
  AXIS
  ============================================================
  */

  function updateAxis() {

    const axes =
      $$(".chart-axis");


    if (!axes.length) {
      return;
    }


    if (!state.prices.length) {

      axes.forEach((axis) => {

        axis.innerHTML = `
          <span>—</span>
          <span>—</span>
          <span>—</span>
          <span>—</span>
          <span>—</span>
        `;

      });

      return;
    }


    const values =
      state.prices.slice(-state.maxPoints);


    const min =
      Math.min(...values);

    const max =
      Math.max(...values);


    const range =
      max - min || 0.00001;


    axes.forEach((axis) => {

      axis.innerHTML = "";


      for (let i = 4; i >= 0; i--) {

        const value =
          min + range * (i / 4);


        const span =
          document.createElement("span");


        span.textContent =
          formatPrice(value);


        axis.appendChild(span);
      }

    });
  }


  /*
  ============================================================
  MARKET ANALYSIS
  ============================================================
  */

  function updateAnalysis() {

    if (state.prices.length < 5) {

      setText("[data-trend]", "WAIT");
      setText("[data-momentum]", "—");
      setText("[data-direction]", "WAIT");
      setText("[data-signal]", "WAIT");
      setText("[data-ai-bias]", "WAIT");
      setText("[data-ai-confidence]", "—");

      return;
    }


    const prices =
      state.prices;


    const recent =
      prices.slice(-5);


    const first =
      recent[0];

    const last =
      recent[recent.length - 1];


    const change =
      last - first;


    let direction =
      "WAIT";


    if (change > 0) {
      direction = "BUY";
    }

    if (change < 0) {
      direction = "SELL";
    }


    const absoluteChange =
      Math.abs(change);


    let momentum =
      "LOW";


    if (absoluteChange > last * 0.00015) {
      momentum = "HIGH";
    } else if (
      absoluteChange > last * 0.00005
    ) {
      momentum = "MEDIUM";
    }


    const signal =
      direction;


    setText(
      "[data-trend]",
      direction
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
      direction
    );


    let confidence =
      Math.min(
        95,
        Math.max(
          50,
          50 +
          Math.round(
            Math.abs(change / last) *
            100000
          )
        )
      );


    setText(
      "[data-ai-confidence]",
      confidence + "%"
    );


    $$("[data-signal]").forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );


      if (signal === "BUY") {
        element.classList.add("buy");
      } else if (signal === "SELL") {
        element.classList.add("sell");
      } else {
        element.classList.add("wait");
      }

    });


    $$("[data-direction]").forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );


      if (direction === "BUY") {
        element.classList.add("buy");
      } else if (direction === "SELL") {
        element.classList.add("sell");
      } else {
        element.classList.add("wait");
      }

    });


    updateLevels();
  }


  /*
  ============================================================
  TRADE LEVELS
  ============================================================
  */

  function updateLevels() {

    if (
      state.price === null ||
      !Number.isFinite(state.price)
    ) {
      return;
    }


    const price =
      state.price;


    const decimals =
      markets[state.market]?.decimals || 5;


    const factor =
      Math.pow(10, decimals);


    const distance =
      state.market === "USD/JPY"
        ? 0.10
        : 0.00050;


    let direction =
      "BUY";


    if (
      state.prices.length >= 5
    ) {

      const recent =
        state.prices.slice(-5);


      if (
        recent[recent.length - 1] <
        recent[0]
      ) {
        direction = "SELL";
      }
    }


    let entry =
      price;


    let stop;
    let target;


    if (direction === "BUY") {

      stop =
        price - distance;

      target =
        price + distance * 2;

    } else {

      stop =
        price + distance;

      target =
        price - distance * 2;

    }


    entry =
      Math.round(entry * factor) / factor;

    stop =
      Math.round(stop * factor) / factor;

    target =
      Math.round(target * factor) / factor;


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


    const aiMessage =
      $("#ai-message");


    if (aiMessage) {

      aiMessage.textContent =
        `${state.market} is currently showing ${direction} short-term momentum.`;

    }
  }


  /*
  ============================================================
  HANDLE TICK
  ============================================================
  */

  function handleTick(message) {

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


    state.prices.push(
      quote
    );


    if (
      state.prices.length >
      state.maxPoints
    ) {

      state.prices.shift();

    }


    setText(
      "[data-price]",
      formatPrice(quote)
    );


    updateMovement();

    updateAxis();

    drawChart();

    updateAnalysis();
  }


  /*
  ============================================================
  SUBSCRIBE TO CURRENT MARKET
  ============================================================
  */

  function subscribe() {

    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }


    const requestId =
      state.requestId++;


    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.market,
      state.symbol
    );


    /*
    Get recent history first.
    */

    state.socket.send(
      JSON.stringify({
        ticks_history: state.symbol,
        count: 100,
        end: "latest",
        style: "ticks",
        req_id: requestId
      })
    );


    /*
    Then subscribe to live ticks.
    */

    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1,
        req_id: state.requestId++
      })
    );
  }


  /*
  ============================================================
  HISTORY
  ============================================================
  */

  function handleHistory(message) {

    if (!message.history) {
      return;
    }


    const prices =
      message.history.prices || [];


    const numeric =
      prices
        .map(Number)
        .filter(Number.isFinite)
        .slice(-state.maxPoints);


    if (!numeric.length) {
      return;
    }


    state.prices =
      numeric;


    state.previousPrice =
      numeric.length > 1
        ? numeric[numeric.length - 2]
        : null;


    state.price =
      numeric[numeric.length - 1];


    setText(
      "[data-price]",
      formatPrice(state.price)
    );


    updateMovement();

    updateAxis();

    drawChart();

    updateAnalysis();
  }


  /*
  ============================================================
  WEBSOCKET
  ============================================================
  */

  function connect() {

    if (
      state.connecting ||
      state.connected
    ) {
      return;
    }


    state.connecting =
      true;


    updateConnectionStatus(
      "CONNECTING"
    );


    console.log(
      "PROTRADERS FX CONNECTING:",
      PUBLIC_WS
    );


    try {

      const socket =
        new WebSocket(
          PUBLIC_WS
        );


      state.socket =
        socket;


      socket.onopen = () => {

        console.log(
          "PROTRADERS FX MARKET CONNECTION ONLINE"
        );


        state.connected =
          true;

        state.connecting =
          false;

        state.reconnectDelay =
          2000;


        updateConnectionStatus(
          "LIVE"
        );


        subscribe();

      };


      socket.onmessage =
        (event) => {

          try {

            const message =
              JSON.parse(
                event.data
              );


            if (
              message.error
            ) {

              console.error(
                "DERIV MARKET ERROR:",
                message.error
              );


              updateConnectionStatus(
                "MARKET ERROR"
              );


              return;
            }


            if (
              message.msg_type ===
              "history"
            ) {

              handleHistory(
                message
              );

            }


            if (
              message.msg_type ===
              "tick"
            ) {

              handleTick(
                message
              );

            }

          } catch (error) {

            console.error(
              "MARKET MESSAGE ERROR:",
              error
            );

          }

        };


      socket.onerror =
        (error) => {

          console.error(
            "DERIV PUBLIC MARKET ERROR:",
            error
          );


          updateConnectionStatus(
            "OFFLINE"
          );

        };


      socket.onclose =
        (event) => {

          console.warn(
            "DERIV MARKET CONNECTION CLOSED:",
            event.code,
            event.reason || ""
          );


          state.connected =
            false;

          state.connecting =
            false;


          updateConnectionStatus(
            "RECONNECTING"
          );


          if (
            !state.manualClose
          ) {

            scheduleReconnect();

          }

        };

    } catch (error) {

      console.error(
        "WEBSOCKET CREATE ERROR:",
        error
      );


      state.connecting =
        false;


      scheduleReconnect();

    }
  }


  /*
  ============================================================
  RECONNECT
  ============================================================
  */

  function scheduleReconnect() {

    if (
      state.reconnectTimer
    ) {
      return;
    }


    const delay =
      state.reconnectDelay;


    console.log(
      `PROTRADERS FX RECONNECTING IN ${delay / 1000}s`
    );


    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;

          connect();

        },
        delay
      );


    state.reconnectDelay =
      Math.min(
        state.reconnectDelay * 2,
        30000
      );
  }


  /*
  ============================================================
  CHANGE MARKET
  ============================================================
  */

  function changeMarket(name) {

    if (
      !markets[name]
    ) {
      console.error(
        "Unknown market:",
        name
      );

      return;
    }


    state.market =
      name;


    state.symbol =
      markets[name].symbol;


    state.price =
      null;


    state.previousPrice =
      null;


    state.prices =
      [];


    updateMarketName();


    setText(
      "[data-price]",
      "—"
    );


    setText(
      "[data-move]",
      "—"
    );


    updateAxis();

    drawChart();

    updateAnalysis();


    $$(".market-item").forEach(
      (button) => {

        button.classList.toggle(
          "active",
          button.dataset.symbol === name
        );

      }
    );


    /*
    If already connected, subscribe
    to the new symbol.
    */

    if (
      state.socket &&
      state.socket.readyState === WebSocket.OPEN
    ) {

      try {

        state.socket.send(
          JSON.stringify({
            forget_all: "ticks"
          })
        );

      } catch (error) {
        console.warn(
          "Unable to clear old subscription",
          error
        );
      }


      subscribe();
    }
  }


  /*
  ============================================================
  MARKET BUTTONS
  ============================================================
  */

  function setupMarketButtons() {

    $$(".market-item").forEach(
      (button) => {

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

      }
    );
  }


  /*
  ============================================================
  TIMEFRAME BUTTONS
  ============================================================
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
  ============================================================
  TRADE BUTTONS
  ============================================================
  */

  function setupTradeButtons() {

    const buy =
      $("#buy-button");


    const sell =
      $("#sell-button");


    const message =
      $("[data-trade-message]");


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
  ============================================================
  INITIAL UI
  ============================================================
  */

  function initializeUI() {

    updateMarketName();

    updateConnectionStatus(
      "CONNECTING"
    );


    setupMarketButtons();

    setupTimeframes();

    setupTradeButtons();


    /*
    Make sure the first market
    is selected.
    */

    changeMarket(
      "EUR/USD"
    );
  }


  /*
  ============================================================
  INITIALIZE
  ============================================================
  */

  function init() {

    console.log(
      "PROTRADERS FX INITIALIZING"
    );


    initializeUI();


    /*
    IMPORTANT:
    This connection is PUBLIC.
    No app_id.
    No authorize.
    No password.
    No token.
    */

    connect();

  }


  /*
  ============================================================
  START
  ============================================================
  */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }

})();
