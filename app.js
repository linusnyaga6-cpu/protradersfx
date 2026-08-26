(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  const WS_URL =
    "wss://api.derivws.com/trading/v1/options/ws/public";

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

    requestId: 0,

    destroyed: false
  };


  /* =========================================================
     DOM
  ========================================================= */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    );
  }

  function setText(selector, value) {
    $$(selector).forEach((element) => {
      element.textContent =
        value === null ||
        value === undefined
          ? "—"
          : String(value);
    });
  }


  /* =========================================================
     NUMBER HELPERS
  ========================================================= */

  function toNumber(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }

  function formatPrice(value) {
    const n = toNumber(value);

    if (n === null) {
      return "—";
    }

    return n.toFixed(
      state.decimals
    );
  }


  /* =========================================================
     STATUS
  ========================================================= */

  function setStatus(status) {
    setText(
      "[data-market-status]",
      status
    );
  }


  /* =========================================================
     MARKET NAME
  ========================================================= */

  function updateMarketName() {
    setText(
      "[data-market]",
      state.currentMarket
    );

    setText(
      "[data-analysis-market]",
      state.currentMarket
    );
  }


  /* =========================================================
     PRICE DISPLAY
  ========================================================= */

  function updatePriceDisplay() {
    if (state.price === null) {
      setText(
        "[data-price]",
        "—"
      );

      setText(
        "[data-move]",
        "—"
      );

      return;
    }

    setText(
      "[data-price]",
      formatPrice(state.price)
    );

    if (state.previousPrice === null) {
      setText(
        "[data-move]",
        "—"
      );

      return;
    }

    const difference =
      state.price -
      state.previousPrice;

    $$( "[data-move]" ).forEach(
      (element) => {
        element.textContent =
          (
            difference > 0
              ? "+"
              : ""
          ) +
          difference.toFixed(
            state.decimals
          );

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
      }
    );
  }


  /* =========================================================
     STORE PRICE
  ========================================================= */

  function storePrice(
    price,
    epoch
  ) {
    const value =
      toNumber(price);

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
      Math.floor(
        Date.now() / 1000
      )
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

    updateChartAxis();

    drawChart();
  }


  /* =========================================================
     MARKET ANALYSIS
  ========================================================= */

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
    }

    if (difference < 0) {
      direction =
        "DOWN";
    }

    setText(
      "[data-direction]",
      direction
    );

    setText(
      "[data-trend]",
      direction
    );

    setText(
      "[data-momentum]",
      difference > 0
        ? "POSITIVE"
        : difference < 0
          ? "NEGATIVE"
          : "FLAT"
    );


    /* SIGNAL */

    $$("[data-signal]").forEach(
      (element) => {
        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (
          direction === "UP"
        ) {
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
      }
    );


    /* LEVELS */

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


    /* AI / MARKET VIEW */

    setText(
      "[data-ai-bias]",
      direction
    );

    setText(
      "[data-ai-confidence]",
      state.prices.length >= 5
        ? "LIVE"
        : "—"
    );


    const message =
      $("#ai-message");

    if (message) {
      if (
        direction === "UP"
      ) {
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


  /* =========================================================
     CHART
  ========================================================= */

  function drawChart() {
    const line =
      $("[data-live-line]");

    if (!line) {
      console.warn(
        "PROTRADERS FX: chart line not found"
      );

      return;
    }

    const values =
      state.prices;

    if (
      values.length < 2
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
      20;

    let min =
      Math.min(...values);

    let max =
      Math.max(...values);

    if (
      min === max
    ) {
      min -= 0.0001;
      max += 0.0001;
    }

    const range =
      max - min;

    const points =
      values.map(
        (value, index) => {
          const x =
            padding +
            (
              index /
              (values.length - 1)
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
            x.toFixed(2) +
            "," +
            y.toFixed(2)
          );
        }
      );

    line.setAttribute(
      "points",
      points.join(" ")
    );
  }


  /* =========================================================
     CHART AXIS
  ========================================================= */

  function updateChartAxis() {
    if (
      !state.prices.length
    ) {
      return;
    }

    const min =
      Math.min(
        ...state.prices
      );

    const max =
      Math.max(
        ...state.prices
      );

    const difference =
      max - min;

    const labels =
      $$(".chart-axis span");

    if (!labels.length) {
      return;
    }

    const values = [
      max,

      max -
        difference * 0.25,

      (max + min) / 2,

      min +
        difference * 0.25,

      min
    ];

    labels.forEach(
      (element, index) => {
        element.textContent =
          formatPrice(
            values[index]
          );
      }
    );
  }


  /* =========================================================
     SEND
  ========================================================= */

  function send(payload) {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      console.warn(
        "PROTRADERS FX: socket not open"
      );

      return false;
    }

    try {
      state.socket.send(
        JSON.stringify(
          payload
        )
      );

      console.log(
        "PROTRADERS FX SENT:",
        payload
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


  /* =========================================================
     LIVE TICK SUBSCRIPTION
  ========================================================= */

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
        ++state.requestId
    });
  }


  /* =========================================================
     PROCESS TICK
  ========================================================= */

  function processTick(data) {
    if (!data.tick) {
      return false;
    }

    const tick =
      data.tick;

    console.log(
      "PROTRADERS FX TICK:",
      tick
    );

    const quote =
      toNumber(
        tick.quote
      );

    if (quote === null) {
      console.warn(
        "PROTRADERS FX: invalid tick quote",
        tick
      );

      return false;
    }

    if (
      tick.symbol &&
      tick.symbol !==
        state.currentSymbol
    ) {
      return false;
    }

    storePrice(
      quote,
      tick.epoch
    );

    setStatus(
      "LIVE"
    );

    return true;
  }


  /* =========================================================
     PROCESS SERVER MESSAGE
  ========================================================= */

  function handleMessage(event) {
    console.log(
      "PROTRADERS FX RAW RESPONSE:",
      event.data
    );

    let data;

    try {
      data =
        JSON.parse(
          event.data
        );
    } catch (error) {
      console.error(
        "PROTRADERS FX JSON ERROR:",
        error
      );

      return;
    }


    /* SERVER ERROR */

    if (data.error) {
      console.error(
        "PROTRADERS FX SERVER ERROR:",
        data.error
      );

      setStatus(
        "MARKET ERROR"
      );

      return;
    }


    /* TICK */

    if (
      data.msg_type ===
      "tick"
    ) {
      processTick(
        data
      );

      return;
    }


    /* SUBSCRIPTION */

    if (
      data.msg_type ===
      "tick" &&
      data.subscription
    ) {
      console.log(
        "PROTRADERS FX SUBSCRIPTION ACTIVE:",
        data.subscription
      );

      return;
    }


    console.log(
      "PROTRADERS FX RESPONSE:",
      data
    );
  }


  /* =========================================================
     CONNECT
  ========================================================= */

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


    /* OPEN */

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
         * IMPORTANT:
         *
         * We deliberately do NOT request
         * ticks_history here.
         *
         * This public endpoint is being used
         * only for the live public market stream.
         */

        subscribeTicks();
      };


    /* MESSAGE */

    socket.onmessage =
      handleMessage;


    /* ERROR */

    socket.onerror =
      (error) => {
        console.error(
          "PROTRADERS FX WEBSOCKET ERROR:",
          error
        );
      };


    /* CLOSE */

    socket.onclose =
      (event) => {
        console.warn(
          "PROTRADERS FX WEBSOCKET CLOSED:",
          event.code,
          event.reason || ""
        );

        state.connected =
          false;

        setStatus(
          "RECONNECTING"
        );

        scheduleReconnect();
      };
  }


  /* =========================================================
     RECONNECT
  ========================================================= */

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
      `PROTRADERS FX RECONNECTING IN ${Math.round(
        delay / 1000
      )}s`
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


  /* =========================================================
     CHANGE MARKET
  ========================================================= */

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

    console.log(
      "PROTRADERS FX MARKET CHANGE:",
      marketName
    );

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

    updateChartAxis();

    drawChart();

    setStatus(
      state.connected
        ? "LIVE"
        : "CONNECTING"
    );

    /*
     * Reconnect cleanly for the new market.
     */

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      try {
        state.socket.close();
      } catch (error) {
        console.error(
          error
        );
      }

      setTimeout(
        connect,
        300
      );
    }
  }


  /* =========================================================
     MARKET BUTTONS
  ========================================================= */

  function setupMarketButtons() {
    $$(".market-item").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            $$(".market-item")
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

            changeMarket(
              button.dataset.symbol
            );
          }
        );
      }
    );
  }


  /* =========================================================
     TIMEFRAMES
  ========================================================= */

  function setupTimeframes() {
    $$(".timeframe").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            $$(".timeframe")
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
          }
        );
      }
    );
  }


  /* =========================================================
     TRADE BUTTONS
  ========================================================= */

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


  /* =========================================================
     INITIAL UI
  ========================================================= */

  function initialiseUI() {
    updateMarketName();

    updatePriceDisplay();

    setupMarketButtons();

    setupTimeframes();

    setupTradeButtons();

    setStatus(
      "CONNECTING"
    );
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
