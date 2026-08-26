document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX STARTING");

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";


  /* ============================================================
     STATE
  ============================================================ */

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


  /* ============================================================
     DOM HELPERS
  ============================================================ */

  const all = (selector) =>
    Array.from(
      document.querySelectorAll(selector)
    );


  const one = (selector) =>
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


  /* ============================================================
     PUBLIC / PRIVATE UI
  ============================================================ */

  const showLoggedOutUI = () => {

    state.authenticated = false;

    const loggedOut =
      one("#logged-out-actions");

    const loggedIn =
      one("#logged-in-actions");

    const tradingNavigation =
      one("#trading-navigation");

    const authenticatedWorkspace =
      one("#authenticated-workspace");

    const footerLogout =
      one("#footer-logout");

    const publicLanding =
      one("#public-landing");


    if (loggedOut) {
      loggedOut.hidden = false;
    }


    if (loggedIn) {
      loggedIn.hidden = true;
    }


    if (tradingNavigation) {
      tradingNavigation.hidden = true;
    }


    if (authenticatedWorkspace) {
      authenticatedWorkspace.hidden = true;
    }


    if (footerLogout) {
      footerLogout.hidden = true;
    }


    if (publicLanding) {
      publicLanding.hidden = false;
    }


    const tradeAccount =
      one("#trade-account");

    if (tradeAccount) {
      tradeAccount.hidden = true;
    }


    setAll(
      "[data-trade-message]",
      "LOG IN TO TRADE"
    );


    console.log(
      "UI: LOGGED OUT"
    );
  };


  const showLoggedInUI = () => {

    state.authenticated = true;

    const loggedOut =
      one("#logged-out-actions");

    const loggedIn =
      one("#logged-in-actions");

    const tradingNavigation =
      one("#trading-navigation");

    const authenticatedWorkspace =
      one("#authenticated-workspace");

    const footerLogout =
      one("#footer-logout");

    const publicLanding =
      one("#public-landing");


    if (loggedOut) {
      loggedOut.hidden = true;
    }


    if (loggedIn) {
      loggedIn.hidden = false;
    }


    if (tradingNavigation) {
      tradingNavigation.hidden = false;
    }


    if (authenticatedWorkspace) {
      authenticatedWorkspace.hidden = false;
    }


    if (footerLogout) {
      footerLogout.hidden = false;
    }


    if (publicLanding) {
      publicLanding.hidden = true;
    }


    console.log(
      "UI: LOGGED IN"
    );
  };


  /* ============================================================
     STATUS
  ============================================================ */

  const setStatus = status => {

    setAll(
      "[data-market-status]",
      status
    );

    console.log(
      "MARKET:",
      status
    );
  };


  const setTradeMessage = message => {

    setAll(
      "[data-trade-message]",
      message
    );

  };


  /* ============================================================
     MARKETS
  ============================================================ */

  const supportedMarkets = {

    "EUR/USD": "EUR/USD",

    "GBP/USD": "GBP/USD",

    "USD/JPY": "USD/JPY",

    "AUD/USD": "AUD/USD",

    "USD/CAD": "USD/CAD",

    "USD/CHF": "USD/CHF"

  };


  const normaliseMarketName = value => {

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


  /* ============================================================
     PRICE
  ============================================================ */

  const formatPrice = price => {

    const number =
      Number(price);


    if (
      !Number.isFinite(number)
    ) {
      return "—";
    }


    if (number >= 100) {
      return number.toFixed(3);
    }


    return number.toFixed(5);

  };


  /* ============================================================
     MONEY
  ============================================================ */

  const formatMoney = (
    balance,
    currency = "USD"
  ) => {

    const number =
      Number(balance);


    if (
      !Number.isFinite(number)
    ) {
      return "—";
    }


    return (
      currency +
      " " +
      number.toFixed(2)
    );

  };


  /* ============================================================
     MARKET DISPLAY
  ============================================================ */

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


  /* ============================================================
     RESET
  ============================================================ */

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
      "[data-signal]",
      "WAIT"
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


  /* ============================================================
     CHART
  ============================================================ */

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
        .map(
          (value, index) => {

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

          }
        )
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


  /* ============================================================
     ANALYSIS
  ============================================================ */

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
      recent[
        recent.length - 1
      ];


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
      element => {

        element.classList.remove(
          "wait",
          "buy",
          "sell"
        );


        if (signal === "CALL") {

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


  /* ============================================================
     PRICE UPDATE
  ============================================================ */

  const updatePrice = price => {

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

    setStatus(
      "LIVE"
    );

  };


  /* ============================================================
     FIND SYMBOL
  ============================================================ */

  const findSymbol = requestedMarket => {

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


    const found =
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
      );


    if (
      found &&
      found.underlying_symbol
    ) {

      return found;

    }


    return (
      state.activeSymbols.find(
        item => {

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
      ) ||
      null
    );

  };


  /* ============================================================
     ACTIVE SYMBOLS
  ============================================================ */

  const requestActiveSymbols = () => {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }


    state.socket.send(
      JSON.stringify({

        active_symbols:
          "brief",

        req_id:
          ++state.requestId

      })
    );


    setStatus(
      "LOADING MARKETS"
    );

  };


  /* ============================================================
     SUBSCRIBE
  ============================================================ */

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

    } catch (error) {

      console.warn(
        error
      );

    }


    state.socket.send(
      JSON.stringify({

        ticks:
          state.symbol,

        subscribe:
          1,

        req_id:
          ++state.requestId

      })
    );


    setStatus(
      "WAITING FOR DATA"
    );

  };


  /* ============================================================
     MARKET SWITCH
  ============================================================ */

  const setMarket = value => {

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
      button => {

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


  /* ============================================================
     MARKET BUTTONS
  ============================================================ */

  const setupMarketButtons = () => {

    all(
      "[data-symbol]"
    ).forEach(
      button => {

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


  /* ============================================================
     TIMEFRAMES
  ============================================================ */

  const setupTimeframes = () => {

    all(
      "[data-timeframe]"
    ).forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            all(
              "[data-timeframe]"
            ).forEach(
              item => {

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


  /* ============================================================
     ACCOUNT DISPLAY
  ============================================================ */

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

      tradeAccount.hidden =
        false;

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


  /* ============================================================
     LOAD ACCOUNTS
  ============================================================ */

  const loadAccounts = async () => {

    if (!state.authenticated) {
      return;
    }


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


      if (
        response.status === 401
      ) {

        showLoggedOutUI();

        return;

      }


      if (!response.ok) {

        throw new Error(
          "Accounts request failed"
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
          account => {

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
          account =>
            String(
              account.account_type ||
              ""
            ).toLowerCase() ===
            "real"
        );


      if (!preferred) {

        preferred =
          accounts.find(
            account =>
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


  /* ============================================================
     ACCOUNT SELECTOR
  ============================================================ */

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


  /* ============================================================
     SESSION
  ============================================================ */

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

        showLoggedOutUI();

        return false;

      }


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

  };


  /* ============================================================
     LOGIN LINKS
  ============================================================ */

  const setupAccountLinks = () => {

    all(
      'a[href="/api/deriv/login"]'
    ).forEach(
      link => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "LOGIN CLICKED"
            );

          }
        );

      }
    );


    all(
      'a[href="/api/deriv/signup"]'
    ).forEach(
      link => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "CREATE ACCOUNT CLICKED"
            );

          }
        );

      }
    );

  };


  /* ============================================================
     TRADING
  ============================================================ */

  const handleTradeAttempt = (
    side,
    stakeInput,
    contractInput
  ) => {

    if (!state.authenticated) {

      setTradeMessage(
        "LOGIN REQUIRED"
      );

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
          state.selectedAccount.account_id,
        accountType
      }
    );


    setTradeMessage(
      accountType +
      " ACCOUNT — ORDER API PENDING"
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


  /* ============================================================
     DERIV MESSAGE
  ============================================================ */

  const handleMessage = event => {

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

      if (
        data.tick.quote !==
        undefined
      ) {

        updatePrice(
          data.tick.quote
        );

      }

    }

  };


  /* ============================================================
     RECONNECT
  ============================================================ */

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


  /* ============================================================
     DERIV CONNECTION
  ============================================================ */

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


        state.socket =
          null;


        if (!state.destroyed) {

          setStatus(
            "RECONNECTING"
          );


          scheduleReconnect();

        }

      }
    );

  };


  /* ============================================================
     OAUTH RESULT
  ============================================================ */

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


    setTradeMessage(
      "DERIV LOGIN FAILED"
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


  /* ============================================================
     INITIALISE
  ============================================================ */

  const initialise = async () => {

    /*
     * IMPORTANT:
     * Always start hidden/logged-out.
     * The session endpoint is the only thing
     * allowed to unlock the trading workspace.
     */

    showLoggedOutUI();


    state.requestedMarket =
      "EUR/USD";


    state.symbolName =
      "EUR/USD";


    updateMarketDisplay();


    resetMarketState();


    setupMarketButtons();

    setupTimeframes();

    setupTradingButtons();

    setupAccountLinks();

    setupAccountSelector();


    handleOAuthResult();


    /*
     * Check authentication BEFORE revealing
     * account information or trading workspace.
     */

    await checkSession();


    /*
     * Public market data can remain active.
     */

    connectToDeriv();

  };


  /* ============================================================
     START
  ============================================================ */

  initialise();


  /* ============================================================
     CLEANUP
  ============================================================ */

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
