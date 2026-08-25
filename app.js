document.addEventListener("DOMContentLoaded", () => {
  const state = {
    symbol: null,
    symbolName: "EUR/USD",
    requestedMarket: "EUR/USD",
    price: null,
    previousPrice: null,
    prices: [],
    connected: false,
    socket: null,
    activeSymbols: [],
    reconnectTimer: null
  };

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const formatPrice = (price) => {
    if (!Number.isFinite(Number(price))) return "—";

    const number = Number(price);

    if (number >= 100) {
      return number.toFixed(3);
    }

    return number.toFixed(5);
  };

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
  };

  /*
   * Convert any of these:
   *
   * EUR/USD
   * EURUSD
   * frxEURUSD
   *
   * into:
   *
   * EUR/USD
   */
  const normaliseMarketName = (value) => {
    if (!value) return "";

    let text = String(value).trim();

    if (/^frx/i.test(text)) {
      text = text.substring(3);
    }

    text = text
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();

    const markets = {
      EURUSD: "EUR/USD",
      GBPUSD: "GBP/USD",
      USDJPY: "USD/JPY",
      AUDUSD: "AUD/USD",
      USDCAD: "USD/CAD",
      USDCHF: "USD/CHF"
    };

    return markets[text] || value;
  };

  /*
   * Get all possible text fields from a Deriv
   * active_symbols record.
   */
  const getSymbolText = (item) => {
    return [
      item.symbol,
      item.underlying_symbol,
      item.display_name,
      item.display_symbol,
      item.underlying_symbol_name,
      item.name,
      item.market_display_name
    ]
      .filter(Boolean)
      .map((value) =>
        String(value)
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase()
      );
  };

  /*
   * Find the real symbol returned by Deriv.
   *
   * We first compare the human-readable market name.
   * Then we check the symbol itself.
   */
  const findDerivSymbol = (marketName) => {
    const wanted = normaliseMarketName(marketName)
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();

    if (!wanted) {
      return null;
    }

    console.log(
      "Looking for market:",
      wanted
    );

    for (const item of state.activeSymbols) {
      const fields = getSymbolText(item);

      /*
       * Exact match against any returned field.
       */
      if (fields.includes(wanted)) {
        return item;
      }

      /*
       * Handle EUR/USD appearing inside a longer
       * description such as "EUR/USD".
       */
      const joined = fields.join(" ");

      if (
        joined.includes(wanted) &&
        (
          joined.includes("EURUSD") ||
          joined.includes("GBPUSD") ||
          joined.includes("USDJPY") ||
          joined.includes("AUDUSD") ||
          joined.includes("USDCAD") ||
          joined.includes("USDCHF")
        )
      ) {
        return item;
      }
    }

    /*
     * Second pass: specifically look for the
     * currency pair in display/name fields.
     */
    const pair = state.activeSymbols.find((item) => {
      const values = [
        item.display_name,
        item.display_symbol,
        item.underlying_symbol_name,
        item.market_display_name,
        item.name
      ];

      return values.some((value) => {
        const cleaned = String(value || "")
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase();

        return cleaned === wanted;
      });
    });

    return pair || null;
  };

  const getActualSymbolCode = (item) => {
    if (!item) return null;

    /*
     * Prefer the actual trading symbol.
     */
    return (
      item.underlying_symbol ||
      item.symbol ||
      item.display_symbol ||
      null
    );
  };

  const updateChart = () => {
    const line = document.querySelector(
      "[data-live-line]"
    );

    if (!line || state.prices.length < 2) {
      return;
    }

    const width = 1000;
    const height = 400;
    const padding = 20;

    const values = state.prices.slice(-60);

    const min = Math.min(...values);
    const max = Math.max(...values);

    const range = max - min || 0.00001;

    const points = values
      .map((value, index) => {
        const x =
          padding +
          (index /
            Math.max(values.length - 1, 1)) *
            (width - padding * 2);

        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    line.setAttribute("points", points);
  };

  const updatePrice = (price) => {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) {
      return;
    }

    state.previousPrice = state.price;
    state.price = numericPrice;

    state.prices.push(numericPrice);

    if (state.prices.length > 100) {
      state.prices.shift();
    }

    setAll(
      "[data-price]",
      formatPrice(numericPrice)
    );

    if (state.previousPrice !== null) {
      const change =
        ((numericPrice - state.previousPrice) /
          state.previousPrice) *
        100;

      setAll(
        "[data-move]",
        `${change >= 0 ? "+" : ""}${change.toFixed(3)}%`
      );
    }

    updateChart();
    updateAnalysis();
  };

  const updateAnalysis = () => {
    if (state.prices.length < 5) {
      return;
    }

    const recent = state.prices.slice(-5);

    const first = recent[0];
    const last = recent[recent.length - 1];

    const difference = last - first;

    let trend = "NEUTRAL";
    let momentum = "LOW";
    let direction = "—";
    let signal = "WAIT";

    if (difference > 0) {
      trend = "BULLISH";
      direction = "UP";
      momentum = "POSITIVE";

      if (state.prices.length >= 10) {
        signal = "CALL";
      }
    }

    if (difference < 0) {
      trend = "BEARISH";
      direction = "DOWN";
      momentum = "NEGATIVE";

      if (state.prices.length >= 10) {
        signal = "PUT";
      }
    }

    setAll("[data-trend]", trend);
    setAll("[data-momentum]", momentum);
    setAll("[data-direction]", direction);
    setAll("[data-signal]", signal);

    const signalElement =
      document.querySelector("[data-signal]");

    if (signalElement) {
      signalElement.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "CALL") {
        signalElement.classList.add("buy");
      } else if (signal === "PUT") {
        signalElement.classList.add("sell");
      } else {
        signalElement.classList.add("wait");
      }
    }

    if (state.price !== null) {
      setAll(
        "[data-entry]",
        formatPrice(state.price)
      );

      setAll(
        "[data-stop]",
        formatPrice(
          state.price -
            Math.abs(
              difference ||
                state.price * 0.001
            )
        )
      );

      setAll(
        "[data-target]",
        formatPrice(
          state.price +
            Math.abs(
              difference ||
                state.price * 0.002
            )
        )
      );
    }
  };

  const setMarket = (value) => {
    const marketName =
      normaliseMarketName(value);

    state.requestedMarket = marketName;
    state.symbolName = marketName;

    state.price = null;
    state.previousPrice = null;
    state.prices = [];

    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );

    setAll("[data-price]", "—");
    setAll("[data-move]", "—");
    setAll("[data-signal]", "WAIT");
    setAll("[data-trend]", "WAIT");
    setAll("[data-momentum]", "WAIT");
    setAll("[data-direction]", "—");
    setAll("[data-entry]", "—");
    setAll("[data-stop]", "—");
    setAll("[data-target]", "—");

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
      state.socket
    ) {
      subscribeToRequestedMarket();
    }
  };

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

  const setupTimeframes = () => {
    all("[data-timeframe]").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            all(
              "[data-timeframe]"
            ).forEach((item) => {
              item.classList.remove(
                "active"
              );
            });

            button.classList.add(
              "active"
            );
          }
        );
      }
    );
  };

  const setupTradingButtons = () => {
    const buy =
      document.querySelector(
        "#buy-button"
      );

    const sell =
      document.querySelector(
        "#sell-button"
      );

    const message =
      document.querySelector(
        "[data-trade-message]"
      );

    if (buy) {
      buy.addEventListener(
        "click",
        () => {
          if (message) {
            message.textContent =
              "LOGIN REQUIRED";
          }

          window.location.href =
            "/api/deriv/login";
        }
      );
    }

    if (sell) {
      sell.addEventListener(
        "click",
        () => {
          if (message) {
            message.textContent =
              "LOGIN REQUIRED";
          }

          window.location.href =
            "/api/deriv/login";
        }
      );
    }
  };

  /*
   * Ask Deriv for its current active symbols.
   */
  const requestActiveSymbols = () => {
    if (!state.socket) {
      return;
    }

    setStatus("LOADING MARKETS");

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief"
      })
    );
  };

  /*
   * Subscribe to the real symbol returned
   * by Deriv.
   */
  const subscribeToRequestedMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const market =
      findDerivSymbol(
        state.requestedMarket
      );

    if (!market) {
      console.error(
        "MARKET NOT FOUND:",
        state.requestedMarket
      );

      console.log(
        "AVAILABLE SYMBOLS:",
        state.activeSymbols
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    const actualSymbol =
      getActualSymbolCode(market);

    if (!actualSymbol) {
      console.error(
        "No trading symbol found in:",
        market
      );

      setStatus(
        "SYMBOL UNAVAILABLE"
      );

      return;
    }

    state.symbol =
      actualSymbol;

    console.log(
      "MARKET FOUND:",
      state.requestedMarket
    );

    console.log(
      "DERIV SYMBOL:",
      state.symbol
    );

    /*
     * Stop previous tick subscriptions.
     */
    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    /*
     * Subscribe to the actual symbol
     * returned by Deriv.
     */
    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1
      })
    );

    setStatus("LIVE");
  };

  const connectToDeriv = () => {
    if (state.reconnectTimer) {
      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer = null;
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

    setStatus("CONNECTING");

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

      setStatus("OFFLINE");

      return;
    }

    state.socket = socket;

    socket.addEventListener(
      "open",
      () => {
        state.connected = true;

        console.log(
          "DERIV CONNECTED"
        );

        requestActiveSymbols();
      }
    );

    socket.addEventListener(
      "message",
      (event) => {
        try {
          const data =
            JSON.parse(
              event.data
            );

          /*
           * Active symbols response.
           */
          if (
            data.msg_type ===
              "active_symbols" &&
            Array.isArray(
              data.active_symbols
            )
          ) {
            state.activeSymbols =
              data.active_symbols;

            console.log(
              "ACTIVE SYMBOLS RECEIVED:",
              state.activeSymbols.length
            );

            /*
             * IMPORTANT:
             * Show the actual returned
             * EUR/USD record in console.
             */
            const eur =
              findDerivSymbol(
                "EUR/USD"
              );

            console.log(
              "EUR/USD RECORD:",
              eur
            );

            subscribeToRequestedMarket();

            return;
          }

          /*
           * Deriv API error.
           */
          if (data.error) {
            console.error(
              "DERIV ERROR:",
              data.error
            );

            setStatus(
              data.error.code ===
                "InvalidSymbol"
                ? "INVALID SYMBOL"
                : "MARKET ERROR"
            );

            return;
          }

          /*
           * Live tick.
           */
          if (
            data.tick &&
            data.tick.quote !==
              undefined
          ) {
            updatePrice(
              data.tick.quote
            );
          }
        } catch (error) {
          console.error(
            "MESSAGE ERROR:",
            error
          );
        }
      }
    );

    socket.addEventListener(
      "error",
      (error) => {
        console.error(
          "DERIV SOCKET ERROR:",
          error
        );

        state.connected = false;

        setStatus("OFFLINE");
      }
    );

    socket.addEventListener(
      "close",
      () => {
        state.connected = false;
        state.socket = null;

        setStatus(
          "RECONNECTING"
        );

        state.reconnectTimer =
          setTimeout(
            () => {
              connectToDeriv();
            },
            3000
          );
      }
    );
  };

  const initialise = () => {
    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";

    setAll(
      "[data-market]",
      state.symbolName
    );

    setAll(
      "[data-analysis-market]",
      state.symbolName
    );

    setAll(
      "[data-price]",
      "—"
    );

    setAll(
      "[data-move]",
      "—"
    );

    setAll(
      "[data-market-status]",
      "CONNECTING"
    );

    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();

    connectToDeriv();
  };

  initialise();
});
