document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX STARTING");

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";


  const state = {
    socket: null,

    connected: false,

    authenticated: false,

    requestedMarket: "EUR/USD",

    symbolName: "EUR/USD",

    symbol: null,

    activeSymbols: [],

    price: null,

    previousPrice: null,

    prices: [],

    requestId: 0,

    reconnectTimer: null,

    reconnectAttempts: 0,

    accounts: [],

    selectedAccount: null,

    destroyed: false
  };


  /* =====================================================
     DOM
  ===================================================== */

  const all = selector =>
    Array.from(
      document.querySelectorAll(selector)
    );


  const one = selector =>
    document.querySelector(selector);


  const setAll = (
    selector,
    value
  ) => {
    all(selector).forEach(
      element => {
        element.textContent = value;
      }
    );
  };


  /* =====================================================
     LOGIN UI
  ===================================================== */

  function showLoggedOutUI() {

    state.authenticated = false;

    const loggedOut =
      one("#logged-out-actions");

    const loggedInHeader =
      one("#logged-in-header");

    const workspace =
      one("#trading-workspace");

    const publicNav =
      one("#public-navigation");


    if (loggedOut) {
      loggedOut.hidden = false;
    }


    if (loggedInHeader) {
      loggedInHeader.hidden = true;
    }


    if (workspace) {
      workspace.hidden = true;
    }


    if (publicNav) {
      publicNav.hidden = false;
    }


    state.accounts = [];

    state.selectedAccount = null;

    const balance =
      one("#account-balance");

    if (balance) {
      balance.textContent = "—";
    }

    const select =
      one("#account-select");

    if (select) {
      select.innerHTML =
        `<option value="">SELECT ACCOUNT</option>`;
    }

    console.log(
      "UI: LOGGED OUT"
    );
  }


  function showLoggedInUI() {

    state.authenticated = true;

    const loggedOut =
      one("#logged-out-actions");

    const loggedInHeader =
      one("#logged-in-header");

    const workspace =
      one("#trading-workspace");

    const publicNav =
      one("#public-navigation");


    if (loggedOut) {
      loggedOut.hidden = true;
    }


    if (loggedInHeader) {
      loggedInHeader.hidden = false;
    }


    if (workspace) {
      workspace.hidden = false;
    }


    if (publicNav) {
      publicNav.hidden = true;
    }


    console.log(
      "UI: LOGGED IN"
    );
  }


  /* =====================================================
     MARKET
  ===================================================== */

  const supportedMarkets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };


  function normaliseMarketName(value) {

    if (!value) {
      return "";
    }

    let text =
      String(value).trim();

    if (
      Object.prototype.hasOwnProperty.call(
        supportedMarkets,
        text
      )
    ) {
      return text;
    }

    text =
      text
        .replace(/^frx/i, "")
        .replace(/[^A-Za-z]/g, "")
        .toUpperCase();

    const pairs = [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "USDCAD",
      "USDCHF"
    ];

    if (pairs.includes(text)) {
      return (
        text.slice(0, 3) +
        "/" +
        text.slice(3, 6)
      );
    }

    return String(value).trim();
  }


  function formatPrice(value) {

    const number =
      Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  }


  function formatMoney(
    value,
    currency = "USD"
  ) {

    const number =
      Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return (
      currency +
      " " +
      number.toFixed(2)
    );
  }


  function updateMarketDisplay() {

    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );
  }


  function setStatus(status) {

    setAll(
      "[data-market-status]",
      status
    );

    console.log(
      "MARKET:",
      status
    );
  }


  /* =====================================================
     CHART
  ===================================================== */

  function updateChart() {

    const line =
      one("[data-live-line]");

    if (
      !line ||
      state.prices.length < 2
    ) {
      return;
    }

    const width = 1000;
    const height = 400;
    const padding = 20;

    const values =
      state.prices.slice(-60);

    const min =
      Math.min(...values);

    const max =
      Math.max(...values);

    const range =
      max - min || 0.00001;

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
            (
              width -
              padding * 2
            );

          const y =
            height -
            padding -
            (
              (value - min) /
              range
            ) *
            (
              height -
              padding * 2
            );

          return (
            x.toFixed(1) +
            "," +
            y.toFixed(1)
          );
        })
        .join(" ");

    line.setAttribute(
      "points",
      points
    );


    const axis =
      all(".chart-axis span");

    axis.forEach(
      (element, index) => {

        const value =
          max -
          (
            (max - min) /
            4
          ) *
          index;

        element.textContent =
          formatPrice(value);
      }
    );
  }


  /* =====================================================
     ANALYSIS
  ===================================================== */

  function updateAnalysis() {

    if (state.prices.length < 5) {
      return;
    }

    const recent =
      state.prices.slice(-5);

    const first =
      recent[0];

    const last =
      recent[recent.length - 1];

    const difference =
      last - first;

    let trend = "NEUTRAL";
    let momentum = "LOW";
    let direction = "—";
    let signal = "WAIT";


    if (difference > 0) {

      trend = "BULLISH";
      momentum = "POSITIVE";
      direction = "UP";

      if (state.prices.length >= 10) {
        signal = "CALL";
      }
    }


    if (difference < 0) {

      trend = "BEARISH";
      momentum = "NEGATIVE";
      direction = "DOWN";

      if (state.prices.length >= 10) {
        signal = "PUT";
      }
    }


    setAll(
      "[data-trend]",
      trend
    );

    setAll(
      "[data-momentum]",
      momentum
    );

    setAll(
      "[data-direction]",
      direction
    );

    setAll(
      "[data-signal]",
      signal
    );


    all("[data-signal]").forEach(
      element => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (signal === "CALL") {
          element.classList.add("buy");
        } else if (signal === "PUT") {
          element.classList.add("sell");
        } else {
          element.classList.add("wait");
        }
      }
    );


    if (state.price !== null) {

      const movement =
        Math.abs(
          difference ||
          state.price * 0.001
        );

      setAll(
        "[data-entry]",
        formatPrice(
          state.price
        )
      );

      setAll(
        "[data-stop]",
        formatPrice(
          state.price - movement
        )
      );

      setAll(
        "[data-target]",
        formatPrice(
          state.price + movement
        )
      );
    }


    if (
      state.authenticated &&
      state.prices.length >= 10
    ) {

      const ai =
        one("#ai-analysis-result");

      if (ai) {

        ai.textContent =
          signal === "CALL"
            ? `${state.symbolName} is showing bullish short-term momentum. Current bias: CALL.`
            : signal === "PUT"
            ? `${state.symbolName} is showing bearish short-term momentum. Current bias: PUT.`
            : `${state.symbolName} is currently neutral. Wait for clearer momentum.`;
      }
    }
  }


  /* =====================================================
     PRICE
  ===================================================== */

  function updatePrice(price) {

    const number =
      Number(price);

    if (!Number.isFinite(number)) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      number;

    state.prices.push(number);

    if (state.prices.length > 100) {
      state.prices.shift();
    }


    setAll(
      "[data-price]",
      formatPrice(number)
    );


    if (
      state.previousPrice !== null &&
      state.previousPrice !== 0
    ) {

      const change =
        (
          (number -
            state.previousPrice) /
          state.previousPrice
        ) *
        100;

      const movement =
        (
          change >= 0
            ? "+"
            : ""
        ) +
        change.toFixed(3) +
        "%";


      setAll(
        "[data-move]",
        movement
      );


      all("[data-move]").forEach(
        element => {

          element.classList.remove(
            "positive",
            "negative"
          );

          element.classList.add(
            change >= 0
              ? "positive"
              : "negative"
          );
        }
      );
    }


    updateChart();

    updateAnalysis();

    setStatus("LIVE");
  }


  /* =====================================================
     RESET
  ===================================================== */

  function resetMarketState() {

    state.price = null;

    state.previousPrice = null;

    state.prices = [];

    state.symbol = null;


    setAll(
      "[data-price]",
      "—"
    );

    setAll(
      "[data-move]",
      "—"
    );

    setAll(
      "[data-signal]",
      "WAIT"
    );

    setAll(
      "[data-trend]",
      "WAIT"
    );

    setAll(
      "[data-momentum]",
      "WAIT"
    );

    setAll(
      "[data-direction]",
      "—"
    );

    setAll(
      "[data-entry]",
      "—"
    );

    setAll(
      "[data-stop]",
      "—"
    );

    setAll(
      "[data-target]",
      "—"
    );


    const line =
      one("[data-live-line]");

    if (line) {
      line.setAttribute(
        "points",
        ""
      );
    }
  }


  /* =====================================================
     SYMBOL
  ===================================================== */

  function findSymbol(
    requested
  ) {

    const wanted =
      normaliseMarketName(
        requested
      )
      .replace(
        /[^A-Za-z]/g,
        ""
      )
      .toUpperCase();


    return (
      state.activeSymbols.find(
        item => {

          const name =
            String(
              item.underlying_symbol_name ||
              item.display_name ||
              ""
            )
            .replace(
              /[^A-Za-z]/g,
              ""
            )
            .toUpperCase();

          return name === wanted;
        }
      ) ||
      state.activeSymbols.find(
        item => {

          const symbol =
            String(
              item.underlying_symbol ||
              ""
            )
            .replace(/^frx/i, "")
            .replace(
              /[^A-Za-z]/g,
              ""
            )
            .toUpperCase();

          return symbol === wanted;
        }
      ) ||
      null
    );
  }


  /* =====================================================
     ACTIVE SYMBOLS
  ===================================================== */

  function requestActiveSymbols() {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief",
        req_id:
          ++state.requestId
      })
    );

    setStatus(
      "LOADING MARKETS"
    );
  }


  function subscribeToMarket() {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }


    const market =
      findSymbol(
        state.requestedMarket
      );


    if (!market) {

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }


    state.symbol =
      market.underlying_symbol;

    state.symbolName =
      market.underlying_symbol_name ||
      state.requestedMarket;


    updateMarketDisplay();


    try {

      state.socket.send(
        JSON.stringify({
          forget_all: "ticks",
          req_id:
            ++state.requestId
        })
      );

    } catch {}


    state.socket.send(
      JSON.stringify({
        ticks:
          state.symbol,

        subscribe: 1,

        req_id:
          ++state.requestId
      })
    );


    setStatus(
      "WAITING FOR DATA"
    );
  }


  /* =====================================================
     MARKET BUTTONS
  ===================================================== */

  function setupMarketButtons() {

    all("[data-symbol]").forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const market =
              normaliseMarketName(
                button.dataset.symbol ||
                button.textContent
              );

            state.requestedMarket =
              market;

            state.symbolName =
              market;


            resetMarketState();

            updateMarketDisplay();


            all("[data-symbol]")
              .forEach(
                item => {

                  item.classList.toggle(
                    "active",
                    normaliseMarketName(
                      item.dataset.symbol ||
                      item.textContent
                    ) === market
                  );
                }
              );


            if (
              state.connected &&
              state.activeSymbols.length
            ) {
              subscribeToMarket();
            }
          }
        );
      }
    );
  }


  /* =====================================================
     TIMEFRAMES
  ===================================================== */

  function setupTimeframes() {

    all("[data-timeframe]").forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            all("[data-timeframe]")
              .forEach(
                item =>
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


  /* =====================================================
     ACCOUNTS
  ===================================================== */

  function updateAccountDisplay() {

    const balance =
      one("#account-balance");

    const tradeType =
      one("#trade-account-type");

    const tradeBalance =
      one("#trade-account-balance");

    const riskAccount =
      one("#risk-account");


    if (!state.selectedAccount) {

      if (balance) {
        balance.textContent = "—";
      }

      if (tradeType) {
        tradeType.textContent = "—";
      }

      if (tradeBalance) {
        tradeBalance.textContent = "—";
      }

      if (riskAccount) {
        riskAccount.textContent = "—";
      }

      return;
    }


    const account =
      state.selectedAccount;


    const type =
      String(
        account.account_type || ""
      ).toLowerCase();


    const label =
      type === "real"
        ? "REAL"
        : "DEMO";


    const money =
      formatMoney(
        account.balance,
        account.currency || "USD"
      );


    const select =
      one("#account-select");

    if (select) {
      select.value =
        account.account_id;
    }


    if (balance) {
      balance.textContent =
        money;
    }


    if (tradeType) {
      tradeType.textContent =
        label;
    }


    if (tradeBalance) {
      tradeBalance.textContent =
        money;
    }


    if (riskAccount) {
      riskAccount.textContent =
        label;
    }
  }


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


      if (response.status === 401) {
        showLoggedOutUI();
        return;
      }


      if (!response.ok) {
        throw new Error(
          "Account request failed"
        );
      }


      const data =
        await response.json();


      state.accounts =
        Array.isArray(data.accounts)
          ? data.accounts
          : [];


      const select =
        one("#account-select");


      if (select) {

        select.innerHTML =
          `<option value="">SELECT ACCOUNT</option>`;


        state.accounts.forEach(
          account => {

            const option =
              document.createElement(
                "option"
              );

            const type =
              String(
                account.account_type || ""
              ).toLowerCase();

            const label =
              type === "real"
                ? "REAL"
                : "DEMO";


            option.value =
              account.account_id;

            option.textContent =
              `${label} — ${formatMoney(
                account.balance,
                account.currency || "USD"
              )}`;


            select.appendChild(
              option
            );
          }
        );
      }


      if (!state.accounts.length) {
        return;
      }


      state.selectedAccount =
        state.accounts.find(
          account =>
            String(
              account.account_type || ""
            ).toLowerCase() ===
            "real"
        ) ||
        state.accounts.find(
          account =>
            String(
              account.account_type || ""
            ).toLowerCase() ===
            "demo"
        ) ||
        state.accounts[0];


      updateAccountDisplay();


    } catch (error) {

      console.error(
        "ACCOUNT ERROR:",
        error
      );
    }
  }


  function setupAccountSelector() {

    const select =
      one("#account-select");

    if (!select) {
      return;
    }


    select.addEventListener(
      "change",
      () => {

        const account =
          state.accounts.find(
            item =>
              String(
                item.account_id
              ) ===
              String(
                select.value
              )
          );


        if (!account) {
          return;
        }


        state.selectedAccount =
          account;


        updateAccountDisplay();

        updateRisk();
      }
    );
  }


  /* =====================================================
     SESSION
  ===================================================== */

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


      const data =
        await response.json();


      if (
        data &&
        data.authenticated === true
      ) {

        showLoggedInUI();

        await loadAccounts();

        return true;
      }


      showLoggedOutUI();

      return false;


    } catch (error) {

      console.error(
        "SESSION ERROR:",
        error
      );

      showLoggedOutUI();

      return false;
    }
  }


  /* =====================================================
     MANUAL TRADING
  ===================================================== */

  function tradeMessage(message) {

    const element =
      one(
        "[data-trade-message]"
      );

    if (element) {
      element.textContent =
        message;
    }
  }


  async function executeTrade(
    contractType
  ) {

    if (!state.authenticated) {

      tradeMessage(
        "LOGIN REQUIRED"
      );

      return;
    }


    if (!state.selectedAccount) {

      tradeMessage(
        "SELECT AN ACCOUNT"
      );

      return;
    }


    if (!state.symbol) {

      tradeMessage(
        "MARKET DATA NOT READY"
      );

      return;
    }


    const stake =
      Number(
        one("#stake")?.value
      );


    const duration =
      Number(
        one("#duration")?.value || 5
      );


    const durationUnit =
      one("#duration-unit")?.value ||
      "m";


    if (
      !Number.isFinite(stake) ||
      stake <= 0
    ) {

      tradeMessage(
        "ENTER A VALID STAKE"
      );

      return;
    }


    tradeMessage(
      "REQUESTING PRICE..."
    );


    try {

      const proposalResponse =
        await fetch(
          "/api/deriv/trade/proposal",
          {
            method: "POST",

            credentials: "include",

            headers: {
              "content-type":
                "application/json"
            },

            body:
              JSON.stringify({
                accountId:
                  state.selectedAccount.account_id,

                symbol:
                  state.symbol,

                contractType,

                amount:
                  stake,

                duration,

                durationUnit,

                currency:
                  state.selectedAccount.currency ||
                  "USD"
              })
          }
        );


      const proposalData =
        await proposalResponse.json();


      if (!proposalResponse.ok) {

        throw new Error(
          proposalData.error ||
          "PROPOSAL FAILED"
        );
      }


      const proposal =
        proposalData.proposal;


      const proposalId =
        proposal?.id ||
        proposal?.proposal_id;


      const askPrice =
        Number(
          proposal?.ask_price ||
          proposal?.display_value ||
          stake
        );


      if (!proposalId) {
        throw new Error(
          "NO PROPOSAL ID"
        );
      }


      tradeMessage(
        "EXECUTING TRADE..."
      );


      const buyResponse =
        await fetch(
          "/api/deriv/trade/buy",
          {
            method: "POST",

            credentials: "include",

            headers: {
              "content-type":
                "application/json"
            },

            body:
              JSON.stringify({
                accountId:
                  state.selectedAccount.account_id,

                proposalId,

                price:
                  askPrice
              })
          }
        );


      const buyData =
        await buyResponse.json();


      if (!buyResponse.ok) {

        throw new Error(
          buyData.error ||
          "TRADE FAILED"
        );
      }


      tradeMessage(
        "TRADE EXECUTED"
      );


      console.log(
        "TRADE SUCCESS:",
        buyData
      );


    } catch (error) {

      console.error(
        "TRADE ERROR:",
        error
      );

      tradeMessage(
        error.message ||
        "TRADE FAILED"
      );
    }
  }


  function setupTradingButtons() {

    const buy =
      one("#buy-button");

    const sell =
      one("#sell-button");


    if (buy) {

      buy.addEventListener(
        "click",
        () =>
          executeTrade("CALL")
      );
    }


    if (sell) {

      sell.addEventListener(
        "click",
        () =>
          executeTrade("PUT")
      );
    }
  }


  /* =====================================================
     AI ANALYSIS
  ===================================================== */

  function setupAI() {

    const button =
      one("#ai-analysis-button");

    if (!button) {
      return;
    }


    button.addEventListener(
      "click",
      () => {

        if (!state.authenticated) {
          return;
        }


        if (state.prices.length < 10) {

          const result =
            one(
              "#ai-analysis-result"
            );

          if (result) {
            result.textContent =
              "Waiting for more live market data.";
          }

          return;
        }


        updateAnalysis();

        button.textContent =
          "ANALYSIS UPDATED";


        setTimeout(
          () => {
            button.textContent =
              "RUN ANALYSIS";
          },
          1500
        );
      }
    );
  }


  /* =====================================================
     RISK
  ===================================================== */

  function updateRisk() {

    const stake =
      Number(
        one("#stake")?.value
      );


    const riskStake =
      one("#risk-stake");

    const riskStatus =
      one("#risk-status");


    if (riskStake) {

      riskStake.textContent =
        Number.isFinite(stake)
          ? stake.toFixed(2)
          : "—";
    }


    if (riskStatus) {

      riskStatus.textContent =
        stake > 5
          ? "HIGH"
          : stake > 2
          ? "MODERATE"
          : "LOW";
    }
  }


  /* =====================================================
     DERIV MARKET SOCKET
  ===================================================== */

  function handleMessage(event) {

    let data;

    try {

      data =
        JSON.parse(
          event.data
        );

    } catch {
      return;
    }


    if (data.error) {

      console.error(
        "DERIV:",
        data.error
      );

      setStatus(
        "MARKET ERROR"
      );

      return;
    }


    if (
      data.msg_type ===
      "active_symbols"
    ) {

      state.activeSymbols =
        Array.isArray(
          data.active_symbols
        )
          ? data.active_symbols
          : [];


      subscribeToMarket();

      return;
    }


    if (
      data.msg_type === "tick" &&
      data.tick
    ) {

      updatePrice(
        data.tick.quote
      );
    }
  }


  function scheduleReconnect() {

    if (
      state.destroyed ||
      state.reconnectTimer
    ) {
      return;
    }


    state.reconnectAttempts += 1;


    const delay =
      Math.min(
        3000 *
        state.reconnectAttempts,
        15000
      );


    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;

          connectToDeriv();

        },
        delay
      );
  }


  function connectToDeriv() {

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


    setStatus(
      "CONNECTING"
    );


    let socket;


    try {

      socket =
        new WebSocket(
          DERIV_PUBLIC_WS
        );

    } catch {

      setStatus(
        "OFFLINE"
      );

      scheduleReconnect();

      return;
    }


    state.socket =
      socket;


    socket.addEventListener(
      "open",
      () => {

        state.connected =
          true;

        state.reconnectAttempts =
          0;

        requestActiveSymbols();
      }
    );


    socket.addEventListener(
      "message",
      handleMessage
    );


    socket.addEventListener(
      "error",
      () => {

        state.connected =
          false;

        setStatus(
          "OFFLINE"
        );
      }
    );


    socket.addEventListener(
      "close",
      () => {

        state.connected =
          false;

        if (
          !state.destroyed
        ) {

          setStatus(
            "RECONNECTING"
          );

          scheduleReconnect();
        }
      }
    );
  }


  /* =====================================================
     OAUTH RESULT
  ===================================================== */

  function handleOAuthResult() {

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


    tradeMessage(
      "DERIV LOGIN FAILED"
    );


    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }


  /* =====================================================
     INITIALISE
  ===================================================== */

  async function initialise() {

    updateMarketDisplay();

    showLoggedOutUI();

    setupMarketButtons();

    setupTimeframes();

    setupAccountSelector();

    setupTradingButtons();

    setupAI();

    handleOAuthResult();


    const stake =
      one("#stake");

    if (stake) {
      stake.addEventListener(
        "input",
        updateRisk
      );
    }


    await checkSession();


    connectToDeriv();
  }


  initialise();


  /* =====================================================
     CLEANUP
  ===================================================== */

  window.addEventListener(
    "beforeunload",
    () => {

      state.destroyed =
        true;


      if (state.reconnectTimer) {
        clearTimeout(
          state.reconnectTimer
        );
      }


      if (state.socket) {

        try {
          state.socket.close();
        } catch {}
      }
    }
  );

});
