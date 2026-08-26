/*
========================================================
 PROTRADERS FX
 LIVE MARKET ENGINE
========================================================

 Public market data:
 - No OAuth
 - No access token
 - No API token
 - No WebSocket authentication

 OAuth remains handled by:
 /api/deriv/login
 /api/deriv/signup

========================================================
*/

(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");


  /*
  ======================================================
  MARKET CONFIGURATION
  ======================================================
  */

  const MARKETS = {
    "EUR/USD": {
      symbol: "frxEURUSD",
      digits: 5
    },

    "GBP/USD": {
      symbol: "frxGBPUSD",
      digits: 5
    },

    "USD/JPY": {
      symbol: "frxUSDJPY",
      digits: 3
    },

    "AUD/USD": {
      symbol: "frxAUDUSD",
      digits: 5
    },

    "USD/CAD": {
      symbol: "frxUSDCAD",
      digits: 5
    },

    "USD/CHF": {
      symbol: "frxUSDCHF",
      digits: 5
    }
  };


  /*
  ======================================================
  STATE
  ======================================================
  */

  const state = {

    socket: null,

    connected: false,

    connecting: false,

    reconnectTimer: null,

    reconnectAttempts: 0,

    selectedMarket: "EUR/USD",

    selectedSymbol: "frxEURUSD",

    currentPrice: null,

    previousPrice: null,

    firstPrice: null,

    change: 0,

    changePercent: 0,

    lastEpoch: null,

    history: [],

    maxHistory: 180,

    availableSymbols: new Set(),

    subscriptionId: null,

    requestId: 100,

    destroyed: false

  };


  /*
  ======================================================
  DOM HELPERS
  ======================================================
  */

  function all(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    );
  }


  function first(selector) {
    return document.querySelector(selector);
  }


  function setText(selector, value) {

    all(selector).forEach((element) => {

      element.textContent = value;

    });

  }


  function escapeValue(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    return String(value);

  }


  /*
  ======================================================
  PRICE FORMAT
  ======================================================
  */

  function getDigits(market) {

    if (
      MARKETS[market] &&
      Number.isInteger(MARKETS[market].digits)
    ) {

      return MARKETS[market].digits;

    }

    return 5;

  }


  function formatPrice(price, market) {

    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(Number(price))
    ) {

      return "—";

    }

    const digits =
      getDigits(market);

    return Number(price).toFixed(digits);

  }


  function formatChange(change, market) {

    if (
      change === null ||
      change === undefined ||
      !Number.isFinite(Number(change))
    ) {

      return "—";

    }

    const digits =
      getDigits(market);

    const number =
      Number(change);

    const prefix =
      number > 0
        ? "+"
        : "";

    return (
      prefix +
      number.toFixed(digits)
    );

  }


  function formatPercent(value) {

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {

      return "—";

    }

    const number =
      Number(value);

    const prefix =
      number > 0
        ? "+"
        : "";

    return (
      prefix +
      number.toFixed(2) +
      "%"
    );

  }


  /*
  ======================================================
  CONNECTION STATUS
  ======================================================
  */

  function updateConnectionStatus(
    status,
    connected
  ) {

    all("[data-market-status]")
      .forEach((element) => {

        element.textContent =
          status;

        element.classList.toggle(
          "connected",
          Boolean(connected)
        );

        element.classList.toggle(
          "offline",
          !connected
        );

      });

    all(".live-badge")
      .forEach((element) => {

        element.textContent =
          connected
            ? "LIVE"
            : "OFFLINE";

      });

  }


  /*
  ======================================================
  UPDATE MARKET NAME
  ======================================================
  */

  function updateMarketName() {

    const market =
      state.selectedMarket;

    setText(
      "[data-market]",
      market
    );

    setText(
      "[data-analysis-market]",
      market
    );

  }


  /*
  ======================================================
  UPDATE PRICE
  ======================================================
  */

  function updatePriceDisplay() {

    const market =
      state.selectedMarket;

    const price =
      state.currentPrice;

    const previous =
      state.previousPrice;

    setText(
      "[data-price]",
      formatPrice(
        price,
        market
      )
    );


    let movement = 0;

    if (
      price !== null &&
      previous !== null
    ) {

      movement =
        price - previous;

    }


    state.change =
      movement;


    if (
      state.firstPrice !== null &&
      state.firstPrice !== 0 &&
      price !== null
    ) {

      state.changePercent =
        (
          (price - state.firstPrice) /
          state.firstPrice
        ) *
        100;

    } else {

      state.changePercent = 0;

    }


    const movementText =
      movement === 0
        ? "0.00000"
        : formatChange(
            movement,
            market
          );


    const percentText =
      formatPercent(
        state.changePercent
      );


    all("[data-move]")
      .forEach((element) => {

        element.textContent =
          movement === 0
            ? "—"
            : `${movementText} (${percentText})`;

        element.classList.remove(
          "positive",
          "negative"
        );

        if (movement > 0) {

          element.classList.add(
            "positive"
          );

        }

        if (movement < 0) {

          element.classList.add(
            "negative"
          );

        }

      });


    updateAxis();

    updateAnalysis();

    drawChart();

  }


  /*
  ======================================================
  AXIS
  ======================================================
  */

  function updateAxis() {

    const axes =
      all(".chart-axis");

    if (!axes.length) {
      return;
    }


    if (
      state.history.length < 2
    ) {

      axes.forEach((axis) => {

        const labels =
          axis.querySelectorAll("span");

        labels.forEach((label) => {

          label.textContent = "—";

        });

      });

      return;

    }


    const prices =
      state.history
        .map((item) => item.price)
        .filter(Number.isFinite);


    if (!prices.length) {
      return;
    }


    let min =
      Math.min(...prices);

    let max =
      Math.max(...prices);


    if (min === max) {

      const padding =
        Math.abs(min || 1) *
        0.0001;

      min -= padding;
      max += padding;

    }


    const labels = [];


    for (
      let i = 0;
      i < 5;
      i++
    ) {

      const value =
        max -
        (
          (max - min) *
          (i / 4)
        );

      labels.push(
        formatPrice(
          value,
          state.selectedMarket
        )
      );

    }


    axes.forEach((axis) => {

      const spans =
        axis.querySelectorAll("span");

      spans.forEach(
        (span, index) => {

          span.textContent =
            labels[index] ||
            "—";

        }
      );

    });

  }


  /*
  ======================================================
  CHART
  ======================================================
  */

  function drawChart() {

    const svg =
      first("[data-live-line]");

    if (!svg) {
      return;
    }


    if (
      state.history.length < 2
    ) {

      svg.setAttribute(
        "points",
        ""
      );

      return;

    }


    const prices =
      state.history
        .map((item) => item.price)
        .filter(Number.isFinite);


    if (prices.length < 2) {
      return;
    }


    let min =
      Math.min(...prices);

    let max =
      Math.max(...prices);


    if (min === max) {

      const padding =
        Math.abs(min || 1) *
        0.0001;

      min -= padding;
      max += padding;

    }


    const width = 1000;

    const height = 360;

    const points = [];


    prices.forEach(
      (price, index) => {

        const x =
          (
            index /
            Math.max(
              prices.length - 1,
              1
            )
          ) *
          width;


        const normalized =
          (
            price - min
          ) /
          (
            max - min
          );


        const y =
          height -
          (
            normalized *
            (height - 20)
          ) -
          10;


        points.push(
          `${x.toFixed(2)},${y.toFixed(2)}`
        );

      }
    );


    svg.setAttribute(
      "points",
      points.join(" ")
    );


    const latest =
      prices[prices.length - 1];

    const firstPrice =
      prices[0];


    if (
      latest > firstPrice
    ) {

      svg.setAttribute(
        "stroke",
        "#20d88c"
      );

    } else if (
      latest < firstPrice
    ) {

      svg.setAttribute(
        "stroke",
        "#ff6476"
      );

    } else {

      svg.setAttribute(
        "stroke",
        "#d8e0e8"
      );

    }

  }


  /*
  ======================================================
  ANALYSIS ENGINE
  ======================================================
  */

  function updateAnalysis() {

    const prices =
      state.history
        .map((item) => item.price)
        .filter(Number.isFinite);


    if (
      prices.length < 3
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


    const recent =
      prices.slice(
        -20
      );


    const older =
      prices.slice(
        Math.max(
          0,
          prices.length - 40
        ),
        Math.max(
          0,
          prices.length - 20
        )
      );


    const recentAverage =
      recent.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      recent.length;


    const olderAverage =
      older.length
        ? older.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          older.length
        : recentAverage;


    const difference =
      recentAverage -
      olderAverage;


    const latest =
      prices[prices.length - 1];


    const movement =
      latest -
      prices[
        Math.max(
          0,
          prices.length - 10
        )
      ];


    let trend =
      "SIDEWAYS";

    let direction =
      "WAIT";

    let signal =
      "WAIT";

    let bias =
      "WAIT";

    let momentum =
      "NEUTRAL";


    const threshold =
      Math.abs(
        recentAverage
      ) *
      0.00002;


    if (
      difference > threshold
    ) {

      trend =
        "BULLISH";

      direction =
        "UP";

      bias =
        "BUY";

      signal =
        "BUY";

    } else if (
      difference < -threshold
    ) {

      trend =
        "BEARISH";

      direction =
        "DOWN";

      bias =
        "SELL";

      signal =
        "SELL";

    }


    if (
      movement > threshold
    ) {

      momentum =
        "POSITIVE";

    } else if (
      movement < -threshold
    ) {

      momentum =
        "NEGATIVE";

    }


    let confidence =
      Math.min(
        99,
        Math.max(
          45,
          Math.round(
            50 +
            (
              Math.abs(difference) /
              Math.max(
                Math.abs(recentAverage),
                0.000001
              )
            ) *
            10000
          )
        )
      );


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
      bias
    );

    setText(
      "[data-ai-confidence]",
      `${confidence}%`
    );


    all("[data-signal]")
      .forEach((element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );


        if (signal === "BUY") {

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

      });


    all("[data-direction]")
      .forEach((element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );


        if (direction === "UP") {

          element.classList.add(
            "buy"
          );

        } else if (
          direction === "DOWN"
        ) {

          element.classList.add(
            "sell"
          );

        } else {

          element.classList.add(
            "wait"
          );

        }

      });


    updateLevels();

    const message =
      first("#ai-message");

    if (message) {

      if (signal === "BUY") {

        message.textContent =
          `${state.selectedMarket} is showing upward short-term momentum.`;

      } else if (
        signal === "SELL"
      ) {

        message.textContent =
          `${state.selectedMarket} is showing downward short-term momentum.`;

      } else {

        message.textContent =
          `${state.selectedMarket} is moving without a strong short-term direction.`;

      }

    }

  }


  /*
  ======================================================
  TRADE LEVELS
  ======================================================
  */

  function updateLevels() {

    const price =
      state.currentPrice;


    if (
      price === null ||
      !Number.isFinite(price)
    ) {

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

      return;

    }


    const digits =
      getDigits(
        state.selectedMarket
      );


    const movementUnit =
      state.selectedMarket === "USD/JPY"
        ? 0.01
        : 0.0001;


    const risk =
      movementUnit *
      10;


    const reward =
      movementUnit *
      20;


    let direction =
      "WAIT";


    const signal =
      first("[data-signal]");


    if (
      signal &&
      signal.textContent === "BUY"
    ) {

      direction =
        "BUY";

    } else if (
      signal &&
      signal.textContent === "SELL"
    ) {

      direction =
        "SELL";

    }


    let entry =
      price;

    let stop =
      price;

    let target =
      price;


    if (
      direction === "BUY"
    ) {

      stop =
        price -
        risk;

      target =
        price +
        reward;

    } else if (
      direction === "SELL"
    ) {

      stop =
        price +
        risk;

      target =
        price -
        reward;

    }


    setText(
      "[data-entry]",
      entry.toFixed(digits)
    );

    setText(
      "[data-stop]",
      stop.toFixed(digits)
    );

    setText(
      "[data-target]",
      target.toFixed(digits)
    );

  }


  /*
  ======================================================
  RESET MARKET DATA
  ======================================================
  */

  function resetMarketData() {

    state.currentPrice =
      null;

    state.previousPrice =
      null;

    state.firstPrice =
      null;

    state.change =
      0;

    state.changePercent =
      0;

    state.lastEpoch =
      null;

    state.history =
      [];


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

    updateLevels();

  }


  /*
  ======================================================
  SYMBOL VALIDATION
  ======================================================
  */

  function symbolIsAvailable(
    symbol
  ) {

    if (
      state.availableSymbols.size === 0
    ) {

      return true;

    }

    return state.availableSymbols.has(
      symbol
    );

  }


  /*
  ======================================================
  REQUEST ID
  ======================================================
  */

  function nextRequestId() {

    state.requestId += 1;

    return state.requestId;

  }


  /*
  ======================================================
  SEND
  ======================================================
  */

  function send(payload) {

    if (
      !state.socket ||
      state.socket.readyState !== WebSocket.OPEN
    ) {

      return false;

    }


    try {

      state.socket.send(
        JSON.stringify(payload)
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
  ======================================================
  SUBSCRIBE TO MARKET
  ======================================================
  */

  function subscribeToMarket() {

    if (
      !state.connected
    ) {

      return;

    }


    const config =
      MARKETS[
        state.selectedMarket
      ];


    if (!config) {

      console.error(
        "Unknown market:",
        state.selectedMarket
      );

      return;

    }


    const symbol =
      config.symbol;


    if (
      !symbolIsAvailable(symbol)
    ) {

      console.warn(
        "Symbol not reported by active_symbols:",
        symbol
      );

      updateConnectionStatus(
        "MARKET UNAVAILABLE",
        false
      );

      return;

    }


    /*
    Forget previous subscription.
    */

    if (
      state.subscriptionId
    ) {

      send({
        forget:
          state.subscriptionId
      });

      state.subscriptionId =
        null;

    }


    resetMarketData();


    const reqId =
      nextRequestId();


    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.selectedMarket,
      symbol
    );


    send({
      ticks:
        symbol,

      subscribe:
        1,

      req_id:
        reqId
    });

  }


  /*
  ======================================================
  HANDLE ACTIVE SYMBOLS
  ======================================================
  */

  function handleActiveSymbols(
    data
  ) {

    if (
      !Array.isArray(
        data.active_symbols
      )
    ) {

      return;

    }


    state.availableSymbols =
      new Set(
        data.active_symbols
          .map(
            (item) =>
              item &&
              item.symbol
          )
          .filter(Boolean)
      );


    console.log(
      "PROTRADERS FX ACTIVE SYMBOLS:",
      state.availableSymbols.size
    );


    subscribeToMarket();

  }


  /*
  ======================================================
  HANDLE TICK
  ======================================================
  */

  function handleTick(
    data
  ) {

    if (
      !data ||
      !data.tick
    ) {

      return;

    }


    const tick =
      data.tick;


    const price =
      Number(
        tick.quote
      );


    if (
      !Number.isFinite(price)
    ) {

      return;

    }


    /*
    Only process the selected market.
    */

    if (
      tick.symbol !==
      state.selectedSymbol
    ) {

      return;

    }


    const previous =
      state.currentPrice;


    state.previousPrice =
      previous;


    state.currentPrice =
      price;


    state.lastEpoch =
      Number(
        tick.epoch
      ) || null;


    if (
      state.firstPrice === null
    ) {

      state.firstPrice =
        price;

    }


    state.history.push({
      price,
      epoch:
        state.lastEpoch ||
        Date.now() / 1000
    });


    if (
      state.history.length >
      state.maxHistory
    ) {

      state.history.shift();

    }


    updatePriceDisplay();


    updateConnectionStatus(
      "CONNECTED",
      true
    );

  }


  /*
  ======================================================
  HANDLE ERROR
  ======================================================
  */

  function handleDerivError(
    data
  ) {

    console.error(
      "DERIV MARKET ERROR:",
      data
    );


    const message =
      data &&
      data.error &&
      data.error.message
        ? data.error.message
        : "Market data unavailable";


    updateConnectionStatus(
      "MARKET ERROR",
      false
    );


    const status =
      first(
        "[data-market-status]"
      );


    if (status) {

      status.title =
        message;

    }

  }


  /*
  ======================================================
  SOCKET MESSAGE
  ======================================================
  */

  function handleMessage(
    event
  ) {

    let data;


    try {

      data =
        JSON.parse(
          event.data
        );

    } catch (error) {

      console.error(
        "Invalid Deriv message:",
        event.data
      );

      return;

    }


    if (
      data.msg_type ===
      "active_symbols"
    ) {

      handleActiveSymbols(
        data
      );

      return;

    }


    if (
      data.msg_type ===
      "tick"
    ) {

      if (
        data.subscription &&
        data.subscription.id
      ) {

        state.subscriptionId =
          data.subscription.id;

      }


      handleTick(
        data
      );

      return;

    }


    if (
      data.error
    ) {

      handleDerivError(
        data
      );

      return;

    }

  }


  /*
  ======================================================
  CONNECT
  ======================================================
  */

  function connect() {

    if (
      state.destroyed
    ) {

      return;

    }


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


    updateConnectionStatus(
      "CONNECTING",
      false
    );


    /*
    PUBLIC MARKET DATA ENDPOINT.

    IMPORTANT:
    No authorization.
    No token.
    No app ID.
    */

    const url =
      "wss://ws.binaryws.com/websockets/v3";


    console.log(
      "PROTRADERS FX CONNECTING:",
      url
    );


    let socket;


    try {

      socket =
        new WebSocket(
          url
        );

    } catch (error) {

      state.connecting =
        false;

      console.error(
        "PROTRADERS FX CONNECTION ERROR:",
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
          "PROTRADERS FX MARKET SOCKET CONNECTED"
        );


        state.connected =
          true;

        state.connecting =
          false;

        state.reconnectAttempts =
          0;


        updateConnectionStatus(
          "CONNECTED",
          true
        );


        /*
        Request active symbols first.
        */

        send({
          active_symbols:
            "brief",

          product_type:
            "basic",

          req_id:
            nextRequestId()
        });

      };


    socket.onmessage =
      handleMessage;


    socket.onerror =
      (error) => {

        console.error(
          "DERIV WebSocket error:",
          error
        );

        state.connected =
          false;

        state.connecting =
          false;

        updateConnectionStatus(
          "OFFLINE",
          false
        );

      };


    socket.onclose =
      (event) => {

        console.warn(
          "Deriv WebSocket closed:",
          event.code,
          event.reason || ""
        );


        state.connected =
          false;

        state.connecting =
          false;

        state.subscriptionId =
          null;


        updateConnectionStatus(
          "RECONNECTING",
          false
        );


        scheduleReconnect();

      };

  }


  /*
  ======================================================
  RECONNECT
  ======================================================
  */

  function scheduleReconnect() {

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
        30000,
        2000 *
        Math.pow(
          1.5,
          Math.min(
            state.reconnectAttempts - 1,
            6
          )
        )
      );


    console.log(
      `PROTRADERS FX RECONNECTING IN ${Math.round(delay / 1000)}s`
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

  }


  /*
  ======================================================
  MARKET SWITCH
  ======================================================
  */

  function selectMarket(
    market
  ) {

    if (
      !MARKETS[market]
    ) {

      console.warn(
        "Unknown market:",
        market
      );

      return;

    }


    if (
      state.selectedMarket ===
      market &&
      state.selectedSymbol ===
      MARKETS[market].symbol
    ) {

      return;

    }


    console.log(
      "PROTRADERS FX MARKET SWITCH:",
      market
    );


    state.selectedMarket =
      market;


    state.selectedSymbol =
      MARKETS[market].symbol;


    updateMarketName();

    resetMarketData();


    /*
    Update active button.
    */

    all(
      ".market-item"
    )
      .forEach(
        (button) => {

          const buttonMarket =
            button.dataset.symbol;

          button.classList.toggle(
            "active",
            buttonMarket ===
              market
          );

        }
      );


    if (
      state.connected
    ) {

      subscribeToMarket();

    }

  }


  /*
  ======================================================
  MARKET BUTTONS
  ======================================================
  */

  function setupMarketButtons() {

    all(
      ".market-item"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              const market =
                button.dataset.symbol;

              selectMarket(
                market
              );

            }
          );

        }
      );

  }


  /*
  ======================================================
  TIMEFRAME BUTTONS
  ======================================================
  */

  function setupTimeframes() {

    all(
      ".timeframe"
    )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              all(
                ".timeframe"
              )
                .forEach(
                  (item) => {

                    item.classList.remove(
                      "active"
                    );

                  }
                );


              button.classList.add(
                "active"
              );


              /*
              This version keeps the
              live tick stream active.
              */

              drawChart();

            }
          );

        }
      );

  }


  /*
  ======================================================
  TRADE BUTTONS
  ======================================================
  */

  function setupTradeButtons() {

    const buy =
      first("#buy-button");

    const sell =
      first("#sell-button");

    const message =
      first("[data-trade-message]");


    function requireLogin(
      side
    ) {

      if (!message) {
        return;
      }


      message.textContent =
        `${side} ${state.selectedMarket} — LOG IN TO TRADE`;


      message.classList.add(
        "trade-warning"
      );


      setTimeout(
        () => {

          message.classList.remove(
            "trade-warning"
          );

        },
        1200
      );

    }


    if (buy) {

      buy.addEventListener(
        "click",
        () => {

          requireLogin(
            "BUY"
          );

        }
      );

    }


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          requireLogin(
            "SELL"
          );

        }
      );

    }

  }


  /*
  ======================================================
  LOGIN / ACCOUNT UI
  ======================================================
  */

  function setupLoginUI() {

    const loginLinks =
      all(
        'a[href="/api/deriv/login"]'
      );


    loginLinks.forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "PROTRADERS FX LOGIN STARTING"
            );

          }
        );

      }
    );

  }


  /*
  ======================================================
  RESIZE
  ======================================================
  */

  function setupResize() {

    let resizeTimer =
      null;


    window.addEventListener(
      "resize",
      () => {

        clearTimeout(
          resizeTimer
        );


        resizeTimer =
          setTimeout(
            () => {

              drawChart();

            },
            100
          );

      }
    );

  }


  /*
  ======================================================
  PAGE VISIBILITY
  ======================================================
  */

  function setupVisibility() {

    document.addEventListener(
      "visibilitychange",
      () => {

        if (
          document.visibilityState ===
          "visible"
        ) {

          if (
            !state.socket ||
            state.socket.readyState !==
              WebSocket.OPEN
          ) {

            connect();

          }

        }

      }
    );

  }


  /*
  ======================================================
  INIT
  ======================================================
  */

  function init() {

    console.log(
      "PROTRADERS FX INITIALIZING"
    );


    updateMarketName();

    updateConnectionStatus(
      "CONNECTING",
      false
    );


    setupMarketButtons();

    setupTimeframes();

    setupTradeButtons();

    setupLoginUI();

    setupResize();

    setupVisibility();


    /*
    Start PUBLIC market connection.
    */

    connect();

  }


  /*
  ======================================================
  START
  ======================================================
  */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );

  } else {

    init();

  }


})();
