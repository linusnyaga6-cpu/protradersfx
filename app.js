document.addEventListener("DOMContentLoaded", () => {

  "use strict";


  /* =====================================================
     STATE
  ====================================================== */

  const state = {

    authenticated: false,

    symbol: "EUR/USD",

    price: null,

    previousPrice: null,

    prices: [],

    websocket: null,

    reconnectTimer: null,

    reconnectAttempts: 0,

    selectedAccount: null,

    accounts: [],

    timeframe: "1m"

  };


  /* =====================================================
     ELEMENTS
  ====================================================== */

  const el = {

    loggedOutActions:
      document.getElementById("logged-out-actions"),

    loggedOutNavigation:
      document.getElementById("logged-out-navigation"),

    loggedInNavigation:
      document.getElementById("logged-in-navigation"),

    accountPanel:
      document.getElementById("account-panel"),

    tradingWorkspace:
      document.getElementById("trading-workspace"),

    footerLogin:
      document.getElementById("footer-login"),

    footerSignup:
      document.getElementById("footer-signup"),

    footerAccount:
      document.getElementById("footer-account"),

    accountSelect:
      document.getElementById("account-select"),

    accountBalance:
      document.getElementById("account-balance"),

    tradeAccount:
      document.getElementById("trade-account"),

    tradeAccountType:
      document.getElementById("trade-account-type"),

    tradeAccountBalance:
      document.getElementById("trade-account-balance"),

    market:
      document.querySelector("[data-market]"),

    marketStatus:
      document.querySelector("[data-market-status]"),

    price:
      document.querySelector("[data-price]"),

    move:
      document.querySelector("[data-move]"),

    chartLine:
      document.querySelector("[data-live-line]"),

    chartMessage:
      document.querySelector("[data-chart-message]"),

    analysisMarkets:
      document.querySelectorAll("[data-analysis-market]"),

    trend:
      document.querySelector("[data-trend]"),

    momentum:
      document.querySelector("[data-momentum]"),

    direction:
      document.querySelector("[data-direction]"),

    signal:
      document.querySelector("[data-signal]"),

    entry:
      document.querySelector("[data-entry]"),

    stop:
      document.querySelector("[data-stop]"),

    target:
      document.querySelector("[data-target]"),

    aiBias:
      document.querySelector("[data-ai-bias]"),

    aiConfidence:
      document.querySelector("[data-ai-confidence]"),

    aiSetup:
      document.querySelector("[data-ai-setup]"),

    aiMessage:
      document.querySelector("[data-ai-message]"),

    tradeMessage:
      document.querySelector("[data-trade-message]"),

    stake:
      document.getElementById("stake"),

    contract:
      document.getElementById("contract-type"),

    buy:
      document.getElementById("buy-button"),

    sell:
      document.getElementById("sell-button"),

    botName:
      document.getElementById("bot-name"),

    botStrategy:
      document.getElementById("bot-strategy"),

    createBot:
      document.getElementById("create-bot"),

    botStatus:
      document.getElementById("bot-status"),

    botCurrentStrategy:
      document.getElementById("bot-current-strategy"),

    bulkStake:
      document.getElementById("bulk-stake"),

    bulkCount:
      document.getElementById("bulk-count"),

    bulkContract:
      document.getElementById("bulk-contract"),

    bulkExecute:
      document.getElementById("bulk-execute"),

    bulkMessage:
      document.getElementById("bulk-message")

  };


  /* =====================================================
     HELPERS
  ====================================================== */

  function show(element) {

    if (element) {
      element.hidden = false;
    }

  }


  function hide(element) {

    if (element) {
      element.hidden = true;
    }

  }


  function setText(element, value) {

    if (element) {
      element.textContent =
        value === undefined ||
        value === null
          ? "—"
          : String(value);
    }

  }


  function formatPrice(price) {

    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(Number(price))
    ) {
      return "—";
    }

    const number =
      Number(price);

    return number >= 100
      ? number.toFixed(3)
      : number.toFixed(5);

  }


  function formatMoney(value, currency = "USD") {

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return "—";
    }

    return `${currency} ${Number(value).toFixed(2)}`;

  }


  /* =====================================================
     AUTH UI
  ====================================================== */

  function setLoggedOutUI() {

    state.authenticated = false;

    show(el.loggedOutActions);
    show(el.loggedOutNavigation);

    hide(el.loggedInNavigation);
    hide(el.accountPanel);
    hide(el.tradingWorkspace);

    show(el.footerLogin);
    show(el.footerSignup);
    hide(el.footerAccount);

    if (el.tradeMessage) {
      el.tradeMessage.textContent =
        "LOG IN TO TRADE";
    }

  }


  function setLoggedInUI() {

    state.authenticated = true;

    /*
      IMPORTANT:
      LOGIN + CREATE ACCOUNT are completely removed
      from the visible header after authentication.
    */

    hide(el.loggedOutActions);
    hide(el.loggedOutNavigation);

    show(el.loggedInNavigation);
    show(el.accountPanel);
    show(el.tradingWorkspace);

    hide(el.footerLogin);
    hide(el.footerSignup);
    show(el.footerAccount);

    if (el.tradeMessage) {
      el.tradeMessage.textContent =
        "READY";
    }

  }


  /* =====================================================
     SESSION CHECK
  ====================================================== */

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
        "SESSION CHECK ERROR:",
        error
      );

      setLoggedOutUI();

    }

  }


  /* =====================================================
     ACCOUNTS
  ====================================================== */

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

      if (!response.ok) {

        console.error(
          "ACCOUNT REQUEST FAILED:",
          response.status
        );

        return;
      }

      const data =
        await response.json();

      const accounts =
        Array.isArray(data.accounts)
          ? data.accounts
          : [];

      state.accounts =
        accounts;

      renderAccounts();

    } catch (error) {

      console.error(
        "ACCOUNT LOAD ERROR:",
        error
      );

    }

  }


  function getAccountId(account) {

    return String(
      account?.id ||
      account?.account_id ||
      account?.loginid ||
      account?.loginId ||
      account?.accountId ||
      ""
    );

  }


  function getAccountType(account) {

    const type =
      String(
        account?.type ||
        account?.account_type ||
        account?.loginid ||
        ""
      ).toUpperCase();

    if (
      type.includes("REAL")
    ) {
      return "REAL";
    }

    if (
      type.includes("DEMO")
    ) {
      return "DEMO";
    }

    if (
      String(
        account?.is_virtual
      ) === "true"
    ) {
      return "DEMO";
    }

    return type || "ACCOUNT";

  }


  function getAccountBalance(account) {

    return (
      account?.balance ??
      account?.available_balance ??
      account?.equity ??
      account?.amount ??
      null
    );

  }


  function getAccountCurrency(account) {

    return (
      account?.currency ||
      "USD"
    );

  }


  function renderAccounts() {

    if (!el.accountSelect) {
      return;
    }

    el.accountSelect.innerHTML = "";

    if (!state.accounts.length) {

      const option =
        document.createElement("option");

      option.value = "";

      option.textContent =
        "NO ACCOUNTS";

      el.accountSelect.appendChild(
        option
      );

      setText(
        el.accountBalance,
        "—"
      );

      return;
    }


    state.accounts.forEach(
      (account, index) => {

        const option =
          document.createElement("option");

        const id =
          getAccountId(account);

        const type =
          getAccountType(account);

        const currency =
          getAccountCurrency(account);

        const balance =
          getAccountBalance(account);

        option.value = id;

        option.textContent =
          `${type} — ${currency} ${
            balance !== null
              ? Number(balance).toFixed(2)
              : "—"
          }`;

        if (
          state.selectedAccount &&
          id ===
            getAccountId(
              state.selectedAccount
            )
        ) {

          option.selected =
            true;

        } else if (
          !state.selectedAccount &&
          index === 0
        ) {

          option.selected =
            true;

          state.selectedAccount =
            account;

        }

        el.accountSelect.appendChild(
          option
        );

      }
    );

    updateSelectedAccount();

  }


  function updateSelectedAccount() {

    const account =
      state.selectedAccount;

    if (!account) {
      return;
    }

    const type =
      getAccountType(account);

    const balance =
      getAccountBalance(account);

    const currency =
      getAccountCurrency(account);

    setText(
      el.accountBalance,
      formatMoney(
        balance,
        currency
      )
    );

    setText(
      el.tradeAccountType,
      type
    );

    setText(
      el.tradeAccountBalance,
      formatMoney(
        balance,
        currency
      )
    );

  }


  if (el.accountSelect) {

    el.accountSelect.addEventListener(
      "change",
      () => {

        const id =
          el.accountSelect.value;

        state.selectedAccount =
          state.accounts.find(
            account =>
              getAccountId(
                account
              ) === id
          ) || null;

        updateSelectedAccount();

      }
    );

  }


  /* =====================================================
     MARKET SYMBOLS
  ====================================================== */

  const symbolMap = {

    "EUR/USD": "frxEURUSD",

    "GBP/USD": "frxGBPUSD",

    "USD/JPY": "frxUSDJPY",

    "AUD/USD": "frxAUDUSD",

    "USD/CAD": "frxUSDCAD",

    "USD/CHF": "frxUSDCHF"

  };


  function selectMarket(symbol) {

    if (
      !symbolMap[symbol]
    ) {
      return;
    }

    state.symbol =
      symbol;

    state.price =
      null;

    state.previousPrice =
      null;

    state.prices =
      [];

    setText(
      el.market,
      symbol
    );

    el.analysisMarkets.forEach(
      item => {
        item.textContent =
          symbol;
      }
    );

    setText(
      el.price,
      "—"
    );

    setText(
      el.move,
      "—"
    );

    document
      .querySelectorAll(
        ".market-item"
      )
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.symbol ===
            symbol
        );

      });

    updateAnalysis();

    connectMarket();

  }


  document
    .querySelectorAll(
      ".market-item"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          selectMarket(
            button.dataset.symbol
          );

        }
      );

    });


  /* =====================================================
     MARKET WEBSOCKET
  ====================================================== */

  function closeSocket() {

    if (
      state.websocket
    ) {

      try {
        state.websocket.close();
      } catch {}

      state.websocket =
        null;

    }

  }


  function websocketUrl() {

    return (
      "wss://ws.derivws.com/websockets/v3"
    );

  }


  function connectMarket() {

    closeSocket();

    if (state.reconnectTimer) {

      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer =
        null;

    }

    setText(
      el.marketStatus,
      "CONNECTING"
    );

    if (el.marketStatus) {
      el.marketStatus.classList.remove(
        "connected"
      );
    }

    try {

      const ws =
        new WebSocket(
          websocketUrl()
        );

      state.websocket =
        ws;


      ws.addEventListener(
        "open",
        () => {

          state.reconnectAttempts =
            0;

          setText(
            el.marketStatus,
            "CONNECTED"
          );

          if (el.marketStatus) {
            el.marketStatus.classList.add(
              "connected"
            );
          }

          setText(
            el.chartMessage,
            "LIVE"
          );

          ws.send(
            JSON.stringify({
              ticks:
                symbolMap[
                  state.symbol
                ],
              subscribe: 1
            })
          );

        }
      );


      ws.addEventListener(
        "message",
        event => {

          try {

            const data =
              JSON.parse(
                event.data
              );

            if (
              data.error
            ) {

              console.error(
                "MARKET ERROR:",
                data.error
              );

              setText(
                el.marketStatus,
                "MARKET ERROR"
              );

              return;
            }

            if (
              data.tick
            ) {

              const quote =
                Number(
                  data.tick.quote
                );

              if (
                Number.isFinite(
                  quote
                )
              ) {

                updatePrice(
                  quote
                );

              }

            }

          } catch (error) {

            console.error(
              "TICK PARSE ERROR:",
              error
            );

          }

        }
      );


      ws.addEventListener(
        "close",
        () => {

          setText(
            el.marketStatus,
            "DISCONNECTED"
          );

          scheduleReconnect();

        }
      );


      ws.addEventListener(
        "error",
        error => {

          console.error(
            "WEBSOCKET ERROR:",
            error
          );

          setText(
            el.marketStatus,
            "CONNECTION ERROR"
          );

        }
      );

    } catch (error) {

      console.error(
        "WEBSOCKET CREATE ERROR:",
        error
      );

      scheduleReconnect();

    }

  }


  function scheduleReconnect() {

    if (
      state.reconnectTimer
    ) {
      return;
    }

    const delay =
      Math.min(
        30000,
        2000 *
          Math.max(
            1,
            state.reconnectAttempts + 1
          )
      );

    state.reconnectAttempts +=
      1;

    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;

          connectMarket();

        },
        delay
      );

  }


  /* =====================================================
     PRICE
  ====================================================== */

  function updatePrice(price) {

    state.previousPrice =
      state.price;

    state.price =
      price;

    state.prices.push(
      price
    );

    if (
      state.prices.length >
      80
    ) {

      state.prices.shift();

    }

    setText(
      el.price,
      formatPrice(price)
    );

    updateMovement();

    drawChart();

    updateAnalysis();

  }


  function updateMovement() {

    if (
      state.price === null ||
      state.previousPrice === null
    ) {

      setText(
        el.move,
        "—"
      );

      return;
    }

    const difference =
      state.price -
      state.previousPrice;

    const percentage =
      state.previousPrice !== 0
        ? (
            difference /
            state.previousPrice
          ) * 100
        : 0;

    const sign =
      difference >= 0
        ? "+"
        : "";

    setText(
      el.move,
      `${sign}${percentage.toFixed(3)}%`
    );

    if (el.move) {

      el.move.classList.toggle(
        "positive",
        difference > 0
      );

      el.move.classList.toggle(
        "negative",
        difference < 0
      );

    }

  }


  /* =====================================================
     CHART
  ====================================================== */

  function drawChart() {

    if (
      !el.chartLine ||
      state.prices.length < 2
    ) {
      return;
    }

    const width =
      1000;

    const height =
      400;

    const padding =
      20;

    const values =
      state.prices;

    const min =
      Math.min(
        ...values
      );

    const max =
      Math.max(
        ...values
      );

    const range =
      max - min || 1;

    const points =
      values
        .map(
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
                  value -
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
        )
        .join(" ");

    el.chartLine.setAttribute(
      "points",
      points
    );

  }


  /* =====================================================
     ANALYSIS ENGINE
  ====================================================== */

  function updateAnalysis() {

    if (
      state.prices.length < 5
    ) {

      setText(
        el.trend,
        "WAIT"
      );

      setText(
        el.momentum,
        "WAIT"
      );

      setText(
        el.direction,
        "—"
      );

      setText(
        el.signal,
        "WAIT"
      );

      setText(
        el.aiBias,
        "WAIT"
      );

      setText(
        el.aiConfidence,
        "—"
      );

      setText(
        el.aiSetup,
        "NO SETUP"
      );

      updateLevels();

      return;
    }


    const prices =
      state.prices;

    const latest =
      prices[
        prices.length - 1
      ];

    const previous =
      prices[
        prices.length - 5
      ];

    const movement =
      latest -
      previous;


    let trend =
      "SIDEWAYS";

    let direction =
      "NEUTRAL";

    let signal =
      "WAIT";


    if (
      movement > 0
    ) {

      trend =
        "BULLISH";

      direction =
        "UP";

      signal =
        "CALL";

    } else if (
      movement < 0
    ) {

      trend =
        "BEARISH";

      direction =
        "DOWN";

      signal =
        "PUT";

    }


    setText(
      el.trend,
      trend
    );

    setText(
      el.momentum,
      movement > 0
        ? "POSITIVE"
        : movement < 0
        ? "NEGATIVE"
        : "NEUTRAL"
    );

    setText(
      el.direction,
      direction
    );

    setText(
      el.signal,
      signal
    );


    setText(
      el.aiBias,
      trend
    );

    setText(
      el.aiConfidence,
      `${Math.min(
        95,
        55 +
          Math.round(
            Math.abs(
              movement /
                previous
            ) *
              100000
          )
      )}%`
    );

    setText(
      el.aiSetup,
      signal === "WAIT"
        ? "NO SETUP"
        : `${signal} SETUP`
    );


    if (el.aiMessage) {

      el.aiMessage.textContent =
        signal === "WAIT"
          ? "Market conditions are currently neutral. Waiting for confirmation."
          : `Current market structure suggests a ${trend.toLowerCase()} bias. Confirm risk before execution.`;

    }


    updateLevels();

  }


  function updateLevels() {

    if (
      state.price === null
    ) {

      setText(
        el.entry,
        "—"
      );

      setText(
        el.stop,
        "—"
      );

      setText(
        el.target,
        "—"
      );

      return;
    }


    const price =
      state.price;

    const decimals =
      price >= 100
        ? 3
        : 5;

    const movement =
      price *
      0.001;


    setText(
      el.entry,
      price.toFixed(
        decimals
      )
    );


    setText(
      el.stop,
      (
        price -
        movement
      ).toFixed(
        decimals
      )
    );


    setText(
      el.target,
      (
        price +
        movement * 2
      ).toFixed(
        decimals
      )
    );

  }


  /* =====================================================
     TIMEFRAMES
  ====================================================== */

  document
    .querySelectorAll(
      ".timeframe"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".timeframe"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          state.timeframe =
            button.dataset.timeframe;

        }
      );

    });


  /* =====================================================
     MANUAL TRADE UI
  ====================================================== */

  function manualTrade(side) {

    if (
      !state.authenticated
    ) {

      if (el.tradeMessage) {
        el.tradeMessage.textContent =
          "LOG IN TO TRADE";
      }

      return;

    }


    const stake =
      Number(
        el.stake?.value
      );

    if (
      !Number.isFinite(
        stake
      ) ||
      stake <= 0
    ) {

      el.tradeMessage.textContent =
        "ENTER A VALID STAKE";

      return;
    }


    const contract =
      el.contract?.value ||
      "CALL";


    /*
      This UI prepares the trade action.
      Actual contract execution should remain
      connected to the authenticated Deriv
      WebSocket/account execution layer.
    */

    el.tradeMessage.textContent =
      `${side} ${contract} — ${stake.toFixed(2)} READY`;

  }


  if (el.buy) {

    el.buy.addEventListener(
      "click",
      () => manualTrade(
        "BUY"
      )
    );

  }


  if (el.sell) {

    el.sell.addEventListener(
      "click",
      () => manualTrade(
        "SELL"
      )
    );

  }


  /* =====================================================
     BOT BUILDER
  ====================================================== */

  if (el.createBot) {

    el.createBot.addEventListener(
      "click",
      () => {

        const name =
          (
            el.botName?.value ||
            "Trading Bot"
          ).trim();

        const strategy =
          el.botStrategy?.value ||
          "trend";

        if (el.botStatus) {

          el.botStatus.textContent =
            "READY";

        }

        if (
          el.botCurrentStrategy
        ) {

          el.botCurrentStrategy.textContent =
            strategy.toUpperCase();

        }

        el.createBot.textContent =
          "BOT CREATED";

        setTimeout(
          () => {

            el.createBot.textContent =
              "CREATE BOT";

          },
          1500
        );

        console.log(
          "BOT CREATED:",
          {
            name,
            strategy
          }
        );

      }
    );

  }


  /* =====================================================
     BULK TRADER
  ====================================================== */

  if (el.bulkExecute) {

    el.bulkExecute.addEventListener(
      "click",
      () => {

        const stake =
          Number(
            el.bulkStake?.value
          );

        const count =
          Number(
            el.bulkCount?.value
          );

        const contract =
          el.bulkContract?.value ||
          "CALL";


        if (
          !Number.isFinite(
            stake
          ) ||
          stake <= 0
        ) {

          el.bulkMessage.textContent =
            "ENTER A VALID STAKE";

          return;

        }


        if (
          !Number.isInteger(
            count
          ) ||
          count < 1 ||
          count > 50
        ) {

          el.bulkMessage.textContent =
            "TRADES MUST BE BETWEEN 1 AND 50";

          return;

        }


        el.bulkMessage.textContent =
          `${count} ${contract} TRADES READY — TOTAL STAKE ${(
            stake *
            count
          ).toFixed(2)}`;

      }
    );

  }


  /* =====================================================
     OAUTH ERROR
  ====================================================== */

  function showOAuthError() {

    const params =
      new URLSearchParams(
        window.location.search
      );

    const error =
      params.get(
        "oauth_error"
      );

    if (!error) {
      return;
    }

    console.error(
      "OAUTH ERROR:",
      error
    );

    if (el.marketStatus) {

      el.marketStatus.textContent =
        "LOGIN ERROR";

    }

  }


  /* =====================================================
     INITIALIZATION
  ====================================================== */

  setLoggedOutUI();

  showOAuthError();

  checkSession();

  connectMarket();


});
