document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* =========================================================
     PROTRADERS FX — LIVE MARKET ENGINE
  ========================================================= */

  const state = {
    authenticated: false,

    symbol: "EUR/USD",
    derivSymbol: "frxEURUSD",

    price: null,
    previousPrice: null,

    prices: [],

    websocket: null,
    reconnectTimer: null,

    reconnectAttempts: 0,

    accounts: [],
    account: null
  };


  /* =========================================================
     DOM HELPERS
  ========================================================= */

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));


  function setText(selector, value) {
    $$(selector).forEach((element) => {
      element.textContent = value;
    });
  }


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

    return number.toFixed(5);
  }


  function getPrecision(price) {
    if (!Number.isFinite(Number(price))) {
      return 5;
    }

    return Number(price) >= 100 ? 3 : 5;
  }


  /* =========================================================
     MARKET MAP
  ========================================================= */

  const symbolMap = {
    "EUR/USD": "frxEURUSD",
    "GBP/USD": "frxGBPUSD",
    "USD/JPY": "frxUSDJPY",
    "AUD/USD": "frxAUDUSD",
    "USD/CAD": "frxUSDCAD",
    "USD/CHF": "frxUSDCHF"
  };


  /* =========================================================
     MARKET UI
  ========================================================= */

  function updateMarketLabels() {
    setText(
      "[data-market]",
      state.symbol
    );

    setText(
      "[data-analysis-market]",
      state.symbol
    );

    setText(
      "[data-chart-market]",
      state.symbol
    );
  }


  function selectMarket(symbol) {
    if (!symbolMap[symbol]) {
      return;
    }

    state.symbol = symbol;
    state.derivSymbol = symbolMap[symbol];

    state.price = null;
    state.previousPrice = null;
    state.prices = [];

    updateMarketLabels();

    setText(
      "[data-price]",
      "—"
    );

    setText(
      "[data-move]",
      "—"
    );

    setText(
      "[data-market-status]",
      "CONNECTING"
    );

    setText(
      "[data-trend]",
      "—"
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

    connectMarket();
  }


  $$(".market-item").forEach((button) => {
    button.addEventListener("click", () => {

      $$(".market-item").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      const symbol =
        button.dataset.symbol ||
        button.textContent.trim();

      selectMarket(symbol);
    });
  });


  /* =========================================================
     TIMEFRAMES
  ========================================================= */

  $$(".timeframe").forEach((button) => {
    button.addEventListener("click", () => {

      $$(".timeframe").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");
    });
  });


  /* =========================================================
     MARKET STATUS
  ========================================================= */

  function marketStatus(status) {
    setText(
      "[data-market-status]",
      status
    );

    setText(
      "[data-connection-status]",
      status
    );
  }


  /* =========================================================
     DERIV WEBSOCKET
  ========================================================= */

  function closeSocket() {
    if (state.websocket) {
      try {
        state.websocket.close();
      } catch (error) {
        console.warn(
          "Socket close error:",
          error
        );
      }

      state.websocket = null;
    }
  }


  function clearReconnectTimer() {
    if (state.reconnectTimer) {
      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer = null;
    }
  }


  function scheduleReconnect() {
    clearReconnectTimer();

    if (state.reconnectAttempts >= 5) {
      marketStatus("RECONNECT FAILED");
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

    state.reconnectAttempts += 1;

    marketStatus("RECONNECTING");

    state.reconnectTimer =
      setTimeout(() => {
        connectMarket();
      }, delay);
  }


  function connectMarket() {
    clearReconnectTimer();

    closeSocket();

    marketStatus("CONNECTING");

    let socket;

    try {
      socket =
        new WebSocket(
          "wss://ws.derivws.com/websockets/v3?app_id=1089"
        );
    } catch (error) {

      console.error(
        "WebSocket creation error:",
        error
      );

      marketStatus("CONNECTION ERROR");

      scheduleReconnect();

      return;
    }


    state.websocket = socket;


    /* -------------------------------------------------------
       OPEN
    ------------------------------------------------------- */

    socket.addEventListener(
      "open",
      () => {

        state.reconnectAttempts = 0;

        marketStatus("LIVE");

        try {

          socket.send(
            JSON.stringify({
              ticks:
                state.derivSymbol,

              subscribe: 1
            })
          );

        } catch (error) {

          console.error(
            "Subscription error:",
            error
          );

          try {
            socket.close();
          } catch {}
        }
      }
    );


    /* -------------------------------------------------------
       MESSAGE
    ------------------------------------------------------- */

    socket.addEventListener(
      "message",
      (event) => {

        let data;

        try {
          data =
            JSON.parse(
              event.data
            );
        } catch (error) {
          console.warn(
            "Invalid WebSocket message:",
            event.data
          );

          return;
        }


        /* -----------------------------------------------
           DERIV ERROR
        ----------------------------------------------- */

        if (data.error) {

          console.error(
            "DERIV ERROR:",
            data.error
          );

          marketStatus(
            data.error.message ||
              "MARKET ERROR"
          );

          return;
        }


        /* -----------------------------------------------
           TICK
        ----------------------------------------------- */

        if (
          data.msg_type === "tick" &&
          data.tick
        ) {

          const quote =
            Number(
              data.tick.quote
            );

          if (
            !Number.isFinite(
              quote
            )
          ) {
            return;
          }

          updatePrice(
            quote
          );

          marketStatus("LIVE");
        }
      }
    );


    /* -------------------------------------------------------
       CLOSE
    ------------------------------------------------------- */

    socket.addEventListener(
      "close",
      () => {

        if (
          state.websocket ===
          socket
        ) {

          state.websocket =
            null;

          marketStatus(
            "DISCONNECTED"
          );

          scheduleReconnect();
        }
      }
    );


    /* -------------------------------------------------------
       ERROR
    ------------------------------------------------------- */

    socket.addEventListener(
      "error",
      (error) => {

        console.error(
          "MARKET SOCKET ERROR:",
          error
        );

        marketStatus(
          "CONNECTION ERROR"
        );

        try {
          socket.close();
        } catch {}
      }
    );
  }


  /* =========================================================
     PRICE ENGINE
  ========================================================= */

  function updatePrice(price) {

    state.previousPrice =
      state.price;

    state.price =
      price;


    state.prices.push(
      price
    );


    if (
      state.prices.length > 150
    ) {

      state.prices =
        state.prices.slice(
          -150
        );
    }


    /* -------------------------------------------------------
       PRICE
    ------------------------------------------------------- */

    setText(
      "[data-price]",
      formatPrice(price)
    );


    /* -------------------------------------------------------
       MOVEMENT
    ------------------------------------------------------- */

    let movement = "—";

    let movementClass = "";


    if (
      state.previousPrice !==
        null &&
      Number.isFinite(
        state.previousPrice
      )
    ) {

      if (
        price >
        state.previousPrice
      ) {

        movement =
          "▲ UP";

        movementClass =
          "positive";

      } else if (
        price <
        state.previousPrice
      ) {

        movement =
          "▼ DOWN";

        movementClass =
          "negative";

      } else {

        movement =
          "—";
      }
    }


    setText(
      "[data-move]",
      movement
    );


    /* Apply visual movement classes */

    $$(".price-movement").forEach(
      (element) => {

        element.classList.remove(
          "positive",
          "negative"
        );

        if (movementClass) {
          element.classList.add(
            movementClass
          );
        }
      }
    );


    /* -------------------------------------------------------
       UPDATE EVERYTHING
    ------------------------------------------------------- */

    updateChart();

    updateAnalysis();

    updateTradeLevels();

    updateRisk();
  }


  /* =========================================================
     LIVE SVG CHART
  ========================================================= */

  function updateChart() {

    const line =
      $("[data-live-line]");

    if (!line) {
      return;
    }


    if (
      state.prices.length < 2
    ) {
      return;
    }


    const values =
      state.prices.slice(
        -100
      );


    let min =
      Math.min(
        ...values
      );

    let max =
      Math.max(
        ...values
      );


    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max)
    ) {
      return;
    }


    let range =
      max - min;


    /*
      Prevent a flat line when the
      market has barely moved.
    */

    if (
      range === 0
    ) {

      const padding =
        Math.abs(min) *
          0.00001 ||
        0.00001;

      min -= padding;
      max += padding;

      range =
        max - min;
    }


    const points =
      values
        .map(
          (value, index) => {

            const x =
              (
                index /
                Math.max(
                  values.length - 1,
                  1
                )
              ) *
              1000;


            const y =
              360 -
              (
                (
                  value - min
                ) /
                range
              ) *
              320;


            return (
              `${x.toFixed(2)},` +
              `${y.toFixed(2)}`
            );
          }
        )
        .join(" ");


    line.setAttribute(
      "points",
      points
    );


    /*
      Update chart axis when available.
    */

    updateChartAxis(
      min,
      max
    );
  }


  function updateChartAxis(
    min,
    max
  ) {

    const axis =
      $$(".chart-axis span");

    if (
      axis.length === 0
    ) {
      return;
    }


    const range =
      max - min;


    axis.forEach(
      (element, index) => {

        const ratio =
          index /
          Math.max(
            axis.length - 1,
            1
          );


        const value =
          max -
          range * ratio;


        element.textContent =
          formatPrice(value);
      }
    );
  }


  /* =========================================================
     ANALYSIS ENGINE
  ========================================================= */

  function updateAnalysis() {

    if (
      state.prices.length < 5
    ) {
      return;
    }


    const prices =
      state.prices;


    const recent =
      prices.slice(
        -5
      );


    const older =
      prices.slice(
        -10,
        -5
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


    let trend =
      "SIDEWAYS";

    let direction =
      "WAIT";


    if (
      recentAverage >
      olderAverage
    ) {

      trend =
        "BULLISH";

      direction =
        "CALL";

    } else if (
      recentAverage <
      olderAverage
    ) {

      trend =
        "BEARISH";

      direction =
        "PUT";
    }


    /* -------------------------------------------------------
       MOMENTUM
    ------------------------------------------------------- */

    const first =
      recent[0];

    const last =
      recent[
        recent.length - 1
      ];


    const change =
      Math.abs(
        last - first
      );


    const relativeChange =
      first !== 0
        ? change /
          Math.abs(first)
        : 0;


    let momentum =
      "LOW";


    if (
      relativeChange >
      0.00005
    ) {

      momentum =
        "ACTIVE";
    }


    if (
      relativeChange >
      0.0002
    ) {

      momentum =
        "STRONG";
    }


    /* -------------------------------------------------------
       CONFIDENCE
    ------------------------------------------------------- */

    let confidence =
      "—";


    if (
      direction !==
      "WAIT"
    ) {

      const difference =
        Math.abs(
          recentAverage -
          olderAverage
        );


      const percentage =
        olderAverage !== 0
          ? (
              difference /
              Math.abs(
                olderAverage
              )
            ) *
            100
          : 0;


      if (
        percentage >
        0.03
      ) {

        confidence =
          "HIGH";

      } else if (
        percentage >
        0.01
      ) {

        confidence =
          "MEDIUM";

      } else {

        confidence =
          "LOW";
      }
    }


    /* -------------------------------------------------------
       UI
    ------------------------------------------------------- */

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
      confidence
    );


    /* -------------------------------------------------------
       AI MESSAGE
    ------------------------------------------------------- */

    const aiMessage =
      $("#ai-message");


    if (aiMessage) {

      if (
        direction ===
        "CALL"
      ) {

        aiMessage.textContent =
          `${state.symbol} is showing upward short-term momentum.`;

      } else if (
        direction ===
        "PUT"
      ) {

        aiMessage.textContent =
          `${state.symbol} is showing downward short-term momentum.`;

      } else {

        aiMessage.textContent =
          `No clear short-term direction is currently detected for ${state.symbol}.`;
      }
    }


    updateSignalClass(
      direction
    );
  }


  function updateSignalClass(
    direction
  ) {

    $$(".signal strong").forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );


        if (
          direction ===
          "CALL"
        ) {

          element.classList.add(
            "buy"
          );

        } else if (
          direction ===
          "PUT"
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


  /* =========================================================
     TRADE LEVELS
  ========================================================= */

  function updateTradeLevels() {

    if (
      state.price === null
    ) {
      return;
    }


    const price =
      state.price;


    const decimals =
      getPrecision(
        price
      );


    /*
      Small illustrative market levels.
      These are NOT broker-generated
      stop-loss/take-profit orders.
    */

    const offset =
      price *
      0.001;


    const entry =
      price;


    const stop =
      price -
      offset;


    const target =
      price +
      offset * 2;


    setText(
      "[data-entry]",
      entry.toFixed(
        decimals
      )
    );


    setText(
      "[data-stop]",
      stop.toFixed(
        decimals
      )
    );


    setText(
      "[data-target]",
      target.toFixed(
        decimals
      )
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

      const value =
        Number(
          stake.value
        );


      if (
        Number.isFinite(value)
      ) {

        riskStake.textContent =
          `${value.toFixed(2)} USD`;

      } else {

        riskStake.textContent =
          "0.00 USD";
      }
    }
  }


  const stakeInput =
    $("#stake");


  if (stakeInput) {

    stakeInput.addEventListener(
      "input",
      updateRisk
    );

    updateRisk();
  }


  /* =========================================================
     LOGIN / SESSION UI
  ========================================================= */

  const loggedOutActions =
    $("#logged-out-actions");

  const accountPanel =
    $("#account-panel");

  const publicNavigation =
    $("#public-navigation");

  const tradingNavigation =
    $("#trading-navigation");

  const tradingWorkspace =
    $("#trading-workspace");


  function setLoggedInUI() {

    state.authenticated =
      true;


    if (
      loggedOutActions
    ) {
      loggedOutActions.hidden =
        true;
    }


    if (
      accountPanel
    ) {
      accountPanel.hidden =
        false;
    }


    if (
      publicNavigation
    ) {
      publicNavigation.hidden =
        true;
    }


    if (
      tradingNavigation
    ) {
      tradingNavigation.hidden =
        false;
    }


    if (
      tradingWorkspace
    ) {
      tradingWorkspace.hidden =
        false;
    }


    const message =
      $(
        "[data-trade-message]"
      );


    if (message) {

      message.textContent =
        "READY TO TRADE";
    }
  }


  function setLoggedOutUI() {

    state.authenticated =
      false;


    if (
      loggedOutActions
    ) {
      loggedOutActions.hidden =
        false;
    }


    if (
      accountPanel
    ) {
      accountPanel.hidden =
        true;
    }


    if (
      publicNavigation
    ) {
      publicNavigation.hidden =
        false;
    }


    if (
      tradingNavigation
    ) {
      tradingNavigation.hidden =
        true;
    }


    if (
      tradingWorkspace
    ) {
      tradingWorkspace.hidden =
        true;
    }
  }


  /* =========================================================
     SESSION CHECK
  ========================================================= */

  async function checkSession() {

    try {

      const response =
        await fetch(
          "/api/session",
          {
            method: "GET",

            credentials:
              "include",

            cache:
              "no-store"
          }
        );


      if (
        !response.ok
      ) {

        setLoggedOutUI();

        return;
      }


      const data =
        await response.json();


      if (
        data &&
        data.authenticated ===
          true
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


  /* =========================================================
     ACCOUNTS
  ========================================================= */

  async function loadAccounts() {

    if (
      !state.authenticated
    ) {
      return;
    }


    try {

      const response =
        await fetch(
          "/api/deriv/accounts",
          {
            credentials:
              "include",

            cache:
              "no-store"
          }
        );


      if (
        response.status ===
        401
      ) {

        setLoggedOutUI();

        return;
      }


      if (
        !response.ok
      ) {

        console.warn(
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


  function getAccountId(
    account
  ) {

    return (
      account.id ||
      account.account_id ||
      account.loginid ||
      account.login ||
      ""
    );
  }


  function populateAccounts() {

    const accountSelect =
      $("#account-select");


    if (!accountSelect) {
      return;
    }


    accountSelect.innerHTML =
      "";


    if (
      state.accounts.length ===
      0
    ) {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        "";


      option.textContent =
        "ACCOUNT";


      accountSelect.appendChild(
        option
      );


      return;
    }


    state.accounts.forEach(
      (account, index) => {

        const option =
          document.createElement(
            "option"
          );


        const id =
          getAccountId(
            account
          );


        const type =
          account.account_type ||
          account.type ||
          "ACCOUNT";


        const currency =
          account.currency ||
          "USD";


        const balance =
          account.balance !==
          undefined
            ? account.balance
            : "";


        option.value =
          id;


        option.textContent =
          `${type} ${
            id ||
            index + 1
          } — ${currency} ${balance}`;


        accountSelect.appendChild(
          option
        );
      }
    );


    selectAccount(
      state.accounts[0]
    );
  }


  function selectAccount(
    account
  ) {

    if (!account) {
      return;
    }


    state.account =
      account;


    const currency =
      account.currency ||
      "USD";


    const balance =
      account.balance !==
      undefined
        ? Number(
            account.balance
          )
        : null;


    if (
      Number.isFinite(
        balance
      )
    ) {

      const formatted =
        `${currency} ${
          balance.toFixed(2)
        }`;


      const accountBalance =
        $("#account-balance");


      if (
        accountBalance
      ) {

        accountBalance.textContent =
          formatted;
      }


      const riskBalance =
        $("#risk-balance");


      if (
        riskBalance
      ) {

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
            (account) =>
              String(
                getAccountId(
                  account
                )
              ) ===
              String(id)
          );


        if (selected) {
          selectAccount(
            selected
          );
        }
      }
    );
  }


  /* =========================================================
     TRADE BUTTONS
  ========================================================= */

  const buyButton =
    $("#buy-button");

  const sellButton =
    $("#sell-button");


  function tradeMessage(
    message
  ) {

    const element =
      $(
        "[data-trade-message]"
      );


    if (element) {

      element.textContent =
        message;
    }
  }


  if (buyButton) {

    buyButton.addEventListener(
      "click",
      () => {

        if (
          !state.authenticated
        ) {

          tradeMessage(
            "LOG IN TO TRADE"
          );

          return;
        }


        if (
          !state.account
        ) {

          tradeMessage(
            "SELECT ACCOUNT"
          );

          return;
        }


        if (
          state.price === null
        ) {

          tradeMessage(
            "WAITING FOR MARKET"
          );

          return;
        }


        tradeMessage(
          `BUY ${state.symbol} — ${formatPrice(
            state.price
          )}`
        );
      }
    );
  }


  if (sellButton) {

    sellButton.addEventListener(
      "click",
      () => {

        if (
          !state.authenticated
        ) {

          tradeMessage(
            "LOG IN TO TRADE"
          );

          return;
        }


        if (
          !state.account
        ) {

          tradeMessage(
            "SELECT ACCOUNT"
          );

          return;
        }


        if (
          state.price === null
        ) {

          tradeMessage(
            "WAITING FOR MARKET"
          );

          return;
        }


        tradeMessage(
          `SELL ${state.symbol} — ${formatPrice(
            state.price
          )}`
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

        tradeMessage(
          "BOT WORKSPACE READY"
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

        tradeMessage(
          "BULK TRADER WORKSPACE READY"
        );
      }
    );
  }


  /* =========================================================
     OAUTH ERROR
  ========================================================= */

  const params =
    new URLSearchParams(
      window.location.search
    );


  const oauthError =
    params.get(
      "oauth_error"
    );


  if (oauthError) {

    console.error(
      "OAUTH ERROR:",
      oauthError
    );
  }


  /* =========================================================
     INITIAL UI
  ========================================================= */

  updateMarketLabels();

  setText(
    "[data-price]",
    "—"
  );

  setText(
    "[data-move]",
    "—"
  );

  marketStatus(
    "CONNECTING"
  );


  /* =========================================================
     START
  ========================================================= */

  checkSession();

  connectMarket();


  /* =========================================================
     CLEANUP
  ========================================================= */

  window.addEventListener(
    "beforeunload",
    () => {

      clearReconnectTimer();

      closeSocket();
    }
  );
});
