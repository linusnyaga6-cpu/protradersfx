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
     DOM HELPERS
  ========================================================= */

  const all = (selector) => {
    return Array.from(
      document.querySelectorAll(selector)
    );
  };


  const one = (selector) => {
    return document.querySelector(selector);
  };


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

    console.log("MARKET:", status);
  };


  /* =========================================================
     TRADE MESSAGE
  ========================================================= */

  const setTradeMessage = (message) => {
    const element = one(
      "[data-trade-message]"
    );

    if (element) {
      element.textContent = message;
    }
  };


  /* =========================================================
     MARKET DEFINITIONS
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

    let text = String(value).trim();

    if (
      Object.prototype.hasOwnProperty.call(
        supportedMarkets,
        text
      )
    ) {
      return text;
    }

    text = text
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


  /* =========================================================
     PRICE
  ========================================================= */

  const formatPrice = (price) => {

    const number = Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  };


  /* =========================================================
     MONEY
  ========================================================= */

  const formatMoney = (
    balance,
    currency = "USD"
  ) => {

    const number = Number(balance);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return (
      currency +
      " " +
      number.toFixed(2)
    );
  };


  /* =========================================================
     MARKET DISPLAY
  ========================================================= */

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

    const line = one(
      "[data-live-line]"
    );

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
      all(".chart-y-axis span");

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

      if (
        state.prices.length >= 10
      ) {
        signal = "CALL";
      }
    }


    if (difference < 0) {

      trend = "BEARISH";
      momentum = "NEGATIVE";
      direction = "DOWN";

      if (
        state.prices.length >= 10
      ) {
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


    all(
      "[data-signal]"
    ).forEach(
      (element) => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );

        if (
          signal === "CALL"
        ) {

          element.classList.add(
            "buy"
          );

        } else if (
          signal === "PUT"
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


    if (
      state.price !== null
    ) {

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
  };


  /* =========================================================
     PRICE UPDATE
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


      all(
        "[data-move]"
      ).forEach(
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
     RESET MARKET
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
     FIND DERIV SYMBOL
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


    const expectedSymbol =
      "frx" + wanted;


    return (
      state.activeSymbols.find(
        (item) =>
          String(
            item.underlying_symbol ||
            ""
          ).toLowerCase() ===
          expectedSymbol.toLowerCase()
      ) ||
      null
    );
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
     SUBSCRIBE MARKET
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
      typeof derivSymbol !== "string" ||
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


    all(
      "[data-symbol]"
    ).forEach(
      (button) => {

        const buttonMarket =
          normaliseMarketName(
            button.dataset.symbol ||
            button.textContent
          );

        button.classList.toggle(
          "active",
          buttonMarket ===
          marketName
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

    all(
      "[data-symbol]"
    ).forEach(
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

    all(
      "[data-timeframe]"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            all(
              "[data-timeframe]"
            ).forEach(
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
     FORCE LOGGED-OUT ACCOUNT STATE
  ========================================================= */

  const clearAccountState = () => {

    state.authenticated = false;
    state.sessionExpiresAt = null;

    state.accounts = [];
    state.selectedAccount = null;


    const accountPanel =
      one("#account-panel");

    const loggedOut =
      one("#logged-out-actions");

    const footerLogin =
      one("#footer-login");

    const footerSignup =
      one("#footer-signup");

    const footerAccount =
      one("#footer-account");

    const tradeAccount =
      one("#trade-account");

    const accountBalance =
      one("#account-balance");

    const accountSelect =
      one("#account-select");

    const tradeType =
      one("#trade-account-type");

    const tradeBalance =
      one("#trade-account-balance");


    /*
     * Logged-out state.
     */

    if (loggedOut) {
      loggedOut.hidden = false;
    }

    if (accountPanel) {
      accountPanel.hidden = true;
    }

    if (footerLogin) {
      footerLogin.hidden = false;
    }

    if (footerSignup) {
      footerSignup.hidden = false;
    }

    if (footerAccount) {
      footerAccount.hidden = true;
    }


    /*
     * Completely remove account information.
     */

    if (accountSelect) {
      accountSelect.innerHTML =
        '<option value="">SELECT ACCOUNT</option>';
    }

    if (accountBalance) {
      accountBalance.textContent = "—";
    }

    if (tradeAccount) {
      tradeAccount.hidden = true;
    }

    if (tradeType) {
      tradeType.textContent = "—";
    }

    if (tradeBalance) {
      tradeBalance.textContent = "—";
    }


    setTradeMessage(
      "LOG IN TO TRADE"
    );


    console.log(
      "ACCOUNT UI: LOGGED OUT"
    );
  };


  /* =========================================================
     LOGGED-IN UI
  ========================================================= */

  const showLoggedInUI = () => {

    const loggedOut =
      one("#logged-out-actions");

    const accountPanel =
      one("#account-panel");

    const footerLogin =
      one("#footer-login");

    const footerSignup =
      one("#footer-signup");

    const footerAccount =
      one("#footer-account");


    if (loggedOut) {
      loggedOut.hidden = true;
    }

    if (accountPanel) {
      accountPanel.hidden = false;
    }

    if (footerLogin) {
      footerLogin.hidden = true;
    }

    if (footerSignup) {
      footerSignup.hidden = true;
    }

    if (footerAccount) {
      footerAccount.hidden = false;
    }


    console.log(
      "ACCOUNT UI: LOGGED IN"
    );
  };


  /* =========================================================
     ACCOUNT DISPLAY
  ========================================================= */

  const updateAccountDisplay = () => {

    /*
     * SECURITY GATE:
     *
     * Never display account information unless
     * the current session is authenticated.
     */

    if (
      state.authenticated !== true
    ) {
      clearAccountState();
      return;
    }


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


    if (
      !state.selectedAccount
    ) {

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

    /*
     * ABSOLUTE SECURITY GATE.
     *
     * This function cannot request accounts while logged out.
     */

    if (
      state.authenticated !== true
    ) {

      console.log(
        "ACCOUNT: BLOCKED — NOT AUTHENTICATED"
      );

      clearAccountState();

      return;
    }


    try {

      console.log(
        "ACCOUNT: AUTHENTICATED — LOADING ACCOUNTS"
      );


      const response =
        await fetch(
          "/api/deriv/accounts",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store"
          }
        );


      if (
        response.status === 401
      ) {

        console.log(
          "ACCOUNT: SESSION EXPIRED"
        );

        clearAccountState();

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


      console.log(
        "ACCOUNTS RESPONSE:",
        data
      );


      /*
       * Verify authentication AGAIN.
       */

      if (
        state.authenticated !== true
      ) {

        console.log(
          "ACCOUNT: RESPONSE IGNORED — SESSION NOT AUTHENTICATED"
        );

        clearAccountState();

        return;
      }


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

        state.selectedAccount =
          null;

        updateAccountDisplay();

        setTradeMessage(
          "NO DERIV ACCOUNTS FOUND"
        );

        return;
      }


      /*
       * Prefer REAL only AFTER LOGIN.
       *
       * This code is never reached while logged out.
       */

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


      /*
       * Never expose stale account information
       * after an account-loading failure.
       */

      state.accounts = [];
      state.selectedAccount = null;

      updateAccountDisplay();

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

        /*
         * Do not allow account switching while logged out.
         */

        if (
          state.authenticated !== true
        ) {
          clearAccountState();
          return;
        }


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
          ).toLowerCase();


        setTradeMessage(
          (
            type === "real"
              ? "REAL"
              : "DEMO"
          ) +
          " ACCOUNT SELECTED"
        );


        console.log(
          "ACCOUNT SWITCHED:",
          account
        );
      }
    );
  };


  /* =========================================================
     SESSION CHECK
  ========================================================= */

  const checkSession = async () => {

    /*
     * Always begin in logged-out state.
     */

    clearAccountState();


    try {

      console.log(
        "SESSION: CHECKING"
      );


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
          "Session request failed: " +
          response.status
        );
      }


      const data =
        await response.json();


      console.log(
        "SESSION RESPONSE:",
        data
      );


      /*
       * ONLY this explicit value allows account access.
       */

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


        console.log(
          "SESSION: AUTHENTICATED"
        );


        /*
         * Accounts are loaded ONLY here,
         * after authentication succeeds.
         */

        await loadAccounts();


        return true;
      }


      /*
       * Anything other than authenticated:true
       * is treated as logged out.
       */

      console.log(
        "SESSION: NOT AUTHENTICATED"
      );


      clearAccountState();


      return false;


    } catch (error) {

      console.error(
        "SESSION ERROR:",
        error
      );


      clearAccountState();


      return false;
    }
  };


  /* =========================================================
     LOGIN
  ========================================================= */

  const goToLogin = () => {

    console.log(
      "OPENING DERIV LOGIN"
    );


    window.location.href =
      "/api/deriv/login";
  };


  /* =========================================================
     ACCOUNT LINKS
  ========================================================= */

  const setupAccountLinks = () => {

    all(
      'a[href="/api/deriv/login"]'
    ).forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "DERIV LOGIN CLICKED"
            );
          }
        );
      }
    );


    all(
      'a[href="/api/deriv/signup"]'
    ).forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "DERIV ACCOUNT CREATION CLICKED"
            );
          }
        );
      }
    );
  };


  /* =========================================================
     TRADE
  ========================================================= */

  const handleTradeAttempt = (
    side,
    stakeInput,
    contractInput
  ) => {

    /*
     * Authentication must be checked FIRST.
     */

    if (
      state.authenticated !== true
    ) {

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


    if (
      !state.symbol
    ) {

      setTradeMessage(
        "MARKET DATA NOT READY"
      );

      return;
    }


    if (
      !state.selectedAccount
    ) {

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
      "TRADE REQUEST READY:",
      {
        side,
        stake: stakeValue,
        contract: contractType,
        symbol: state.symbol,
        accountId:
          state.selectedAccount.account_id,
        accountType
      }
    );


    setTradeMessage(
      accountType +
      " ACCOUNT — ORDER API PENDING"
    );
  };


  /* =========================================================
     TRADING BUTTONS
  ========================================================= */

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
     DERIV MESSAGE
  ========================================================= */

  const handleMessage = (event) => {

    let data;


    try {

      data =
        JSON.parse(
          event.data
        );

    } catch (error) {

      console.error(
        "INVALID DERIV MESSAGE:",
        error
      );

      return;
    }


    if (
      data.msg_type !==
      "tick"
    ) {

      console.log(
        "DERIV:",
        data
      );
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


      console.log(
        "ACTIVE SYMBOLS:",
        state.activeSymbols.length
      );


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


      return;
    }


    if (
      data.tick &&
      data.tick.quote !==
      undefined
    ) {

      updatePrice(
        data.tick.quote
      );
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
     DERIV CONNECTION
  ========================================================= */

  const connectToDeriv = () => {

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
        "DERIV WEBSOCKET ERROR:",
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
          "DERIV PUBLIC MARKET DATA CONNECTED"
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
      (error) => {

        console.error(
          "DERIV WEBSOCKET ERROR:",
          error
        );


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


    if (
      !oauthError
    ) {
      return;
    }


    console.error(
      "OAUTH ERROR:",
      oauthError
    );


    setTradeMessage(
      "DERIV LOGIN FAILED"
    );


    let notice =
      one(
        "#protraders-notice"
      );


    if (!notice) {

      notice =
        document.createElement(
          "div"
        );


      notice.id =
        "protraders-notice";


      document.body.appendChild(
        notice
      );
    }


    notice.textContent =
      "Deriv authentication was not completed. Please try again.";


    setTimeout(
      () => {

        if (notice) {
          notice.remove();
        }

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


    /*
     * Start with a guaranteed logged-out UI.
     */

    clearAccountState();


    updateMarketDisplay();


    setAll(
      "[data-price]",
      "—"
    );


    setAll(
      "[data-move]",
      "—"
    );


    setStatus(
      "CONNECTING"
    );


    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();
    setupAccountLinks();
    setupAccountSelector();


    handleOAuthResult();


    /*
     * Check authentication.
     *
     * Account API is called only if this returns
     * authenticated:true.
     */

    await checkSession();


    /*
     * Public market data is independent of login.
     */

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


      if (
        state.socket
      ) {

        try {

          state.socket.close();

        } catch (error) {

          console.warn(
            "SOCKET CLOSE ERROR:",
            error
          );
        }
      }
    }
  );

});
