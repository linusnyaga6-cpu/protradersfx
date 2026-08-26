document.addEventListener("DOMContentLoaded", () => {

  /* =====================================================
     STATE
  ====================================================== */

  const state = {

    authenticated: false,

    symbol: "EUR/USD",

    price: null,

    previousPrice: null,

    prices: [],

    account: null,

    accounts: [],

    websocket: null,

    reconnectTimer: null

  };


  /* =====================================================
     ELEMENTS
  ====================================================== */

  const loggedOutActions =
    document.getElementById(
      "logged-out-actions"
    );

  const accountPanel =
    document.getElementById(
      "account-panel"
    );

  const publicNavigation =
    document.getElementById(
      "public-navigation"
    );

  const tradingNavigation =
    document.getElementById(
      "trading-navigation"
    );

  const tradingWorkspace =
    document.getElementById(
      "trading-workspace"
    );

  const accountSelect =
    document.getElementById(
      "account-select"
    );

  const accountBalance =
    document.getElementById(
      "account-balance"
    );


  /* =====================================================
     HELPERS
  ====================================================== */

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return document.querySelectorAll(selector);
  }


  function setText(
    selector,
    value
  ) {

    $all(selector).forEach(
      element => {
        element.textContent =
          value;
      }
    );

  }


  function formatPrice(price) {

    if (
      price === null ||
      price === undefined ||
      Number.isNaN(Number(price))
    ) {
      return "—";
    }

    return Number(price)
      .toFixed(5);

  }


  /* =====================================================
     LOGIN UI
  ====================================================== */

  function setLoggedInUI() {

    state.authenticated = true;

    if (loggedOutActions) {
      loggedOutActions.hidden = true;
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

    const tradeMessage =
      $("[data-trade-message]");

    if (tradeMessage) {
      tradeMessage.textContent =
        "READY TO TRADE";
    }

  }


  /* =====================================================
     LOGGED OUT UI
  ====================================================== */

  function setLoggedOutUI() {

    state.authenticated = false;

    if (loggedOutActions) {
      loggedOutActions.hidden = false;
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


  /* =====================================================
     SESSION
  ====================================================== */

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

      if (
        response.status === 401
      ) {

        setLoggedOutUI();

        return;
      }

      if (!response.ok) {

        console.error(
          "ACCOUNT REQUEST FAILED",
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

    if (!accountSelect) {
      return;
    }

    accountSelect.innerHTML = "";

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
          account.id ||
          account.account_id ||
          account.loginid ||
          account.login ||
          "";

        option.value = id;

        const type =
          account.account_type ||
          account.type ||
          "";

        const currency =
          account.currency ||
          "USD";

        const balance =
          account.balance !== undefined
            ? account.balance
            : "";

        option.textContent =
          `${type || "ACCOUNT"} ${
            id || index + 1
          } — ${currency} ${balance}`;

        accountSelect.appendChild(
          option
        );

      }
    );


    const first =
      state.accounts[0];

    selectAccount(first);

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
        ? account.balance
        : null;

    if (balance !== null) {

      const formatted =
        `${currency} ${
          Number(balance).toFixed(2)
        }`;

      if (accountBalance) {
        accountBalance.textContent =
          formatted;
      }

      const riskBalance =
        document.getElementById(
          "risk-balance"
        );

      if (riskBalance) {
        riskBalance.textContent =
          formatted;
      }

    }

  }


  if (accountSelect) {

    accountSelect.addEventListener(
      "change",
      () => {

        const id =
          accountSelect.value;

        const selected =
          state.accounts.find(
            account =>
              String(
                account.id ||
                account.account_id ||
                account.loginid ||
                account.login ||
                ""
              ) === String(id)
          );

        if (selected) {
          selectAccount(selected);
        }

      }
    );

  }


  /* =====================================================
     MARKET SELECTION
  ====================================================== */

  $all(
    ".market-item"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          $all(
            ".market-item"
          ).forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );

          button.classList.add(
            "active"
          );

          state.symbol =
            button.dataset.symbol ||
            "EUR/USD";

          setText(
            "[data-market]",
            state.symbol
          );

          setText(
            "[data-analysis-market]",
            state.symbol
          );

          state.price = null;

          state.previousPrice = null;

          state.prices = [];

          connectMarket();

        }
      );

    }
  );


  /* =====================================================
     TIMEFRAMES
  ====================================================== */

  $all(
    ".timeframe"
  ).forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          $all(
            ".timeframe"
          ).forEach(
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


  /* =====================================================
     DERIV SYMBOL RESOLUTION
  ====================================================== */

  const symbolMap = {

    "EUR/USD": [
      "frxEURUSD",
      "EURUSD"
    ],

    "GBP/USD": [
      "frxGBPUSD",
      "GBPUSD"
    ],

    "USD/JPY": [
      "frxUSDJPY",
      "USDJPY"
    ],

    "AUD/USD": [
      "frxAUDUSD",
      "AUDUSD"
    ],

    "USD/CAD": [
      "frxUSDCAD",
      "USDCAD"
    ],

    "USD/CHF": [
      "frxUSDCHF",
      "USDCHF"
    ]

  };


  /* =====================================================
     MARKET WEBSOCKET
  ====================================================== */

  function connectMarket() {

    if (state.websocket) {

      try {
        state.websocket.close();
      } catch {}

      state.websocket =
        null;
    }


    const candidates =
      symbolMap[state.symbol] ||
      [];


    if (
      candidates.length === 0
    ) {

      setText(
        "[data-market-status]",
        "UNAVAILABLE"
      );

      return;
    }


    setText(
      "[data-market-status]",
      "CONNECTING"
    );


    connectCandidate(
      candidates,
      0
    );

  }


  function connectCandidate(
    candidates,
    index
  ) {

    if (
      index >= candidates.length
    ) {

      setText(
        "[data-market-status]",
        "MARKET UNAVAILABLE"
      );

      return;
    }


    let socket;

    try {

      socket =
        new WebSocket(
          "wss://ws.derivws.com/websockets/v3?app_id=1089"
        );

    } catch (error) {

      console.error(
        "WEBSOCKET ERROR:",
        error
      );

      return;

    }


    state.websocket =
      socket;


    socket.addEventListener(
      "open",
      () => {

        socket.send(
          JSON.stringify({
            ticks:
              candidates[index]
          })
        );

        setText(
          "[data-market-status]",
          "LIVE"
        );

      }
    );


    socket.addEventListener(
      "message",
      event => {

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

          console.warn(
            "DERIV SYMBOL ERROR:",
            data.error
          );

          try {
            socket.close();
          } catch {}

          connectCandidate(
            candidates,
            index + 1
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
            !Number.isFinite(
              quote
            )
          ) {
            return;
          }

          updatePrice(
            quote
          );

        }

      }
    );


    socket.addEventListener(
      "close",
      () => {

        if (
          state.websocket ===
          socket
        ) {

          state.websocket =
            null;

        }

      }
    );


    socket.addEventListener(
      "error",
      () => {

        try {
          socket.close();
        } catch {}

      }
    );

  }


  /* =====================================================
     PRICE
  ====================================================== */

  function updatePrice(
    price
  ) {

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

      state.prices =
        state.prices.slice(
          -100
        );

    }


    setText(
      "[data-price]",
      formatPrice(price)
    );


    let movement =
      "—";


    if (
      state.previousPrice !==
      null
    ) {

      if (
        price >
        state.previousPrice
      ) {

        movement = "▲ UP";

      } else if (
        price <
        state.previousPrice
      ) {

        movement = "▼ DOWN";

      } else {

        movement = "—";

      }

    }


    setText(
      "[data-move]",
      movement
    );


    updateChart();

    updateAnalysis();

    updateRisk();

  }


  /* =====================================================
     CHART
  ====================================================== */

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
        -80
      );


    const min =
      Math.min(
        ...values
      );

    const max =
      Math.max(
        ...values
      );

    const range =
      max - min ||
      0.00001;


    const points =
      values.map(
        (value, index) => {

          const x =
            (
              index /
              Math.max(
                values.length - 1,
                1
              )
            ) * 1000;

          const y =
            360 -
            (
              (
                value - min
              ) /
              range
            ) * 320;

          return `${x},${y}`;

        }
      ).join(" ");


    line.setAttribute(
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
        (a, b) => a + b,
        0
      ) / recent.length;


    const olderAverage =
      older.length
        ? older.reduce(
            (a, b) => a + b,
            0
          ) / older.length
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


    let momentum =
      "LOW";


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


    if (
      change > 0
    ) {
      momentum =
        "ACTIVE";
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
        : "LIVE"
    );


    const aiMessage =
      document.getElementById(
        "ai-message"
      );


    if (aiMessage) {

      if (
        direction === "CALL"
      ) {

        aiMessage.textContent =
          `${state.symbol} is showing upward short-term momentum. Review the market before entering a trade.`;

      } else if (
        direction === "PUT"
      ) {

        aiMessage.textContent =
          `${state.symbol} is showing downward short-term momentum. Review the market before entering a trade.`;

      } else {

        aiMessage.textContent =
          `No clear short-term direction is currently detected for ${state.symbol}.`;

      }

    }


    updateTradeLevels();

  }


  /* =====================================================
     TRADE LEVELS
  ====================================================== */

  function updateTradeLevels() {

    if (
      state.price === null
    ) {
      return;
    }


    const price =
      state.price;


    const decimals =
      price >= 100
        ? 2
        : 5;


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


  /* =====================================================
     RISK
  ====================================================== */

  function updateRisk() {

    const stake =
      document.getElementById(
        "stake"
      );

    const riskStake =
      document.getElementById(
        "risk-stake"
      );

    if (
      stake &&
      riskStake
    ) {

      riskStake.textContent =
        `${stake.value} USD`;

    }

  }


  if (
    document.getElementById(
      "stake"
    )
  ) {

    document.getElementById(
      "stake"
    ).addEventListener(
      "input",
      updateRisk
    );

  }


  /* =====================================================
     MANUAL TRADE BUTTONS
  ====================================================== */

  const buyButton =
    document.getElementById(
      "buy-button"
    );

  const sellButton =
    document.getElementById(
      "sell-button"
    );


  function tradeMessage(
    message
  ) {

    const element =
      $("[data-trade-message]");

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


        tradeMessage(
          `SELL ${state.symbol} — READY`
        );

      }
    );

  }


  /* =====================================================
     TOOLS
  ====================================================== */

  const createBotButton =
    document.getElementById(
      "create-bot-button"
    );

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
    document.getElementById(
      "bulk-trader-button"
    );

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


  /* =====================================================
     URL LOGIN ERROR
  ====================================================== */

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


  /* =====================================================
     START
  ====================================================== */

  checkSession();

  connectMarket();

});
