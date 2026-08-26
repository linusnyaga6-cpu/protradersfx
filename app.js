document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* =========================================================
     PROTRADERS FX — LIVE MARKET ENGINE
     ========================================================= */

  const state = {
    symbol: "EUR/USD",
    derivSymbol: "frxEURUSD",

    price: null,
    previousPrice: null,
    sessionOpen: null,

    prices: [],
    times: [],

    websocket: null,
    reconnectTimer: null,
    reconnectAttempts: 0,

    authenticated: false,
    account: null,
    accounts: [],

    requestId: 0
  };


  /* =========================================================
     ELEMENT HELPERS
     ========================================================= */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return document.querySelectorAll(selector);
  }

  function setText(selector, value) {
    $all(selector).forEach((element) => {
      element.textContent = value;
    });
  }


  /* =========================================================
     SYMBOLS
     ========================================================= */

  const SYMBOLS = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };


  /* =========================================================
     PRICE FORMATTING
     ========================================================= */

  function getDecimals(symbol, price) {
    if (symbol === "USD/JPY") {
      return 3;
    }

    if (Number(price) >= 10) {
      return 3;
    }

    return 5;
  }

  function formatPrice(price) {
    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(Number(price))
    ) {
      return "—";
    }

    return Number(price).toFixed(
      getDecimals(state.symbol, price)
    );
  }


  /* =========================================================
     CONNECTION STATUS
     ========================================================= */

  function marketStatus(text) {
    setText("[data-market-status]", text);
    setText("[data-status]", text);
  }


  /* =========================================================
     DISPLAY SYMBOL
     ========================================================= */

  function updateSymbolDisplay() {
    setText("[data-market]", state.symbol);
    setText("[data-analysis-market]", state.symbol);
    setText("[data-chart-market]", state.symbol);
  }


  /* =========================================================
     WEBSOCKET
     ========================================================= */

  function disconnectMarket() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    if (state.websocket) {
      try {
        state.websocket.onclose = null;
        state.websocket.close();
      } catch (_) {}

      state.websocket = null;
    }
  }


  function connectMarket() {
    disconnectMarket();

    state.price = null;
    state.previousPrice = null;
    state.sessionOpen = null;
    state.prices = [];
    state.times = [];

    updateSymbolDisplay();

    setText("[data-price]", "—");
    setText("[data-move]", "—");
    setText("[data-change]", "—");
    setText("[data-change-percent]", "—");

    marketStatus("CONNECTING");

    const symbol =
      SYMBOLS[state.symbol] || "frxEURUSD";

    state.derivSymbol = symbol;

    openMarketSocket(symbol);
  }


  function openMarketSocket(symbol) {
    let socket;

    try {
      socket = new WebSocket(
        "wss://ws.derivws.com/websockets/v3?app_id=1089"
      );
    } catch (error) {
      console.error("WebSocket creation error:", error);
      scheduleReconnect();
      return;
    }

    state.websocket = socket;

    socket.addEventListener("open", () => {
      if (state.websocket !== socket) {
        return;
      }

      state.reconnectAttempts = 0;

      marketStatus("LIVE");

      const historyRequest = {
        ticks_history: symbol,
        end: "latest",
        count: 100,
        style: "ticks",
        subscribe: 0,
        req_id: ++state.requestId
      };

      socket.send(
        JSON.stringify(historyRequest)
      );

      const tickRequest = {
        ticks: symbol,
        subscribe: 1,
        req_id: ++state.requestId
      };

      socket.send(
        JSON.stringify(tickRequest)
      );
    });


    socket.addEventListener("message", (event) => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (data.error) {
        console.error(
          "DERIV ERROR:",
          data.error
        );

        marketStatus("MARKET ERROR");

        return;
      }


      /* -----------------------------------------
         HISTORICAL DATA
      ----------------------------------------- */

      if (
        data.msg_type === "history" &&
        data.history
      ) {
        const prices =
          Array.isArray(data.history.prices)
            ? data.history.prices
            : [];

        const times =
          Array.isArray(data.history.times)
            ? data.history.times
            : [];

        state.prices = prices
          .map(Number)
          .filter(Number.isFinite)
          .slice(-100);

        state.times = times
          .map(Number)
          .slice(-100);

        if (state.prices.length > 0) {
          state.sessionOpen =
            state.prices[0];

          const last =
            state.prices[
              state.prices.length - 1
            ];

          state.price = last;

          renderPrice(last, false);
          updateChart();
          updateAnalysis();
          updateTradeLevels();
        }

        return;
      }


      /* -----------------------------------------
         LIVE TICK
      ----------------------------------------- */

      if (
        data.msg_type === "tick" &&
        data.tick
      ) {
        const quote =
          Number(data.tick.quote);

        if (!Number.isFinite(quote)) {
          return;
        }

        const epoch =
          Number(data.tick.epoch);

        updateLivePrice(
          quote,
          epoch
        );
      }
    });


    socket.addEventListener("error", (error) => {
      console.error(
        "DERIV WEBSOCKET ERROR:",
        error
      );

      marketStatus("RECONNECTING");

      try {
        socket.close();
      } catch (_) {}
    });


    socket.addEventListener("close", () => {
      if (state.websocket === socket) {
        state.websocket = null;
        marketStatus("RECONNECTING");
        scheduleReconnect();
      }
    });
  }


  /* =========================================================
     RECONNECT
     ========================================================= */

  function scheduleReconnect() {
    if (state.reconnectTimer) {
      return;
    }

    const delay =
      Math.min(
        1000 *
          Math.pow(
            2,
            state.reconnectAttempts
          ),
        10000
      );

    state.reconnectAttempts++;

    state.reconnectTimer =
      setTimeout(() => {
        state.reconnectTimer = null;
        connectMarket();
      }, delay);
  }


  /* =========================================================
     LIVE PRICE
     ========================================================= */

  function updateLivePrice(price, epoch) {
    state.previousPrice = state.price;
    state.price = price;

    if (!state.sessionOpen) {
      state.sessionOpen = price;
    }

    state.prices.push(price);

    if (Number.isFinite(epoch)) {
      state.times.push(epoch);
    }

    if (state.prices.length > 100) {
      state.prices =
        state.prices.slice(-100);
    }

    if (state.times.length > 100) {
      state.times =
        state.times.slice(-100);
    }

    renderPrice(price, true);

    updateChart();
    updateAnalysis();
    updateTradeLevels();
    updateRisk();
  }


  /* =========================================================
     PRICE DISPLAY
     ========================================================= */

  function renderPrice(price, liveTick) {
    const formatted =
      formatPrice(price);

    setText(
      "[data-price]",
      formatted
    );

    setText(
      "[data-current-price]",
      formatted
    );

    setText(
      "[data-live-price]",
      formatted
    );

    if (
      liveTick &&
      state.previousPrice !== null
    ) {
      const difference =
        price -
        state.previousPrice;

      let movement = "—";

      if (difference > 0) {
        movement = "▲ UP";
      } else if (difference < 0) {
        movement = "▼ DOWN";
      }

      setText(
        "[data-move]",
        movement
      );

      setText(
        "[data-change]",
        formatSignedDifference(
          difference
        )
      );

      updateMovementClasses(
        difference
      );
    }

    updateSessionChange(price);
  }


  function formatSignedDifference(value) {
    if (!Number.isFinite(value)) {
      return "—";
    }

    const decimals =
      getDecimals(
        state.symbol,
        state.price
      );

    const sign =
      value > 0
        ? "+"
        : value < 0
          ? "-"
          : "";

    return (
      sign +
      Math.abs(value).toFixed(decimals)
    );
  }


  function updateSessionChange(price) {
    if (
      state.sessionOpen === null ||
      !Number.isFinite(price)
    ) {
      return;
    }

    const change =
      price -
      state.sessionOpen;

    const percentage =
      state.sessionOpen !== 0
        ? (change /
            state.sessionOpen) *
          100
        : 0;

    const sign =
      change > 0
        ? "+"
        : change < 0
          ? "-"
          : "";

    setText(
      "[data-change]",
      `${sign}${Math.abs(change).toFixed(
        getDecimals(
          state.symbol,
          price
        )
      )}`
    );

    setText(
      "[data-change-percent]",
      `${sign}${Math.abs(
        percentage
      ).toFixed(2)}%`
    );
  }


  function updateMovementClasses(value) {
    const elements =
      $all(
        "[data-move], [data-change], [data-change-percent]"
      );

    elements.forEach((element) => {
      element.classList.remove(
        "positive",
        "negative",
        "up",
        "down"
      );

      if (value > 0) {
        element.classList.add(
          "positive",
          "up"
        );
      } else if (value < 0) {
        element.classList.add(
          "negative",
          "down"
        );
      }
    });
  }


  /* =========================================================
     CHART
     ========================================================= */

  function updateChart() {
    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }

    const values =
      state.prices.slice(-80);

    if (values.length < 2) {
      return;
    }

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const range =
      max - min || 0.00001;

    const width = 1000;
    const height = 360;
    const padding = 15;

    const points =
      values
        .map((value, index) => {
          const x =
            padding +
            (
              index /
              Math.max(
                values.length - 1,
                1
              )
            ) *
              (width -
                padding * 2);

          const y =
            height -
            padding -
            (
              (
                value - min
              ) /
              range
            ) *
              (height -
                padding * 2);

          return `${x.toFixed(2)},${y.toFixed(
            2
          )}`;
        })
        .join(" ");

    line.setAttribute(
      "points",
      points
    );
  }


  /* =========================================================
     ANALYSIS
     ========================================================= */

  function updateAnalysis() {
    if (state.prices.length < 5) {
      return;
    }

    const prices =
      state.prices;

    const recent =
      prices.slice(-5);

    const older =
      prices.slice(-10, -5);

    if (
      recent.length === 0
    ) {
      return;
    }

    const recentAverage =
      average(recent);

    const olderAverage =
      older.length
        ? average(older)
        : recentAverage;

    let trend = "SIDEWAYS";
    let direction = "WAIT";

    if (
      recentAverage >
      olderAverage
    ) {
      trend = "BULLISH";
      direction = "CALL";
    } else if (
      recentAverage <
      olderAverage
    ) {
      trend = "BEARISH";
      direction = "PUT";
    }

    const first =
      recent[0];

    const last =
      recent[
        recent.length - 1
      ];

    const movement =
      Math.abs(
        last - first
      );

    const volatility =
      Math.abs(
        Math.max(...recent) -
        Math.min(...recent)
      );

    let momentum = "LOW";

    if (
      movement > 0 ||
      volatility > 0
    ) {
      momentum = "ACTIVE";
    }

    if (
      state.prices.length >= 20
    ) {
      const longer =
        state.prices.slice(-20);

      const longRange =
        Math.max(...longer) -
        Math.min(...longer);

      if (
        longRange >
        state.price * 0.001
      ) {
        momentum = "HIGH";
      }
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
      direction
    );

    setText(
      "[data-ai-bias]",
      direction
    );

    setText(
      "[data-ai-confidence]",
      direction === "WAIT"
        ? "—"
        : momentum === "HIGH"
          ? "HIGH"
          : "LIVE"
    );


    const aiMessage =
      $("#ai-message");

    if (aiMessage) {
      if (direction === "CALL") {
        aiMessage.textContent =
          `${state.symbol} is showing short-term upward momentum.`;
      } else if (
        direction === "PUT"
      ) {
        aiMessage.textContent =
          `${state.symbol} is showing short-term downward momentum.`;
      } else {
        aiMessage.textContent =
          `${state.symbol} is currently showing no clear short-term direction.`;
      }
    }

    applySignalClass(
      direction
    );

    updateTradeLevels();
  }


  function average(values) {
    if (!values.length) {
      return 0;
    }

    return (
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / values.length
    );
  }


  function applySignalClass(direction) {
    const elements =
      $all(
        "[data-signal], [data-direction], [data-ai-bias]"
      );

    elements.forEach((element) => {
      element.classList.remove(
        "buy",
        "sell",
        "wait"
      );

      if (direction === "CALL") {
        element.classList.add(
          "buy"
        );
      } else if (
        direction === "PUT"
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
  }


  /* =========================================================
     TRADE LEVELS
     ========================================================= */

  function updateTradeLevels() {
    if (
      state.price === null ||
      !Number.isFinite(state.price)
    ) {
      return;
    }

    const price =
      state.price;

    const decimals =
      getDecimals(
        state.symbol,
        price
      );

    const offset =
      price * 0.001;

    const entry =
      price;

    const stop =
      price - offset;

    const target =
      price + offset * 2;

    setText(
      "[data-entry]",
      entry.toFixed(decimals)
    );

    setText(
      "[data-stop]",
      stop.toFixed(decimals)
    );

    setText(
      "[data-target]",
      target.toFixed(decimals)
    );
  }


  /* =========================================================
     MARKET BUTTONS
     ========================================================= */

  $all(".market-item").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          $all(".market-item").forEach(
            (item) =>
              item.classList.remove(
                "active"
              )
          );

          button.classList.add(
            "active"
          );

          const selected =
            button.dataset.symbol ||
            button.textContent
              .trim();

          if (
            SYMBOLS[selected]
          ) {
            state.symbol =
              selected;
          }

          connectMarket();
        }
      );
    }
  );


  /* =========================================================
     TIMEFRAMES
     ========================================================= */

  $all(".timeframe").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          $all(".timeframe").forEach(
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


  /* =========================================================
     SESSION
     ========================================================= */

  async function checkSession() {
    try {
      const response =
        await fetch(
          "/api/session",
          {
            credentials: "include",
            cache: "no-store"
          }
        );

      if (!response.ok) {
        setLoggedOutUI();
        return;
      }

      const data =
        await response.json();

      if (
        data &&
        data.authenticated === true
      ) {
        setLoggedInUI();
        await loadAccounts();
      } else {
        setLoggedOutUI();
      }
    } catch (error) {
      console.error(
        "SESSION ERROR:",
        error
      );

      setLoggedOutUI();
    }
  }


  function setLoggedInUI() {
    state.authenticated = true;

    const loggedOut =
      $("#logged-out-actions");

    const accountPanel =
      $("#account-panel");

    const publicNavigation =
      $("#public-navigation");

    const tradingNavigation =
      $("#trading-navigation");

    const tradingWorkspace =
      $("#trading-workspace");

    if (loggedOut) {
      loggedOut.hidden = true;
    }

    if (accountPanel) {
      accountPanel.hidden = false;
    }

    if (publicNavigation) {
      publicNavigation.hidden = true;
    }

    if (tradingNavigation) {
      tradingNavigation.hidden = false;
    }

    if (tradingWorkspace) {
      tradingWorkspace.hidden = false;
    }

    setText(
      "[data-trade-message]",
      "READY TO TRADE"
    );
  }


  function setLoggedOutUI() {
    state.authenticated = false;

    const loggedOut =
      $("#logged-out-actions");

    const accountPanel =
      $("#account-panel");

    const publicNavigation =
      $("#public-navigation");

    const tradingNavigation =
      $("#trading-navigation");

    const tradingWorkspace =
      $("#trading-workspace");

    if (loggedOut) {
      loggedOut.hidden = false;
    }

    if (accountPanel) {
      accountPanel.hidden = true;
    }

    if (publicNavigation) {
      publicNavigation.hidden = false;
    }

    if (tradingNavigation) {
      tradingNavigation.hidden = true;
    }

    if (tradingWorkspace) {
      tradingWorkspace.hidden = true;
    }
  }


  /* =========================================================
     ACCOUNTS
     ========================================================= */

  async function loadAccounts() {
    if (!state.authenticated) {
      return;
    }

    try {
      const response =
        await fetch(
          "/api/deriv/accounts",
          {
            credentials: "include",
            cache: "no-store"
          }
        );

      if (
        response.status === 401
      ) {
        setLoggedOutUI();
        return;
      }

      if (!response.ok) {
        console.error(
          "ACCOUNT REQUEST FAILED:",
          response.status
        );
        return;
      }

      const data =
        await response.json();

      state.accounts =
        Array.isArray(
          data.accounts
        )
          ? data.accounts
          : [];

      populateAccounts();
    } catch (error) {
      console.error(
        "ACCOUNT ERROR:",
        error
      );
    }
  }


  function populateAccounts() {
    const select =
      $("#account-select");

    if (!select) {
      return;
    }

    select.innerHTML = "";

    if (
      state.accounts.length === 0
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value = "";
      option.textContent =
        "ACCOUNT";

      select.appendChild(option);

      return;
    }

    state.accounts.forEach(
      (account, index) => {
        const option =
          document.createElement(
            "option"
          );

        const id =
          account.id ||
          account.account_id ||
          account.loginid ||
          account.login ||
          "";

        const type =
          account.account_type ||
          account.type ||
          "ACCOUNT";

        const currency =
          account.currency ||
          "USD";

        const balance =
          account.balance !== undefined
            ? account.balance
            : "";

        option.value = id;

        option.textContent =
          `${type} ${
            id || index + 1
          } — ${currency} ${balance}`;

        select.appendChild(option);
      }
    );

    selectAccount(
      state.accounts[0]
    );
  }


  function selectAccount(account) {
    if (!account) {
      return;
    }

    state.account =
      account;

    const currency =
      account.currency ||
      "USD";

    const balance =
      account.balance !== undefined
        ? Number(account.balance)
        : null;

    if (
      balance !== null &&
      Number.isFinite(balance)
    ) {
      const formatted =
        `${currency} ${balance.toFixed(2)}`;

      const accountBalance =
        $("#account-balance");

      const riskBalance =
        $("#risk-balance");

      if (accountBalance) {
        accountBalance.textContent =
          formatted;
      }

      if (riskBalance) {
        riskBalance.textContent =
          formatted;
      }
    }
  }


  const accountSelect =
    $("#account-select");

  if (accountSelect) {
    accountSelect.addEventListener(
      "change",
      () => {
        const id =
          accountSelect.value;

        const selected =
          state.accounts.find(
            (account) => {
              const accountId =
                account.id ||
                account.account_id ||
                account.loginid ||
                account.login ||
                "";

              return (
                String(accountId) ===
                String(id)
              );
            }
          );

        if (selected) {
          selectAccount(selected);
        }
      }
    );
  }


  /* =========================================================
     RISK
     ========================================================= */

  function updateRisk() {
    const stake =
      $("#stake");

    const riskStake =
      $("#risk-stake");

    if (
      stake &&
      riskStake
    ) {
      riskStake.textContent =
        `${stake.value || 0} USD`;
    }
  }


  const stakeInput =
    $("#stake");

  if (stakeInput) {
    stakeInput.addEventListener(
      "input",
      updateRisk
    );
  }


  /* =========================================================
     TRADE BUTTONS
     ========================================================= */

  function tradeMessage(message) {
    setText(
      "[data-trade-message]",
      message
    );
  }


  const buyButton =
    $("#buy-button");

  const sellButton =
    $("#sell-button");


  if (buyButton) {
    buyButton.addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          tradeMessage(
            "LOG IN TO TRADE"
          );
          return;
        }

        if (!state.account) {
          tradeMessage(
            "SELECT ACCOUNT"
          );
          return;
        }

        tradeMessage(
          `BUY ${state.symbol} — READY`
        );
      }
    );
  }


  if (sellButton) {
    sellButton.addEventListener(
      "click",
      () => {
        if (!state.authenticated) {
          tradeMessage(
            "LOG IN TO TRADE"
          );
          return;
        }

        if (!state.account) {
          tradeMessage(
            "SELECT ACCOUNT"
          );
          return;
        }

        tradeMessage(
          `SELL ${state.symbol} — READY`
        );
      }
    );
  }


  /* =========================================================
     TOOLS
     ========================================================= */

  const createBotButton =
    $("#create-bot-button");

  if (createBotButton) {
    createBotButton.addEventListener(
      "click",
      () => {
        alert(
          "Bot builder is ready to be connected to the trading engine."
        );
      }
    );
  }


  const bulkButton =
    $("#bulk-trader-button");

  if (bulkButton) {
    bulkButton.addEventListener(
      "click",
      () => {
        alert(
          "Bulk Trader workspace is ready to be connected to the trading engine."
        );
      }
    );
  }


  /* =========================================================
     START
     ========================================================= */

  updateSymbolDisplay();
  updateRisk();

  checkSession();

  connectMarket();

});
