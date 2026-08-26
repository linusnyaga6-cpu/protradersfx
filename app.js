document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX STARTING");

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const state = {
    socket: null,
    connected: false,

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

    authenticated: false,
    sessionExpiresAt: null,

    accounts: [],
    selectedAccount: null,

    destroyed: false
  };


  /* =========================================================
     DOM
  ========================================================= */

  const all = (selector) =>
    Array.from(
      document.querySelectorAll(selector)
    );


  const one = (selector) =>
    document.querySelector(selector);


  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };


  /* =========================================================
     STATUS
  ========================================================= */

  const setStatus = (status) => {

    setAll(
      "[data-market-status]",
      status
    );

    console.log(
      "MARKET:",
      status
    );
  };


  const setTradeMessage = (message) => {

    const element =
      one("[data-trade-message]");

    if (element) {
      element.textContent = message;
    }
  };


  /* =========================================================
     MARKET
  ========================================================= */

  const supportedMarkets = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
  };


  const normaliseMarketName = (value) => {

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
        text.substring(0, 3) +
        "/" +
        text.substring(3, 6)
      );
    }

    return String(value).trim();
  };


  const formatPrice = (price) => {

    const number =
      Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  };


  const formatMoney = (
    balance,
    currency = "USD"
  ) => {

    const number =
      Number(balance);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return (
      currency +
      " " +
      number.toFixed(2)
    );
  };


  const updateMarketDisplay = () => {

    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );
  };


  /* =========================================================
     CHART
  ========================================================= */

  const updateChart = () => {

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

    if (axis.length >= 5) {

      axis.forEach(
        (element, index) => {

          const value =
            max -
            (
              (
                max - min
              ) / 4
            ) *
            index;

          element.textContent =
            formatPrice(value);
        }
      );
    }
  };


  /* =========================================================
     ANALYSIS
  ========================================================= */

  const updateAnalysis = () => {

    if (
      state.prices.length < 5
    ) {
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
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (signal === "CALL") {

          element.classList.add(
            "buy"
          );

        } else if (signal === "PUT") {

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


    if (state.price !== null) {

      const movement =
        Math.abs(
          difference ||
          state.price * 0.001
        );

      setAll(
        "[data-entry]",
        formatPrice(state.price)
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


      /* AI DISPLAY */

      setAll(
        "[data-ai-bias]",
        trend === "NEUTRAL"
          ? "WAIT"
          : trend
      );

      setAll(
        "[data-ai-confidence]",
        state.prices.length >= 20
          ? "HIGH"
          : "BUILDING"
      );

      setAll(
        "[data-ai-setup]",
        signal
      );

      const aiMessage =
        one("[data-ai-message]");

      if (aiMessage) {

        aiMessage.textContent =
          signal === "CALL"
            ? "Bullish market structure detected."
            : signal === "PUT"
            ? "Bearish market structure detected."
            : "Waiting for a clearer market setup.";
      }
    }
  };


  /* =========================================================
     PRICE
  ========================================================= */

  const updatePrice = (price) => {

    const numericPrice =
      Number(price);

    if (
      !Number.isFinite(
        numericPrice
      )
    ) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price =
      numericPrice;

    state.prices.push(
      numericPrice
    );

    if (
      state.prices.length > 100
    ) {
      state.prices.shift();
    }


    setAll(
      "[data-price]",
      formatPrice(
        numericPrice
      )
    );


    if (
      state.previousPrice !== null &&
      state.previousPrice !== 0
    ) {

      const change =
        (
          (
            numericPrice -
            state.previousPrice
          ) /
          state.previousPrice
        ) *
        100;

      const move =
        (
          change >= 0
            ? "+"
            : ""
        ) +
        change.toFixed(3) +
        "%";

      setAll(
        "[data-move]",
        move
      );


      all("[data-move]").forEach(
        (element) => {

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
  };


  /* =========================================================
     RESET
  ========================================================= */

  const resetMarketState = () => {

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
  };


  /* =========================================================
     FIND SYMBOL
  ========================================================= */

  const findSymbol = (
    requestedMarket
  ) => {

    const wanted =
      normaliseMarketName(
        requestedMarket
      )
      .replace(
        /[^A-Za-z]/g,
        ""
      )
      .toUpperCase();


    if (
      !Array.isArray(
        state.activeSymbols
      )
    ) {
      return null;
    }


    const byName =
      state.activeSymbols.find(
        (item) => {

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
      );


    if (
      byName &&
      byName.underlying_symbol
    ) {
      return byName;
    }


    const bySymbol =
      state.activeSymbols.find(
        (item) => {

          const symbol =
            String(
              item.underlying_symbol ||
              ""
            )
            .replace(
              /^frx/i,
              ""
            )
            .replace(
              /[^A-Za-z]/g,
              ""
            )
            .toUpperCase();

          return symbol === wanted;
        }
      );


    if (
      bySymbol &&
      bySymbol.underlying_symbol
    ) {
      return bySymbol;
    }


    return null;
  };


  /* =========================================================
     ACTIVE SYMBOLS
  ========================================================= */

  const requestActiveSymbols = () => {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }

    setStatus(
      "LOADING MARKETS"
    );

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief",
        req_id: ++state.requestId
      })
    );
  };


  /* =========================================================
     SUBSCRIBE
  ========================================================= */

  const subscribeToMarket = () => {

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

      console.error(
        "MARKET NOT FOUND:",
        state.requestedMarket
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }


    const derivSymbol =
      market.underlying_symbol;


    if (
      typeof derivSymbol !==
      "string" ||
      !derivSymbol.trim()
    ) {

      setStatus(
        "SYMBOL ERROR"
      );

      return;
    }


    state.symbol =
      derivSymbol.trim();

    state.symbolName =
      market.underlying_symbol_name ||
      state.requestedMarket;


    updateMarketDisplay();


    try {

      state.socket.send(
        JSON.stringify({
          forget_all: "ticks",
          req_id: ++state.requestId
        })
      );

    } catch (error) {

      console.warn(
        "FORGET TICKS FAILED:",
        error
      );
    }


    try {

      state.socket.send(
        JSON.stringify({
          ticks: state.symbol,
          subscribe: 1,
          req_id: ++state.requestId
        })
      );

      setStatus(
        "WAITING FOR DATA"
      );

    } catch (error) {

      console.error(
        "TICK SUBSCRIPTION FAILED:",
        error
      );

      setStatus(
        "MARKET ERROR"
      );
    }
  };


  /* =========================================================
     CHANGE MARKET
  ========================================================= */

  const setMarket = (value) => {

    const marketName =
      normaliseMarketName(
        value
      );

    if (!marketName) {
      return;
    }

    state.requestedMarket =
      marketName;

    state.symbolName =
      marketName;

    resetMarketState();
    updateMarketDisplay();


    all("[data-symbol]").forEach(
      (button) => {

        const buttonMarket =
          normaliseMarketName(
            button.dataset.symbol ||
            button.textContent
          );

        button.classList.toggle(
          "active",
          buttonMarket === marketName
        );
      }
    );


    if (
      state.connected &&
      state.activeSymbols.length
    ) {
      subscribeToMarket();
    }
  };


  /* =========================================================
     MARKET BUTTONS
  ========================================================= */

  const setupMarketButtons = () => {

    all("[data-symbol]").forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            setMarket(
              button.dataset.symbol ||
              button.textContent
            );
          }
        );
      }
    );
  };


  /* =========================================================
     TIMEFRAMES
  ========================================================= */

  const setupTimeframes = () => {

    all("[data-timeframe]").forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            all("[data-timeframe]").forEach(
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
  };


  /* =========================================================
     AUTH UI
  ========================================================= */

  const showLoggedInUI = () => {

    state.authenticated = true;


    const loggedOut =
      one("#logged-out-actions");

    const accountPanel =
      one("#account-panel");

    const navigation =
      one("#logged-in-navigation");

    const workspace =
      one("#authenticated-workspace");

    const loggedOutMarket =
      one("#logged-out-market");


    if (loggedOut) {
      loggedOut.hidden = true;
      loggedOut.style.display = "none";
    }


    if (accountPanel) {
      accountPanel.hidden = false;
      accountPanel.style.display = "";
    }


    if (navigation) {
      navigation.hidden = false;
      navigation.style.display = "flex";
    }


    if (workspace) {
      workspace.hidden = false;
      workspace.style.display = "";
    }


    if (loggedOutMarket) {
      loggedOutMarket.hidden = true;
      loggedOutMarket.style.display = "none";
    }


    console.log(
      "UI: LOGGED IN"
    );
  };


  const showLoggedOutUI = () => {

    state.authenticated = false;
    state.accounts = [];
    state.selectedAccount = null;


    const loggedOut =
      one("#logged-out-actions");

    const accountPanel =
      one("#account-panel");

    const navigation =
      one("#logged-in-navigation");

    const workspace =
      one("#authenticated-workspace");

    const loggedOutMarket =
      one("#logged-out-market");


    if (loggedOut) {
      loggedOut.hidden = false;
      loggedOut.style.display = "flex";
    }


    if (accountPanel) {
      accountPanel.hidden = true;
      accountPanel.style.display = "none";
    }


    if (navigation) {
      navigation.hidden = true;
      navigation.style.display = "none";
    }


    if (workspace) {
      workspace.hidden = true;
      workspace.style.display = "none";
    }


    if (loggedOutMarket) {
      loggedOutMarket.hidden = false;
      loggedOutMarket.style.display = "";
    }


    const tradeAccount =
      one("#trade-account");

    if (tradeAccount) {
      tradeAccount.hidden = true;
    }


    console.log(
      "UI: LOGGED OUT"
    );
  };


  /* =========================================================
     ACCOUNT DISPLAY
  ========================================================= */

  const updateAccountDisplay = () => {

    const select =
      one("#account-select");

    const balance =
      one("#account-balance");

    const tradeAccount =
      one("#trade-account");

    const tradeType =
      one("#trade-account-type");

    const tradeBalance =
      one("#trade-account-balance");


    if (!state.selectedAccount) {

      if (balance) {
        balance.textContent = "—";
      }

      if (tradeAccount) {
        tradeAccount.hidden = true;
      }

      return;
    }


    const account =
      state.selectedAccount;


    const type =
      String(
        account.account_type ||
        ""
      ).toLowerCase();


    const label =
      type === "real"
        ? "REAL"
        : "DEMO";


    const money =
      formatMoney(
        account.balance,
        account.currency ||
        "USD"
      );


    if (select) {
      select.value =
        account.account_id;
    }


    if (balance) {
      balance.textContent =
        money;
    }


    if (tradeAccount) {
      tradeAccount.hidden = false;
    }


    if (tradeType) {
      tradeType.textContent =
        label;
    }


    if (tradeBalance) {
      tradeBalance.textContent =
        money;
    }
  };


  /* =========================================================
     LOAD ACCOUNTS
  ========================================================= */

  const loadAccounts = async () => {

    try {

      const response =
        await fetch(
          "/api/deriv/accounts",
          {
            method: "GET",
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
          "Accounts request failed: " +
          response.status
        );
      }


      const data =
        await response.json();


      const accounts =
        Array.isArray(
          data.accounts
        )
          ? data.accounts
          : [];


      state.accounts =
        accounts;


      const select =
        one("#account-select");


      if (select) {

        select.innerHTML = "";


        accounts.forEach(
          (account) => {

            const option =
              document.createElement(
                "option"
              );


            const type =
              String(
                account.account_type ||
                ""
              ).toLowerCase();


            const label =
              type === "real"
                ? "REAL"
                : "DEMO";


            option.value =
              account.account_id;


            option.textContent =
              label +
              " — " +
              formatMoney(
                account.balance,
                account.currency ||
                "USD"
              );


            select.appendChild(
              option
            );
          }
        );
      }


      if (!accounts.length) {

        setTradeMessage(
          "NO DERIV ACCOUNTS FOUND"
        );

        return;
      }


      let preferred =
        accounts.find(
          (account) =>
            String(
              account.account_type ||
              ""
            ).toLowerCase() ===
            "real"
        );


      if (!preferred) {

        preferred =
          accounts.find(
            (account) =>
              String(
                account.account_type ||
                ""
              ).toLowerCase() ===
              "demo"
          );
      }


      state.selectedAccount =
        preferred ||
        accounts[0];


      updateAccountDisplay();


      setTradeMessage(
        "ACCOUNT READY"
      );


    } catch (error) {

      console.error(
        "ACCOUNT LOAD ERROR:",
        error
      );

      setTradeMessage(
        "ACCOUNT INFORMATION UNAVAILABLE"
      );
    }
  };


  /* =========================================================
     ACCOUNT SELECTOR
  ========================================================= */

  const setupAccountSelector = () => {

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
            (item) =>
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


        const type =
          String(
            account.account_type ||
            ""
          ).toUpperCase();


        setTradeMessage(
          type +
          " ACCOUNT SELECTED"
        );
      }
    );
  };


  /* =========================================================
     SESSION
  ========================================================= */

  const checkSession = async () => {

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
        throw new Error(
          "Session request failed"
        );
      }


      const data =
        await response.json();


      if (
        data &&
        data.authenticated === true
      ) {

        state.authenticated =
          true;

        state.sessionExpiresAt =
          data.expiresAt ||
          null;


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
  };


  /* =========================================================
     LOGIN
  ========================================================= */

  const goToLogin = () => {

    window.location.href =
      "/api/deriv/login";
  };


  /* =========================================================
     TRADING
  ========================================================= */

  const handleTradeAttempt = (
    side,
    stakeInput,
    contractInput
  ) => {

    if (!state.authenticated) {

      setTradeMessage(
        "LOGIN REQUIRED"
      );

      goToLogin();

      return;
    }


    const stakeValue =
      Number(
        stakeInput
          ? stakeInput.value
          : 0
      );


    const contractType =
      contractInput
        ? contractInput.value
        : "CALL";


    if (
      !Number.isFinite(
        stakeValue
      ) ||
      stakeValue <= 0
    ) {

      setTradeMessage(
        "ENTER A VALID STAKE"
      );

      return;
    }


    if (!state.symbol) {

      setTradeMessage(
        "MARKET DATA NOT READY"
      );

      return;
    }


    if (!state.selectedAccount) {

      setTradeMessage(
        "SELECT AN ACCOUNT"
      );

      return;
    }


    const accountType =
      String(
        state.selectedAccount.account_type ||
        ""
      ).toUpperCase();


    console.log(
      "TRADE REQUEST:",
      {
        side,
        stake: stakeValue,
        contract: contractType,
        symbol: state.symbol,
        accountId:
          state.selectedAccount.account_id
      }
    );


    setTradeMessage(
      accountType +
      " ACCOUNT — " +
      side +
      " READY"
    );


    setAll(
      "[data-risk-stake]",
      formatMoney(
        stakeValue,
        "USD"
      )
    );
  };


  const setupTradingButtons = () => {

    const buy =
      one("#buy-button");

    const sell =
      one("#sell-button");

    const stake =
      one("#stake");

    const contract =
      one("#contract-type");


    if (buy) {

      buy.addEventListener(
        "click",
        () => {

          handleTradeAttempt(
            "BUY",
            stake,
            contract
          );
        }
      );
    }


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          handleTradeAttempt(
            "SELL",
            stake,
            contract
          );
        }
      );
    }
  };


  /* =========================================================
     BOT UI
  ========================================================= */

  const setupBotBuilder = () => {

    const button =
      one("#create-bot-button");

    const message =
      one("#bot-message");

    if (!button) {
      return;
    }


    button.addEventListener(
      "click",
      () => {

        if (!state.authenticated) {
          goToLogin();
          return;
        }

        const name =
          one("#bot-name")?.value.trim();

        const strategy =
          one("#bot-strategy")?.value;

        if (!name) {

          if (message) {
            message.textContent =
              "ENTER BOT NAME";
          }

          return;
        }


        if (message) {
          message.textContent =
            `${name} — ${strategy.toUpperCase()} BOT READY`;
        }
      }
    );
  };


  /* =========================================================
     BULK TRADER
  ========================================================= */

  const setupBulkTrader = () => {

    const button =
      one("#bulk-trade-button");

    const message =
      one("#bulk-message");

    if (!button) {
      return;
    }


    button.addEventListener(
      "click",
      () => {

        if (!state.authenticated) {
          goToLogin();
          return;
        }


        const stake =
          Number(
            one("#bulk-stake")?.value
          );

        const count =
          Number(
            one("#bulk-count")?.value
          );


        if (
          !Number.isFinite(stake) ||
          stake <= 0 ||
          !Number.isFinite(count) ||
          count < 1
        ) {

          if (message) {
            message.textContent =
              "ENTER VALID BULK SETTINGS";
          }

          return;
        }


        if (message) {

          message.textContent =
            `${count} TRADES PREPARED`;
        }
      }
    );
  };


  /* =========================================================
     DERIV MESSAGE
  ========================================================= */

  const handleMessage = (event) => {

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
        "DERIV ERROR:",
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
      data.msg_type ===
      "tick" &&
      data.tick
    ) {

      const tick =
        data.tick;


      if (
        state.symbol &&
        tick.symbol &&
        String(
          tick.symbol
        ) !==
        String(
          state.symbol
        )
      ) {
        return;
      }


      if (
        tick.quote !==
        undefined
      ) {

        updatePrice(
          tick.quote
        );
      }
    }
  };


  /* =========================================================
     RECONNECT
  ========================================================= */

  const scheduleReconnect = () => {

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
  };


  /* =========================================================
     CONNECT DERIV
  ========================================================= */

  const connectToDeriv = () => {

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

    } catch (error) {

      console.error(
        "WEBSOCKET ERROR:",
        error
      );

      state.connected =
        false;

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

        if (
          state.socket !==
          socket
        ) {
          return;
        }


        state.connected =
          true;

        state.reconnectAttempts =
          0;


        console.log(
          "DERIV MARKET DATA CONNECTED"
        );


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

        if (
          state.socket ===
          socket
        ) {
          state.socket =
            null;
        }


        state.connected =
          false;


        if (!state.destroyed) {

          setStatus(
            "RECONNECTING"
          );

          scheduleReconnect();
        }
      }
    );
  };


  /* =========================================================
     OAUTH RESULT
  ========================================================= */

  const handleOAuthResult = () => {

    const params =
      new URLSearchParams(
        window.location.search
      );


    const oauthError =
      params.get(
        "oauth_error"
      );


    if (!oauthError) {
      return;
    }


    console.error(
      "OAUTH ERROR:",
      oauthError
    );


    const notice =
      document.createElement(
        "div"
      );


    notice.id =
      "protraders-notice";


    notice.textContent =
      "Deriv authentication was not completed. Please try again.";


    document.body.appendChild(
      notice
    );


    setTimeout(
      () => {
        notice.remove();
      },
      6000
    );


    const cleanUrl =
      window.location.origin +
      window.location.pathname;


    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );
  };


  /* =========================================================
     INITIALISE
  ========================================================= */

  const initialise = async () => {

    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";


    updateMarketDisplay();


    setAll(
      "[data-price]",
      "—"
    );

    setAll(
      "[data-move]",
      "—"
    );


    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();
    setupAccountSelector();
    setupBotBuilder();
    setupBulkTrader();


    handleOAuthResult();


    /*
     * THIS IS THE IMPORTANT PART:
     *
     * The page checks the server session FIRST.
     *
     * If there is no authenticated session,
     * the complete trading workspace remains hidden.
     *
     * If authentication exists,
     * the logged-in navigation/workspace is revealed.
     */

    await checkSession();


    connectToDeriv();
  };


  /* =========================================================
     START
  ========================================================= */

  initialise();


  /* =========================================================
     CLEANUP
  ========================================================= */

  window.addEventListener(
    "beforeunload",
    () => {

      state.destroyed =
        true;


      if (
        state.reconnectTimer
      ) {

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
