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

    market: "EUR/USD",
    symbol: "frxEURUSD",
    decimals: 5,

    price: null,
    previous: null,

    prices: [],
    times: [],

    maxPoints: 180,

    reconnectTimer: null,
    reconnectDelay: 2000,

    requestId: 0,
    destroyed: false
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function setText(selector, value) {
    $$(selector).forEach((el) => {
      el.textContent =
        value === null ||
        value === undefined ||
        value === ""
          ? "—"
          : String(value);
    });
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function priceFormat(value) {
    const n = num(value);

    if (n === null) {
      return "—";
    }

    return n.toFixed(state.decimals);
  }

  function setStatus(value) {
    setText("[data-market-status]", value);
  }

  function requestId() {
    state.requestId += 1;
    return state.requestId;
  }

  function updateMarketUI() {
    setText("[data-market]", state.market);
    setText("[data-analysis-market]", state.market);
  }

  function updatePriceUI() {
    if (state.price === null) {
      setText("[data-price]", "—");
      setText("[data-move]", "—");
      return;
    }

    setText(
      "[data-price]",
      priceFormat(state.price)
    );

    const moveElements = $$("[data-move]");

    moveElements.forEach((el) => {
      el.classList.remove("positive", "negative");

      if (state.previous === null) {
        el.textContent = "—";
        return;
      }

      const difference =
        state.price - state.previous;

      el.textContent =
        (difference > 0 ? "+" : "") +
        difference.toFixed(state.decimals);

      if (difference > 0) {
        el.classList.add("positive");
      }

      if (difference < 0) {
        el.classList.add("negative");
      }
    });
  }

  function updateAxis() {
    if (!state.prices.length) {
      return;
    }

    const values = state.prices;

    const max = Math.max(...values);
    const min = Math.min(...values);

    const difference = max - min;

    const labels = $$(".chart-axis span");

    if (!labels.length) {
      return;
    }

    const points = [
      max,
      max - difference * 0.25,
      (max + min) / 2,
      min + difference * 0.25,
      min
    ];

    labels.forEach((label, index) => {
      label.textContent =
        priceFormat(points[index]);
    });
  }

  function updateAnalysis() {
    if (state.prices.length < 2) {
      return;
    }

    const latest =
      state.prices[state.prices.length - 1];

    const previous =
      state.prices[state.prices.length - 2];

    const difference =
      latest - previous;

    let direction = "WAIT";
    let momentum = "FLAT";

    if (difference > 0) {
      direction = "UP";
      momentum = "POSITIVE";
    }

    if (difference < 0) {
      direction = "DOWN";
      momentum = "NEGATIVE";
    }

    setText("[data-trend]", direction);
    setText("[data-direction]", direction);
    setText("[data-momentum]", momentum);
    setText("[data-ai-bias]", direction);

    setText(
      "[data-ai-confidence]",
      state.prices.length >= 10
        ? "LIVE"
        : "—"
    );

    $$("[data-signal]").forEach((el) => {
      el.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (direction === "UP") {
        el.textContent = "BUY";
        el.classList.add("buy");
      } else if (direction === "DOWN") {
        el.textContent = "SELL";
        el.classList.add("sell");
      } else {
        el.textContent = "WAIT";
        el.classList.add("wait");
      }
    });

    const pip =
      Math.pow(10, -state.decimals);

    const entry = latest;

    let stop;
    let target;

    if (direction === "UP") {
      stop = latest - pip * 15;
      target = latest + pip * 25;
    } else if (direction === "DOWN") {
      stop = latest + pip * 15;
      target = latest - pip * 25;
    } else {
      stop = latest - pip * 15;
      target = latest + pip * 15;
    }

    setText(
      "[data-entry]",
      priceFormat(entry)
    );

    setText(
      "[data-stop]",
      priceFormat(stop)
    );

    setText(
      "[data-target]",
      priceFormat(target)
    );
  }

  function drawChart() {
    const line = $("[data-live-line]");

    if (!line) {
      return;
    }

    const values = state.prices;

    if (values.length < 2) {
      line.setAttribute("points", "");
      return;
    }

    const width = 1000;
    const height = 400;
    const padding = 20;

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      min -= Math.pow(10, -state.decimals);
      max += Math.pow(10, -state.decimals);
    }

    const range = max - min;

    const points = values.map(
      (value, index) => {
        const x =
          padding +
          (
            index /
            (values.length - 1)
          ) *
          (width - padding * 2);

        const y =
          height -
          padding -
          (
            (value - min) /
            range
          ) *
          (height - padding * 2);

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

  function updateEverything() {
    updatePriceUI();
    updateAxis();
    updateAnalysis();
    drawChart();
  }

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

  function requestHistory() {
    console.log(
      "PROTRADERS FX HISTORY:",
      state.symbol
    );

    send({
      ticks_history: state.symbol,
      end: "latest",
      count: state.maxPoints,
      style: "ticks",
      subscribe: 0,
      req_id: requestId()
    });
  }

  function subscribeTicks() {
    console.log(
      "PROTRADERS FX SUBSCRIBING:",
      state.symbol
    );

    send({
      ticks: state.symbol,
      subscribe: 1,
      req_id: requestId()
    });
  }

  function processHistory(data) {
    if (!data.history) {
      return;
    }

    const prices =
      Array.isArray(data.history.prices)
        ? data.history.prices
        : [];

    const times =
      Array.isArray(data.history.times)
        ? data.history.times
        : [];

    const cleanPrices =
      prices
        .map(Number)
        .filter(Number.isFinite);

    if (!cleanPrices.length) {
      console.warn(
        "PROTRADERS FX: EMPTY HISTORY"
      );
      return;
    }

    state.prices =
      cleanPrices.slice(-state.maxPoints);

    state.times =
      times
        .map(Number)
        .filter(Number.isFinite)
        .slice(-state.maxPoints);

    state.previous =
      state.prices.length > 1
        ? state.prices[
            state.prices.length - 2
          ]
        : null;

    state.price =
      state.prices[
        state.prices.length - 1
      ];

    updateEverything();

    console.log(
      "PROTRADERS FX HISTORY RECEIVED:",
      state.prices.length,
      "points"
    );
  }

  function processTick(data) {
    if (!data.tick) {
      return;
    }

    const tick = data.tick;

    if (
      tick.symbol &&
      tick.symbol !== state.symbol
    ) {
      return;
    }

    const value =
      num(tick.quote);

    if (value === null) {
      return;
    }

    state.previous = state.price;
    state.price = value;

    state.prices.push(value);

    state.times.push(
      Number(tick.epoch) ||
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

    updateEverything();

    setStatus("LIVE");
  }

  function handleMessage(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.error(
        "PROTRADERS FX INVALID MESSAGE:",
        error
      );
      return;
    }

    if (data.error) {
      console.error(
        "DERIV MARKET ERROR:",
        data.error
      );

      setStatus("MARKET ERROR");
      return;
    }

    if (data.msg_type === "history") {
      processHistory(data);
      return;
    }

    if (data.msg_type === "tick") {
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
      socket = new WebSocket(WS_URL);
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

      requestHistory();
      subscribeTicks();
    };

    socket.onmessage =
      handleMessage;

    socket.onerror = (error) => {
      console.error(
        "PROTRADERS FX WEBSOCKET ERROR:",
        error
      );
    };

    socket.onclose = (event) => {
      console.warn(
        "PROTRADERS FX SOCKET CLOSED:",
        event.code,
        event.reason || ""
      );

      state.connected = false;

      setStatus("RECONNECTING");

      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (
      state.destroyed ||
      state.reconnectTimer
    ) {
      return;
    }

    const delay =
      state.reconnectDelay;

    console.log(
      "PROTRADERS FX RECONNECTING IN",
      Math.round(delay / 1000),
      "SECONDS"
    );

    state.reconnectTimer =
      setTimeout(() => {
        state.reconnectTimer = null;

        connect();

        state.reconnectDelay =
          Math.min(
            state.reconnectDelay * 2,
            30000
          );
      }, delay);
  }

  function changeMarket(name) {
    const market =
      MARKETS[name];

    if (!market) {
      return;
    }

    state.market = name;
    state.symbol = market.symbol;
    state.decimals = market.decimals;

    state.price = null;
    state.previous = null;
    state.prices = [];
    state.times = [];

    updateMarketUI();
    updateEverything();

    if (
      state.socket &&
      state.socket.readyState ===
        WebSocket.OPEN
    ) {
      requestHistory();
      subscribeTicks();
    }
  }

  function setupMarkets() {
    $$(".market-item").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
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

  function setupTrading() {
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

  function initialise() {
    console.log(
      "PROTRADERS FX INITIALIZING"
    );

    updateMarketUI();
    updateEverything();

    setupMarkets();
    setupTimeframes();
    setupTrading();

    connect();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialise
    );
  } else {
    initialise();
  }
})();
