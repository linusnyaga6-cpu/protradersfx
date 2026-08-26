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

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function text(selector, value) {
    $$(selector).forEach((el) => {
      el.textContent =
        value === null || value === undefined
          ? "—"
          : String(value);
    });
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatPrice(value) {
    const n = num(value);

    if (n === null) {
      return "—";
    }

    return n.toFixed(state.decimals);
  }

  function setStatus(value) {
    text("[data-market-status]", value);
  }

  function updateMarketName() {
    text("[data-market]", state.currentMarket);
    text(
      "[data-analysis-market]",
      state.currentMarket
    );
  }

  function updatePriceDisplay() {
    if (state.price === null) {
      text("[data-price]", "—");
      text("[data-move]", "—");
      return;
    }

    text(
      "[data-price]",
      formatPrice(state.price)
    );

    if (state.previousPrice === null) {
      text("[data-move]", "—");
      return;
    }

    const change =
      state.price - state.previousPrice;

    $("[data-move]");

    $$("[data-move]").forEach((el) => {
      el.textContent =
        (change > 0 ? "+" : "") +
        change.toFixed(state.decimals);

      el.classList.remove(
        "positive",
        "negative"
      );

      if (change > 0) {
        el.classList.add("positive");
      }

      if (change < 0) {
        el.classList.add("negative");
      }
    });
  }

  function storePrice(price, epoch) {
    const value = num(price);

    if (value === null) {
      return;
    }

    state.previousPrice = state.price;
    state.price = value;

    state.prices.push(value);

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
    updateChartAxis();
    drawChart();
  }

  function updateAnalysis() {
    if (state.prices.length < 2) {
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

    let direction = "WAIT";

    if (difference > 0) {
      direction = "UP";
    }

    if (difference < 0) {
      direction = "DOWN";
    }

    text(
      "[data-direction]",
      direction
    );

    text(
      "[data-trend]",
      direction
    );

    text(
      "[data-momentum]",
      difference > 0
        ? "POSITIVE"
        : difference < 0
          ? "NEGATIVE"
          : "FLAT"
    );

    $$("[data-signal]").forEach(
      (el) => {
        el.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (direction === "UP") {
          el.textContent = "BUY";
          el.classList.add("buy");
        } else if (
          direction === "DOWN"
        ) {
          el.textContent = "SELL";
          el.classList.add("sell");
        } else {
          el.textContent = "WAIT";
          el.classList.add("wait");
        }
      }
    );

    const pip =
      Math.pow(
        10,
        -state.decimals
      );

    const entry = latest;

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

    text(
      "[data-ai-confidence]",
      state.prices.length >= 5
        ? "LIVE"
        : "—"
    );

    const message =
      $("#ai-message");

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

  function drawChart() {
    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }

    const values = state.prices;

    if (values.length < 2) {
      line.setAttribute(
        "points",
        ""
      );
      return;
    }

    const width = 1000;
    const height = 360;
    const padding = 20;

    let min =
      Math.min(...values);

    let max =
      Math.max(...values);

    if (min === max) {
      min -= 0.0001;
      max += 0.0001;
    }

    const range = max - min;

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

  function updateChartAxis() {
    if (!state.prices.length) {
      return;
    }

    const min =
      Math.min(...state.prices);

    const max =
      Math.max(...state.prices);

    const difference = max - min;

    const labels =
      $$(".chart-axis span");

    const values = [
      max,
      max - difference * 0.25,
      (max + min) / 2,
      min + difference * 0.25,
      min
    ];

    labels.forEach(
      (el, index) => {
        if (values[index] !== undefined) {
          el.textContent =
            formatPrice(values[index]);
        }
      }
    );
  }

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
   * IMPORTANT:
   * The public market endpoint accepts
   * the tick request without the old
   * invalid product_type parameter.
   *
   * We use a single live tick subscription.
   */

  function subscribeMarket() {
    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.currentSymbol
    );

    send({
      ticks: state.currentSymbol,
      subscribe: 1,
      req_id: ++state.requestId
    });
  }

  function requestHistory() {
    console.log(
      "PROTRADERS FX HISTORY:",
      state.currentSymbol
    );

    send({
      ticks_history:
        state.currentSymbol,

      end: "latest",

      count: 120,

      style: "ticks",

      req_id: ++state.requestId
    });
  }

  function processHistory(data) {
    if (!data.history) {
      return;
    }

    const prices =
      Array.isArray(
        data.history.prices
      )
        ? data.history.prices
        : [];

    const times =
      Array.isArray(
        data.history.times
      )
        ? data.history.times
        : [];

    if (!prices.length) {
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

  function processTick(data) {
    if (!data.tick) {
      return;
    }

    const tick = data.tick;

    const price =
      num(tick.quote);

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

    setStatus("LIVE");
  }

  function handleMessage(event) {
    let data;

    try {
      data =
        JSON.parse(event.data);
    } catch (error) {
      console.error(
        "PROTRADERS FX INVALID JSON:",
        error
      );
      return;
    }

    if (data.error) {
      console.error(
        "DERIV MARKET ERROR:",
        data.error
      );

      /*
       * If history is rejected but the live
       * stream is working, do not kill the
       * connection.
       */
      return;
    }

    if (
      data.msg_type ===
      "history"
    ) {
      processHistory(data);
      return;
    }

    if (
      data.msg_type ===
      "tick"
    ) {
      processTick(data);
      return;
    }
  }

  function connect() {
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

    console.log(
      "PROTRADERS FX CONNECTING:",
      WS_URL
    );

    setStatus("CONNECTING");

    let socket;

    try {
      socket =
        new WebSocket(
          WS_URL
        );
    } catch (error) {
      console.error(
        "PROTRADERS FX SOCKET ERROR:",
        error
      );

      scheduleReconnect();
      return;
    }

    state.socket = socket;

    socket.onopen = () => {
      console.log(
        "PROTRADERS FX MARKET CONNECTION OPEN"
      );

      state.connected = true;
      state.reconnectDelay = 2000;

      setStatus("LIVE");

      /*
       * Request history first.
       */
      requestHistory();

      /*
       * Then subscribe to live ticks.
       */
      setTimeout(
        subscribeMarket,
        250
      );
    };

    socket.onmessage =
      handleMessage;

    socket.onerror = (error) => {
      console.error(
        "DERIV MARKET ERROR:",
        error
      );
    };

    socket.onclose = (event) => {
      console.warn(
        "DERIV WebSocket closed:",
        event.code,
        event.reason || ""
      );

      state.connected = false;

      setStatus(
        "RECONNECTING"
      );

      scheduleReconnect();
    };
  }

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
      setTimeout(() => {
        state.reconnectTimer =
          null;

        connect();

        state.reconnectDelay =
          Math.min(
            state.reconnectDelay * 2,
            30000
          );
      }, delay);
  }

  function changeMarket(
    marketName
  ) {
    const market =
      MARKETS[marketName];

    if (!market) {
      return;
    }

    state.currentMarket =
      marketName;

    state.currentSymbol =
      market.symbol;

    state.decimals =
      market.decimals;

    state.price = null;
    state.previousPrice = null;

    state.prices = [];
    state.times = [];

    updateMarketName();
    updatePriceDisplay();
    updateChartAxis();
    drawChart();

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      requestHistory();

      setTimeout(
        subscribeMarket,
        200
      );
    }
  }

  function setupMarketButtons() {
    $$(".market-item").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            $$(".market-item")
              .forEach(
                (item) =>
                  item.classList.remove(
                    "active"
                  )
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

  function setupTimeframes() {
    $$(".timeframe").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            $$(".timeframe")
              .forEach(
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
  }

  function setupTradeButtons() {
    const message =
      $("[data-trade-message]");

    const buy =
      $("#buy-button");

    const sell =
      $("#sell-button");

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

  function init() {
    console.log(
      "PROTRADERS FX INITIALIZING"
    );

    initialiseUI();
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
