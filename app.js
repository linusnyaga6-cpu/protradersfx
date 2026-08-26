document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  console.log("PROTRADERS FX WORKSPACE STARTING");

  const DERIV_PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";


  /* =====================================================
     STATE
  ===================================================== */

  const state = {

    socket: null,

    connected: false,

    authenticated: false,

    destroyed: false,

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

    sessionExpiresAt: null
  };


  /* =====================================================
     DOM HELPERS
  ===================================================== */

  const one = (selector) =>
    document.querySelector(selector);


  const all = (selector) =>
    Array.from(
      document.querySelectorAll(selector)
    );


  const show = (element) => {

    if (!element) {
      return;
    }

    element.classList.remove("hidden");

    element.hidden = false;
  };


  const hide = (element) => {

    if (!element) {
      return;
    }

    element.classList.add("hidden");

    element.hidden = true;
  };


  const setText = (
    selector,
    value
  ) => {

    all(selector).forEach(
      (element) => {

        element.textContent =
          value;
      }
    );
  };


  /* =====================================================
     MARKET LIST
  ===================================================== */

  const supportedMarkets = {

    "EUR/USD": "EUR/USD",

    "GBP/USD": "GBP/USD",

    "USD/JPY": "USD/JPY",

    "AUD/USD": "AUD/USD",

    "USD/CAD": "USD/CAD",

    "USD/CHF": "USD/CHF"
  };


  const normaliseMarket = (
    value
  ) => {

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


    if (
      pairs.includes(text)
    ) {

      return (
        text.substring(0, 3) +
        "/" +
        text.substring(3, 6)
      );
    }


    return String(value).trim();
  };


  /* =====================================================
     MONEY / PRICE
  ===================================================== */

  const formatPrice = (
    value
  ) => {

    const number =
      Number(value);


    if (
      !Number.isFinite(number)
    ) {

      return "—";
    }


    if (
      number >= 100
    ) {

      return number.toFixed(3);
    }


    return number.toFixed(5);
  };


  const formatMoney = (
    value,
    currency = "USD"
  ) => {

    const number =
      Number(value);


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


  /* =====================================================
     AUTHENTICATION UI
  ===================================================== */

  const showLoggedOutUI = () => {

    console.log(
      "UI: LOGGED OUT"
    );


    state.authenticated =
      false;

    state.accounts =
      [];

    state.selectedAccount =
      null;


    const publicHome =
      one("#public-home");

    const publicNav =
      one("#public-nav");

    const privateNav =
      one("#private-nav");

    const loggedOutActions =
      one("#logged-out-actions");

    const accountArea =
      one("#account-area");

    const privateApp =
      one("#private-app");


    show(publicHome);

    show(publicNav);

    hide(privateNav);

    show(loggedOutActions);

    hide(accountArea);

    hide(privateApp);


    setText(
      "#account-balance",
      "—"
    );


    const select =
      one("#account-select");


    if (select) {

      select.innerHTML =
        "<option value=\"\">SELECT</option>";
    }


    document.body.classList.remove(
      "authenticated"
    );
  };


  const showLoggedInUI = () => {

    console.log(
      "UI: LOGGED IN"
    );


    state.authenticated =
      true;


    const publicHome =
      one("#public-home");

    const publicNav =
      one("#public-nav");

    const privateNav =
      one("#private-nav");

    const loggedOutActions =
      one("#logged-out-actions");

    const accountArea =
      one("#account-area");

    const privateApp =
      one("#private-app");


    /*
     * CRITICAL:
     *
     * The public landing page is hidden.
     * Login/Create Account are hidden.
     * The private workspace is shown.
     */

    hide(publicHome);

    hide(publicNav);

    show(privateNav);

    hide(loggedOutActions);

    show(accountArea);

    show(privateApp);


    document.body.classList.add(
      "authenticated"
    );


    console.log(
      "PRIVATE WORKSPACE VISIBLE"
    );
  };


  /* =====================================================
     SESSION CHECK
  ===================================================== */

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
          "Session request failed: " +
          response.status
        );
      }


      const data =
        await response.json();


      console.log(
        "SESSION:",
        data
      );


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
        "SESSION CHECK ERROR:",
        error
      );


      /*
       * If the session endpoint fails,
       * fail closed.
       *
       * That means:
       * NO private workspace
       * NO balance
       * NO REAL/DEMO
       */

      showLoggedOutUI();


      return false;
    }
  };


  /* =====================================================
     ACCOUNT LOADING
  ===================================================== */

  const loadAccounts = async () => {

    if (
      !state.authenticated
    ) {

      return;
    }


    try {

      console.log(
        "ACCOUNT: LOADING"
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


      console.log(
        "ACCOUNTS RESPONSE:",
        data
      );


      const accounts =
        Array.isArray(
          data.accounts
        )
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


      setText(
        "#account-balance",
        "—"
      );


      const message =
        one("#private-message");


      if (message) {

        message.textContent =
          "Account information unavailable.";
      }
    }
  };


  /* =====================================================
     ACCOUNT DISPLAY
  ===================================================== */

  const renderAccounts = () => {

    const select =
      one("#account-select");


    if (!select) {
      return;
    }


    select.innerHTML =
      "";


    state.accounts.forEach(
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


    if (
      !state.accounts.length
    ) {

      select.innerHTML =
        "<option value=\"\">NO ACCOUNTS</option>";

      setText(
        "#account-balance",
        "—"
      );

      return;
    }


    /*
     * REAL is preferred only AFTER login.
     */

    let selected =
      state.accounts.find(
        (account) =>
          String(
            account.account_type ||
            ""
          ).toLowerCase() ===
          "real"
      );


    if (!selected) {

      selected =
        state.accounts[0];
    }


    state.selectedAccount =
      selected;


    select.value =
      selected.account_id;


    updateAccountDisplay();
  };


  const updateAccountDisplay = () => {

    if (
      !state.authenticated ||
      !state.selectedAccount
    ) {

      setText(
        "#account-balance",
        "—"
      );

      setText(
        "#risk-account",
        "—"
      );

      return;
    }


    const account =
      state.selectedAccount;


    const money =
      formatMoney(
        account.balance,
        account.currency ||
          "USD"
      );


    setText(
      "#account-balance",
      money
    );


    setText(
      "#risk-account",
      money
    );
  };


  /* =====================================================
     ACCOUNT SELECTOR
  ===================================================== */

  const setupAccountSelector = () => {

    const select =
      one("#account-select");


    if (!select) {
      return;
    }


    select.addEventListener(
      "change",
      () => {

        if (
          !state.authenticated
        ) {

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


        console.log(
          "ACCOUNT SWITCHED:",
          account.account_id
        );
      }
    );
  };


  /* =====================================================
     MARKET STATUS
  ===================================================== */

  const setMarketStatus = (
    value
  ) => {

    const element =
      one("#market-status");


    if (element) {

      element.textContent =
        value;
    }
  };


  /* =====================================================
     MARKET DISPLAY
  ===================================================== */

  const updateMarketDisplay = () => {

    setText(
      "#market-name",
      state.symbolName
    );

    setText(
      "#analysis-market",
      state.symbolName
    );
  };


  /* =====================================================
     RESET MARKET
  ===================================================== */

  const resetMarket = () => {

    state.price =
      null;

    state.previousPrice =
      null;

    state.prices =
      [];

    state.symbol =
      null;


    setText(
      "#market-price",
      "—"
    );

    setText(
      "#market-move",
      "—"
    );

    setText(
      "#analysis-signal",
      "WAIT"
    );

    setText(
      "#analysis-trend",
      "WAIT"
    );

    setText(
      "#analysis-momentum",
      "WAIT"
    );

    setText(
      "#analysis-direction",
      "—"
    );

    setText(
      "#analysis-entry",
      "—"
    );

    setText(
      "#analysis-stop",
      "—"
    );

    setText(
      "#analysis-target",
      "—"
    );

    setText(
      "#ai-bias",
      "WAIT"
    );

    setText(
      "#ai-confidence",
      "—"
    );


    const line =
      one("#price-line");


    if (line) {

      line.setAttribute(
        "points",
        ""
      );
    }
  };


  /* =====================================================
     FIND SYMBOL
  ===================================================== */

  const findSymbol = (
    marketName
  ) => {

    const wanted =
      normaliseMarket(
        marketName
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


    const match =
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


          return (
            name === wanted
          );
        }
      );


    if (
      match &&
      match.underlying_symbol
    ) {

      return match;
    }


    const symbolMatch =
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


          return (
            symbol === wanted
          );
        }
      );


    return (
      symbolMatch || null
    );
  };


  /* =====================================================
     ACTIVE SYMBOLS
  ===================================================== */

  const requestActiveSymbols = () => {

    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {

      return;
    }


    setMarketStatus(
      "LOADING MARKETS"
    );


    state.socket.send(
      JSON.stringify({

        active_symbols:
          "brief",

        req_id:
          ++state.requestId
      })
    );
  };


  /* =====================================================
     SUBSCRIBE
  ===================================================== */

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


      setMarketStatus(
        "MARKET UNAVAILABLE"
      );


      return;
    }


    const symbol =
      String(
        market.underlying_symbol ||
        ""
      ).trim();


    if (!symbol) {

      setMarketStatus(
        "SYMBOL ERROR"
      );


      return;
    }


    state.symbol =
      symbol;


    state.symbolName =
      market.underlying_symbol_name ||
      state.requestedMarket;


    updateMarketDisplay();


    try {

      state.socket.send(
        JSON.stringify({

          forget_all:
            "ticks",

          req_id:
            ++state.requestId
        })
      );

    } catch (error) {

      console.warn(
        "FORGET ERROR:",
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


    setMarketStatus(
      "WAITING FOR DATA"
    );
  };


  /* =====================================================
     CHANGE MARKET
  ===================================================== */

  const setMarket = (
    value
  ) => {

    const market =
      normaliseMarket(
        value
      );


    if (!market) {
      return;
    }


    state.requestedMarket =
      market;

    state.symbolName =
      market;


    resetMarket();

    updateMarketDisplay();


    all(
      ".market-button"
    ).forEach(
      (button) => {

        const buttonMarket =
          normaliseMarket(
            button.dataset.symbol
          );


        button.classList.toggle(
          "active",
          buttonMarket ===
            market
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


  /* =====================================================
     MARKET BUTTONS
  ===================================================== */

  const setupMarketButtons = () => {

    all(
      ".market-button"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            setMarket(
              button.dataset.symbol
            );
          }
        );
      }
    );
  };


  /* =====================================================
     PRICE CHART
  ===================================================== */

  const updateChart = () => {

    const line =
      one("#price-line");


    if (
      !line ||
      state.prices.length < 2
    ) {

      return;
    }


    const values =
      state.prices.slice(-80);


    const min =
      Math.min(
        ...values
      );


    const max =
      Math.max(
        ...values
      );


    const range =
      max - min || 0.00001;


    const width =
      1000;


    const height =
      400;


    const padding =
      20;


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
  };


  /* =====================================================
     ANALYSIS
  ===================================================== */

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


    let trend =
      "NEUTRAL";


    let momentum =
      "LOW";


    let direction =
      "—";


    let signal =
      "WAIT";


    if (
      difference > 0
    ) {

      trend =
        "BULLISH";

      momentum =
        "POSITIVE";

      direction =
        "UP";

      signal =
        "CALL";
    }


    if (
      difference < 0
    ) {

      trend =
        "BEARISH";

      momentum =
        "NEGATIVE";

      direction =
        "DOWN";

      signal =
        "PUT";
    }


    setText(
      "#analysis-signal",
      signal
    );


    setText(
      "#analysis-trend",
      trend
    );


    setText(
      "#analysis-momentum",
      momentum
    );


    setText(
      "#analysis-direction",
      direction
    );


    if (
      state.price !== null
    ) {

      const movement =
        Math.abs(
          difference ||
          state.price *
            0.001
        );


      setText(
        "#analysis-entry",
        formatPrice(
          state.price
        )
      );


      setText(
        "#analysis-stop",
        formatPrice(
          state.price -
          movement
        )
      );


      setText(
        "#analysis-target",
        formatPrice(
          state.price +
          movement
        )
      );
    }
  };


  /* =====================================================
     PRICE UPDATE
  ===================================================== */

  const updatePrice = (
    value
  ) => {

    const price =
      Number(value);


    if (
      !Number.isFinite(price)
    ) {

      return;
    }


    state.previousPrice =
      state.price;


    state.price =
      price;


    state.prices.push(
      price
    );


    if (
      state.prices.length >
      100
    ) {

      state.prices.shift();
    }


    setText(
      "#market-price",
      formatPrice(price)
    );


    if (
      state.previousPrice !==
        null &&
      state.previousPrice !== 0
    ) {

      const change =
        (
          (
            price -
            state.previousPrice
          ) /
          state.previousPrice
        ) *
        100;


      const element =
        one("#market-move");


      if (element) {

        element.textContent =
          (
            change >= 0
              ? "+"
              : ""
          ) +
          change.toFixed(3) +
          "%";


        element.classList.remove(
          "up",
          "down"
        );


        element.classList.add(
          change >= 0
            ? "up"
            : "down"
        );
      }
    }


    updateChart();

    updateAnalysis();


    setMarketStatus(
      "LIVE"
    );
  };


  /* =====================================================
     DERIV MESSAGE
  ===================================================== */

  const handleMessage = (
    event
  ) => {

    let data;


    try {

      data =
        JSON.parse(
          event.data
        );

    } catch {

      return;
    }


    if (
      data.error
    ) {

      console.error(
        "DERIV ERROR:",
        data.error
      );


      setMarketStatus(
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
    }
  };


  /* =====================================================
     DERIV CONNECTION
  ===================================================== */

  const scheduleReconnect = () => {

    if (
      state.destroyed ||
      state.reconnectTimer
    ) {

      return;
    }


    state.reconnectAttempts +=
      1;


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


    setMarketStatus(
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


      setMarketStatus(
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
          "DERIV PUBLIC DATA CONNECTED"
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
          "DERIV SOCKET ERROR:",
          error
        );


        state.connected =
          false;


        setMarketStatus(
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

          setMarketStatus(
            "RECONNECTING"
          );


          scheduleReconnect();
        }
      }
    );
  };


  /* =====================================================
     PRIVATE NAVIGATION
  ===================================================== */

  const setupPrivateNavigation = () => {

    all(
      "[data-private-nav]"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            if (
              !state.authenticated
            ) {

              return;
            }


            const target =
              button.dataset.privateNav;


            all(
              "[data-private-nav]"
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


            const element =
              document.getElementById(
                target === "markets"
                  ? "private-markets"
                  : target
              );


            if (element) {

              element.scrollIntoView({
                behavior:
                  "smooth",
                block:
                  "start"
              });
            }
          }
        );
      }
    );
  };


  /* =====================================================
     AI ANALYSIS
  ===================================================== */

  const runAIAnalysis = () => {

    if (
      !state.authenticated
    ) {

      return;
    }


    if (
      state.prices.length < 10
    ) {

      setText(
        "#ai-bias",
        "WAIT"
      );

      setText(
        "#ai-confidence",
        "INSUFFICIENT DATA"
      );

      return;
    }


    const recent =
      state.prices.slice(-10);


    const first =
      recent[0];


    const last =
      recent[
        recent.length - 1
      ];


    const movement =
      last - first;


    let bias =
      "NEUTRAL";


    if (
      movement > 0
    ) {

      bias =
        "BULLISH";
    }


    if (
      movement < 0
    ) {

      bias =
        "BEARISH";
    }


    const average =
      recent.reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      ) /
      recent.length;


    const deviation =
      Math.abs(
        last -
        average
      );


    const confidence =
      Math.min(
        95,
        Math.max(
          50,
          50 +
            (
              deviation /
              Math.max(
                average,
                0.00001
              )
            ) *
            10000
        )
      );


    setText(
      "#ai-bias",
      bias
    );


    setText(
      "#ai-confidence",
      Math.round(
        confidence
      ) +
      "%"
    );


    console.log(
      "AI ANALYSIS:",
      {
        market:
          state.symbolName,

        bias,

        confidence
      }
    );
  };


  /* =====================================================
     MANUAL TRADE UI
  ===================================================== */

  const handleTradeAttempt = (
    side
  ) => {

    if (
      !state.authenticated
    ) {

      return;
    }


    const stake =
      Number(
        one("#stake")?.value
      );


    if (
      !Number.isFinite(stake) ||
      stake <= 0
    ) {

      setText(
        "#trade-message",
        "ENTER A VALID STAKE"
      );

      return;
    }


    if (
      !state.selectedAccount
    ) {

      setText(
        "#trade-message",
        "NO ACCOUNT SELECTED"
      );

      return;
    }


    if (
      !state.symbol
    ) {

      setText(
        "#trade-message",
        "MARKET DATA NOT READY"
      );

      return;
    }


    /*
     * IMPORTANT:
     *
     * Your current server.js does not yet contain
     * a trade purchase endpoint.
     *
     * Therefore this UI does NOT pretend to execute
     * a real order.
     */

    setText(
      "#trade-message",
      side +
      " READY — TRADE EXECUTION API NOT CONNECTED"
    );


    console.log(
      "TRADE PREPARED:",
      {
        side,

        stake,

        contract:
          one(
            "#contract-type"
          )?.value,

        symbol:
          state.symbol,

        accountId:
          state.selectedAccount
            .account_id
      }
    );
  };


  const setupTrading = () => {

    const form =
      one("#manual-trade-form");


    if (!form) {
      return;
    }


    form.addEventListener(
      "submit",
      (event) => {

        event.preventDefault();

        handleTradeAttempt(
          "BUY"
        );
      }
    );


    const sell =
      one("#sell-button");


    if (sell) {

      sell.addEventListener(
        "click",
        () => {

          handleTradeAttempt(
            "SELL"
          );
        }
      );
    }


    const stake =
      one("#stake");


    if (stake) {

      stake.addEventListener(
        "input",
        () => {

          const value =
            Number(
              stake.value
            );


          setText(
            "#risk-stake",
            "USD " +
              (
                Number.isFinite(value)
                  ? value.toFixed(2)
                  : "0.00"
              )
          );
        }
      );
    }
  };


  /* =====================================================
     TOOL BUTTONS
  ===================================================== */

  const setupTools = () => {

    all(
      "[data-tool]"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            if (
              !state.authenticated
            ) {

              return;
            }


            const tool =
              button.dataset.tool;


            const message =
              one("#private-message");


            const messages = {

              "create-bot":
                "BOT BUILDER READY — EXECUTION MODULE COMING NEXT",

              "bot-templates":
                "BOT TEMPLATES READY",

              "bulk-prepare":
                "BULK TRADER READY — EXECUTION MODULE COMING NEXT",

              "bulk-clear":
                "BULK TRADE QUEUE CLEARED",

              "refresh-trades":
                "OPEN TRADES REFRESH REQUESTED",

              "refresh-history":
                "HISTORY REFRESH REQUESTED"
            };


            if (message) {

              message.textContent =
                messages[tool] ||
                "TOOL READY";
            }


            console.log(
              "TOOL:",
              tool
            );
          }
        );
      }
    );
  };


  /* =====================================================
     LOGIN / SIGNUP LINKS
  ===================================================== */

  const setupAuthLinks = () => {

    all(
      'a[href="/api/deriv/login"]'
    ).forEach(
      (link) => {

        link.addEventListener(
          "click",
          () => {

            console.log(
              "DERIV LOGIN"
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
              "DERIV SIGNUP"
            );
          }
        );
      }
    );
  };


  /* =====================================================
     OAUTH ERROR
  ===================================================== */

  const handleOAuthResult = () => {

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


    const message =
      one("#private-message");


    if (message) {

      message.textContent =
        "DERIV LOGIN FAILED — PLEASE TRY AGAIN";
    }


    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  };


  /* =====================================================
     INITIALISE
  ===================================================== */

  const initialise = async () => {

    /*
     * FAIL-CLOSED FIRST.
     *
     * This prevents the private dashboard from appearing
     * while the session is being checked.
     */

    showLoggedOutUI();


    setupMarketButtons();

    setupPrivateNavigation();

    setupAccountSelector();

    setupTrading();

    setupTools();

    setupAuthLinks();

    handleOAuthResult();


    /*
     * Session decides which UI is allowed.
     */

    await checkSession();


    /*
     * Public market data can continue regardless of login.
     * It never exposes account information.
     */

    connectToDeriv();
  };


  initialise();


  /* =====================================================
     CLEANUP
  ===================================================== */

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

        } catch {}
      }
    }
  );

});
