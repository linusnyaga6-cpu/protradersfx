/* ============================================================
   PROTRADERS FX
   LIVE MARKET ENGINE
   ============================================================ */

(() => {
  "use strict";

  console.log("PROTRADERS FX MARKET ENGINE STARTING");

  /* ==========================================================
     CONFIG
  ========================================================== */

  const CONFIG = {
    websocketUrl:
      "wss://ws.derivws.com/websockets/v3",

    appId: null,

    reconnectDelay: 3000,

    maxPrices: 180,

    defaultMarket: "EUR/USD",

    markets: {
      "EUR/USD": {
        symbol: null,
        aliases: [
          "frxEURUSD",
          "EURUSD"
        ]
      },

      "GBP/USD": {
        symbol: null,
        aliases: [
          "frxGBPUSD",
          "GBPUSD"
        ]
      },

      "USD/JPY": {
        symbol: null,
        aliases: [
          "frxUSDJPY",
          "USDJPY"
        ]
      },

      "AUD/USD": {
        symbol: null,
        aliases: [
          "frxAUDUSD",
          "AUDUSD"
        ]
      },

      "USD/CAD": {
        symbol: null,
        aliases: [
          "frxUSDCAD",
          "USDCAD"
        ]
      },

      "USD/CHF": {
        symbol: null,
        aliases: [
          "frxUSDCHF",
          "USDCHF"
        ]
      }
    }
  };


  /* ==========================================================
     STATE
  ========================================================== */

  const state = {

    socket: null,

    connected: false,

    connecting: false,

    reconnectTimer: null,

    selectedMarket: CONFIG.defaultMarket,

    selectedSymbol: null,

    prices: {},

    previousPrices: {},

    history: {},

    lastTickTime: null,

    requestId: 0,

    symbolDiscoveryComplete: false

  };


  /* ==========================================================
     DOM HELPERS
  ========================================================== */

  function all(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    );
  }


  function first(selector) {
    return document.querySelector(selector);
  }


  function setText(selector, value) {

    all(selector).forEach((element) => {

      element.textContent =
        value === undefined ||
        value === null
          ? "—"
          : String(value);

    });

  }


  /* ==========================================================
     NUMBER HELPERS
  ========================================================== */

  function number(value) {

    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;

  }


  function decimalsForPrice(value) {

    const n = number(value);

    if (n === null) {
      return 5;
    }

    if (Math.abs(n) >= 100) {
      return 3;
    }

    if (Math.abs(n) >= 10) {
      return 3;
    }

    return 5;
  }


  function formatPrice(value) {

    const n =
      number(value);

    if (n === null) {
      return "—";
    }

    return n.toFixed(
      decimalsForPrice(n)
    );

  }


  function formatChange(value) {

    const n =
      number(value);

    if (n === null) {
      return "—";
    }

    const sign =
      n > 0
        ? "+"
        : "";

    return sign + n.toFixed(
      decimalsForPrice(n)
    );

  }


  /* ==========================================================
     MARKET DISPLAY
  ========================================================== */

  function updateMarketNames() {

    setText(
      "[data-market]",
      state.selectedMarket
    );

    setText(
      "[data-analysis-market]",
      state.selectedMarket
    );

  }


  /* ==========================================================
     CONNECTION STATUS
  ========================================================== */

  function updateConnectionStatus(
    text,
    live
  ) {

    all(
      "[data-market-status]"
    ).forEach((element) => {

      element.textContent =
        text;

      element.classList.toggle(
        "live",
        Boolean(live)
      );

    });

  }


  /* ==========================================================
     TICKER PRICES
  ========================================================== */

  function updateTicker(
    market,
    price
  ) {

    all(
      `[data-ticker-price="${market}"]`
    ).forEach((element) => {

      element.textContent =
        formatPrice(price);

    });

  }


  /* ==========================================================
     MAIN PRICE
  ========================================================== */

  function updateMainPrice(
    market,
    price
  ) {

    if (
      market !== state.selectedMarket
    ) {
      return;
    }


    const previous =
      state.previousPrices[market];


    setText(
      "[data-price]",
      formatPrice(price)
    );


    let change = null;

    if (
      previous !== undefined &&
      previous !== null
    ) {

      change =
        price - previous;

    }


    all(
      "[data-move]"
    ).forEach((element) => {

      element.classList.remove(
        "positive",
        "negative"
      );


      if (change === null) {

        element.textContent =
          "LIVE";

        return;

      }


      if (change > 0) {

        element.textContent =
          "+" +
          formatPrice(
            Math.abs(change)
          );

        element.classList.add(
          "positive"
        );

      } else if (change < 0) {

        element.textContent =
          "-" +
          formatPrice(
            Math.abs(change)
          );

        element.classList.add(
          "negative"
        );

      } else {

        element.textContent =
          "0.00000";

      }

    });

  }


  /* ==========================================================
     CHART
  ========================================================== */

  function addHistory(
    market,
    price
  ) {

    if (
      !state.history[market]
    ) {

      state.history[market] =
        [];

    }


    const history =
      state.history[market];


    history.push(
      number(price)
    );


    while (
      history.length >
      CONFIG.maxPrices
    ) {

      history.shift();

    }

  }


  function drawChart() {

    const line =
      first(
        "[data-live-line]"
      );


    if (!line) {
      return;
    }


    const history =
      state.history[
        state.selectedMarket
      ] || [];


    const values =
      history.filter(
        (value) =>
          Number.isFinite(value)
      );


    if (
      values.length < 2
    ) {

      line.setAttribute(
        "points",
        ""
      );

      return;

    }


    let min =
      Math.min(...values);

    let max =
      Math.max(...values);


    if (
      max === min
    ) {

      max += 0.00001;
      min -= 0.00001;

    }


    const width = 1000;
    const height = 360;

    const paddingX = 5;
    const paddingY = 18;


    const usableWidth =
      width -
      paddingX * 2;


    const usableHeight =
      height -
      paddingY * 2;


    const points =
      values.map(
        (value, index) => {

          const x =
            paddingX +
            (
              index /
              Math.max(
                1,
                values.length - 1
              )
            ) *
            usableWidth;


          const y =
            paddingY +
            (
              1 -
              (
                (value - min) /
                (max - min)
              )
            ) *
            usableHeight;


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


    updateChartAxis(
      min,
      max
    );

  }


  function updateChartAxis(
    min,
    max
  ) {

    const values = [

      max,

      max -
        ((max - min) * 0.25),

      min +
        ((max - min) * 0.50),

      min +
        ((max - min) * 0.25),

      min

    ];


    const axis =
      all(".chart-axis span");


    axis.forEach(
      (element, index) => {

        if (
          values[index] !== undefined
        ) {

          element.textContent =
            formatPrice(
              values[index]
            );

        }

      }
    );

  }


  /* ==========================================================
     ANALYSIS ENGINE
  ========================================================== */

  function calculateAnalysis(
    market
  ) {

    const history =
      state.history[market] || [];


    if (
      history.length < 3
    ) {

      updateAnalysis(
        "WAIT",
        "—",
        "WAIT",
        "WAIT"
      );

      return;

    }


    const recent =
      history.slice(-20);


    const firstPrice =
      recent[0];


    const lastPrice =
      recent[recent.length - 1];


    const difference =
      lastPrice -
      firstPrice;


    const movement =
      Math.abs(difference);


    let direction =
      "WAIT";


    if (
      difference > 0
    ) {

      direction =
        "BUY";

    } else if (
      difference < 0
    ) {

      direction =
        "SELL";

    }


    let momentum =
      "NEUTRAL";


    if (
      movement >
      Math.abs(
        firstPrice * 0.00005
      )
    ) {

      momentum =
        difference > 0
          ? "POSITIVE"
          : "NEGATIVE";

    }


    let trend =
      "SIDEWAYS";


    if (
      recent.length >= 10
    ) {

      const midpoint =
        recent[
          Math.floor(
            recent.length / 2
          )
        ];


      if (
        lastPrice >
        midpoint
      ) {

        trend =
          "BULLISH";

      } else if (
        lastPrice <
        midpoint
      ) {

        trend =
          "BEARISH";

      }

    }


    let signal =
      "WAIT";


    if (
      direction === "BUY" &&
      trend === "BULLISH"
    ) {

      signal =
        "BUY";

    } else if (
      direction === "SELL" &&
      trend === "BEARISH"
    ) {

      signal =
        "SELL";

    }


    updateAnalysis(
      trend,
      momentum,
      direction,
      signal
    );

  }


  function updateAnalysis(
    trend,
    momentum,
    direction,
    signal
  ) {

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
      signal
    );


    all(
      "[data-signal]"
    ).forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );


      if (
        signal === "BUY"
      ) {

        element.classList.add(
          "buy"
        );

      } else if (
        signal === "SELL"
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


    all(
      "[data-direction]"
    ).forEach((element) => {

      element.classList.remove(
        "wait",
        "buy",
        "sell"
      );


      if (
        direction === "BUY"
      ) {

        element.classList.add(
          "buy"
        );

      } else if (
        direction === "SELL"
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


    const bias =
      signal === "BUY"
        ? "BUY"
        : signal === "SELL"
          ? "SELL"
          : "WAIT";


    setText(
      "[data-ai-bias]",
      bias
    );


    const history =
      state.history[
        state.selectedMarket
      ] || [];


    let confidence =
      "—";


    if (
      history.length >= 5
    ) {

      const recent =
        history.slice(-20);


      let positive = 0;
      let negative = 0;


      for (
        let i = 1;
        i < recent.length;
        i++
      ) {

        if (
          recent[i] >
          recent[i - 1]
        ) {

          positive++;

        } else if (
          recent[i] <
          recent[i - 1]
        ) {

          negative++;

        }

      }


      const total =
        positive +
        negative;


      if (total > 0) {

        const strongest =
          Math.max(
            positive,
            negative
          );


        confidence =
          Math.round(
            (strongest / total) *
            100
          ) + "%";

      }

    }


    setText(
      "[data-ai-confidence]",
      confidence
    );


    updateLevels();

  }


  /* ==========================================================
     TRADE LEVELS
  ========================================================== */

  function updateLevels() {

    const price =
      state.prices[
        state.selectedMarket
      ];


    if (
      !Number.isFinite(price)
    ) {

      return;

    }


    const history =
      state.history[
        state.selectedMarket
      ] || [];


    let volatility =
      price * 0.001;


    if (
      history.length >= 5
    ) {

      const recent =
        history.slice(-20);


      let total = 0;
      let count = 0;


      for (
        let i = 1;
        i < recent.length;
        i++
      ) {

        total +=
          Math.abs(
            recent[i] -
            recent[i - 1]
          );

        count++;

      }


      if (
        count > 0
      ) {

        volatility =
          Math.max(
            total / count * 8,
            price * 0.0001
          );

      }

    }


    const signalElement =
      first("[data-signal]");


    const signal =
      signalElement
        ? signalElement.textContent
        : "WAIT";


    let entry =
      price;


    let stop =
      price -
      volatility;


    let target =
      price +
      volatility * 2;


    if (
      signal === "SELL"
    ) {

      stop =
        price +
        volatility;

      target =
        price -
        volatility * 2;

    }


    setText(
      "[data-entry]",
      formatPrice(entry)
    );

    setText(
      "[data-stop]",
      formatPrice(stop)
    );

    setText(
      "[data-target]",
      formatPrice(target)
    );


    const message =
      first("#ai-message");


    if (message) {

      if (
        signal === "BUY"
      ) {

        message.textContent =
          "Short-term market structure is currently bullish.";

      } else if (
        signal === "SELL"
      ) {

        message.textContent =
          "Short-term market structure is currently bearish.";

      } else {

        message.textContent =
          "Waiting for stronger short-term market confirmation.";

      }

    }

  }


  /* ==========================================================
     HANDLE TICK
  ========================================================== */

  function handleTick(
    tick
  ) {

    if (
      !tick ||
      !tick.symbol ||
      tick.quote === undefined
    ) {

      return;

    }


    const quote =
      number(tick.quote);


    if (
      quote === null
    ) {

      return;

    }


    const market =
      findMarketBySymbol(
        tick.symbol
      );


    if (!market) {

      return;

    }


    state.previousPrices[market] =
      state.prices[market];


    state.prices[market] =
      quote;


    addHistory(
      market,
      quote
    );


    updateTicker(
      market,
      quote
    );


    updateMainPrice(
      market,
      quote
    );


    if (
      market ===
      state.selectedMarket
    ) {

      state.lastTickTime =
        Date.now();


      drawChart();

      calculateAnalysis(
        market
      );

    }

  }


  /* ==========================================================
     SYMBOL LOOKUP
  ========================================================== */

  function findMarketBySymbol(
    symbol
  ) {

    for (
      const market of Object.keys(
        CONFIG.markets
      )
    ) {

      const config =
        CONFIG.markets[market];


      if (
        config.symbol ===
        symbol
      ) {

        return market;

      }


      if (
        config.aliases.includes(
          symbol
        )
      ) {

        return market;

      }

    }


    return null;

  }


  function discoverSymbols(
    activeSymbols
  ) {

    if (
      !Array.isArray(
        activeSymbols
      )
    ) {

      return;

    }


    const available =
      new Map();


    activeSymbols.forEach(
      (item) => {

        if (
          item &&
          item.symbol
        ) {

          available.set(
            item.symbol,
            item
          );

        }

      }
    );


    Object.keys(
      CONFIG.markets
    ).forEach(
      (market) => {

        const config =
          CONFIG.markets[market];


        let found =
          null;


        /*
        First look for exact aliases.
        */

        for (
          const alias of
          config.aliases
        ) {

          if (
            available.has(
              alias
            )
          ) {

            found =
              alias;

            break;

          }

        }


        /*
        Then look at display names.
        */

        if (!found) {

          for (
            const [symbol, item]
            of available.entries()
          ) {

            const display =
              String(
                item.display_name ||
                ""
              ).toUpperCase();


            const normalizedMarket =
              market.replace(
                "/",
                ""
              );


            if (
              display ===
              market
                .replace(
                  "/",
                  ""
                )
                .toUpperCase()
            ) {

              found =
                symbol;

              break;

            }


            if (
              display ===
              market.toUpperCase()
            ) {

              found =
                symbol;

              break;

            }


            if (
              symbol
                .replace(
                  /^frx/i,
                  ""
                )
                .toUpperCase() ===
              normalizedMarket
            ) {

              found =
                symbol;

              break;

            }

          }

        }


        if (found) {

          config.symbol =
            found;

          console.log(
            "PROTRADERS FX SYMBOL:",
            market,
            "=>",
            found
          );

        } else {

          console.warn(
            "PROTRADERS FX SYMBOL NOT FOUND:",
            market
          );

        }

      }
    );


    state.symbolDiscoveryComplete =
      true;


    selectCurrentSymbol();

  }


  /* ==========================================================
     SELECT CURRENT MARKET
  ========================================================== */

  function selectCurrentSymbol() {

    const config =
      CONFIG.markets[
        state.selectedMarket
      ];


    if (!config) {
      return;
    }


    state.selectedSymbol =
      config.symbol;


    updateMarketNames();


    const history =
      state.history[
        state.selectedMarket
      ] || [];


    drawChart();


    if (
      state.prices[
        state.selectedMarket
      ] !== undefined
    ) {

      updateMainPrice(
        state.selectedMarket,
        state.prices[
          state.selectedMarket
        ]
      );

      calculateAnalysis(
        state.selectedMarket
      );

    } else {

      setText(
        "[data-price]",
        "—"
      );

      setText(
        "[data-move]",
        "WAITING FOR PRICE"
      );

    }


    if (
      state.connected &&
      state.selectedSymbol
    ) {

      subscribeToSymbol(
        state.selectedSymbol
      );

    }

  }


  /* ==========================================================
     SUBSCRIBE
  ========================================================== */

  function subscribeToSymbol(
    symbol
  ) {

    if (
      !state.socket ||
      state.socket.readyState !==
      WebSocket.OPEN
    ) {

      return;

    }


    state.requestId++;


    try {

      state.socket.send(
        JSON.stringify({
          forget_all: "ticks"
        })
      );

    } catch (error) {

      console.warn(
        "Unable to clear subscriptions:",
        error
      );

    }


    try {

      state.socket.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id:
            state.requestId
        })
      );


      console.log(
        "PROTRADERS FX SUBSCRIBING:",
        symbol
      );

    } catch (error) {

      console.error(
        "SUBSCRIBE ERROR:",
        error
      );

    }

  }


  /* ==========================================================
     WEBSOCKET CONNECT
     ========================================================== */

  function connect() {

    if (
      state.connecting
    ) {

      return;

    }


    if (
      state.socket &&
      state.socket.readyState ===
      WebSocket.OPEN
    ) {

      return;

    }


    state.connecting =
      true;


    updateConnectionStatus(
      "CONNECTING",
      false
    );


    let url =
      CONFIG.websocketUrl;


    /*
    app_id is optional for the public
    connection. If the server provides one,
    use it.
    */

    if (
      CONFIG.appId
    ) {

      url +=
        "?app_id=" +
        encodeURIComponent(
          CONFIG.appId
        );

    }


    console.log(
      "PROTRADERS FX CONNECTING:",
      url
    );


    try {

      state.socket =
        new WebSocket(
          url
        );

    } catch (error) {

      state.connecting =
        false;

      console.error(
        "WEBSOCKET CREATE ERROR:",
        error
      );

      scheduleReconnect();

      return;

    }


    state.socket.onopen =
      () => {

        state.connecting =
          false;

        state.connected =
          true;


        console.log(
          "PROTRADERS FX DERIV WEBSOCKET CONNECTED"
        );


        updateConnectionStatus(
          "LIVE",
          true
        );


        /*
        Ask Deriv which symbols are
        currently available.
        */

        state.socket.send(
          JSON.stringify({
            active_symbols:
              "brief",
            product_type:
              "basic",
            req_id:
              ++state.requestId
          })
        );

      };


    state.socket.onmessage =
      (event) => {

        let data;


        try {

          data =
            JSON.parse(
              event.data
            );

        } catch (error) {

          console.warn(
            "INVALID DERIV MESSAGE:",
            event.data
          );

          return;

        }


        /*
        API error
        */

        if (
          data.error
        ) {

          console.error(
            "DERIV API ERROR:",
            data.error
          );


          if (
            data.error.code ===
            "InvalidSymbol"
          ) {

            updateConnectionStatus(
              "MARKET ERROR",
              false
            );

          }


          return;

        }


        /*
        Active symbols response
        */

        if (
          data.msg_type ===
          "active_symbols"
        ) {

          console.log(
            "PROTRADERS FX ACTIVE SYMBOLS RECEIVED"
          );


          discoverSymbols(
            data.active_symbols
          );


          return;

        }


        /*
        Tick response
        */

        if (
          data.msg_type ===
          "tick"
        ) {

          handleTick(
            data.tick
          );

          return;

        }

      };


    state.socket.onerror =
      (event) => {

        console.error(
          "Deriv WebSocket error:",
          event
        );


        state.connected =
          false;


        updateConnectionStatus(
          "CONNECTION ERROR",
          false
        );

      };


    state.socket.onclose =
      (event) => {

        state.connected =
          false;

        state.connecting =
          false;


        console.warn(
          "Deriv WebSocket closed:",
          event.code,
          event.reason
        );


        updateConnectionStatus(
          "RECONNECTING",
          false
        );


        scheduleReconnect();

      };

  }


  /* ==========================================================
     RECONNECT
  ========================================================== */

  function scheduleReconnect() {

    if (
      state.reconnectTimer
    ) {

      return;

    }


    state.reconnectTimer =
      setTimeout(
        () => {

          state.reconnectTimer =
            null;

          connect();

        },
        CONFIG.reconnectDelay
      );

  }


  /* ==========================================================
     MARKET BUTTONS
  ========================================================== */

  function setupMarketButtons() {

    all(
      ".market-item"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const market =
              button.dataset.symbol;


            if (
              !CONFIG.markets[
                market
              ]
            ) {

              return;

            }


            all(
              ".market-item"
            ).forEach(
              (item) => {

                item.classList.toggle(
                  "active",
                  item === button
                );

              }
            );


            state.selectedMarket =
              market;


            selectCurrentSymbol();

          }
        );

      }
    );

  }


  /* ==========================================================
     TIMEFRAMES
     ========================================================== */

  function setupTimeframes() {

    all(
      ".timeframe"
    ).forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            all(
              ".timeframe"
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

  }


  /* ==========================================================
     TRADE BUTTONS
     ========================================================== */

  function setupTrading() {

    const buy =
      first("#buy-button");


    const sell =
      first("#sell-button");


    const message =
      first("[data-trade-message]");


    const stake =
      first("#stake");


    if (
      buy
    ) {

      buy.addEventListener(
        "click",
        () => {

          if (
            message
          ) {

            message.textContent =
              "LOG IN TO TRADE";

          }

        }
      );

    }


    if (
      sell
    ) {

      sell.addEventListener(
        "click",
        () => {

          if (
            message
          ) {

            message.textContent =
              "LOG IN TO TRADE";

          }

        }
      );

    }


    if (
      stake
    ) {

      stake.addEventListener(
        "input",
        () => {

          const risk =
            first("#risk-stake");


          if (
            risk
          ) {

            const value =
              Number(
                stake.value
              );


            if (
              Number.isFinite(value) &&
              value > 0
            ) {

              risk.textContent =
                value +
                " USD";

            }

          }

        }
      );

    }

  }


  /* ==========================================================
     OPTIONAL SERVER CONFIG
     ========================================================== */

  async function loadServerConfig() {

    try {

      const response =
        await fetch(
          "/api/config",
          {
            cache:
              "no-store"
          }
        );


      if (
        !response.ok
      ) {

        return;

      }


      const data =
        await response.json();


      /*
      Use an explicitly supplied
      WebSocket app id if your backend
      exposes one in the future.
      */

      if (
        data &&
        data.appId
      ) {

        CONFIG.appId =
          String(
            data.appId
          );

      }

    } catch (error) {

      console.warn(
        "CONFIG LOAD WARNING:",
        error
      );

    }

  }


  /* ==========================================================
     INITIAL UI
     ========================================================== */

  function initializeUI() {

    updateMarketNames();


    updateConnectionStatus(
      "CONNECTING",
      false
    );


    setText(
      "[data-price]",
      "—"
    );


    setText(
      "[data-move]",
      "WAITING FOR PRICE"
    );


    setText(
      "[data-trend]",
      "WAIT"
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


    setText(
      "[data-ai-bias]",
      "WAIT"
    );


    setText(
      "[data-ai-confidence]",
      "—"
    );

  }


  /* ==========================================================
     INIT
     ========================================================== */

  async function init() {

    initializeUI();

    setupMarketButtons();

    setupTimeframes();

    setupTrading();

    await loadServerConfig();

    connect();

  }


  /* ==========================================================
     START
     ========================================================== */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }


  /* ==========================================================
     DEBUG API
     ========================================================== */

  window.ProTradersFX = {

    state,

    config: CONFIG,

    reconnect: () => {

      if (
        state.socket
      ) {

        try {
          state.socket.close();
        } catch (_) {}

      }

      connect();

    },

    selectMarket: (
      market
    ) => {

      if (
        CONFIG.markets[
          market
        ]
      ) {

        state.selectedMarket =
          market;

        selectCurrentSymbol();

      }

    }

  };

})();
