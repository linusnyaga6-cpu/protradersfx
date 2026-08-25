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

  /*
   * These are DISPLAY names only.
   * We no longer assume that these are Deriv symbol codes.
   */
  const marketNames = {
    "EUR/USD": "EUR/USD",
    "GBP/USD": "GBP/USD",
    "USD/JPY": "USD/JPY",
    "AUD/USD": "AUD/USD",
    "USD/CAD": "USD/CAD",
    "USD/CHF": "USD/CHF"
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

    if (number >= 100) return number.toFixed(3);

    return number.toFixed(5);
  };

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
  };

  /*
   * Convert button values such as:
   * frxEURUSD
   * EUR/USD
   * EURUSD
   *
   * into a normal market name.
   */
  const normaliseMarketName = (value) => {
    if (!value) return "";

    let text = String(value).trim();

    if (marketNames[text]) {
      return marketNames[text];
    }

    if (/^frx/i.test(text)) {
      text = text.substring(3);
    }

    text = text.replace(/[^A-Za-z]/g, "").toUpperCase();

    const knownMarkets = [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "USDCAD",
      "USDCHF"
    ];

    if (knownMarkets.includes(text)) {
      return `${text.substring(0, 3)}/${text.substring(3, 6)}`;
    }

    return value;
  };

  /*
   * Find the actual Deriv symbol returned by active_symbols.
   *
   * We do NOT guess the symbol code.
   */
  const findDerivSymbol = (marketName) => {
    const wanted = normaliseMarketName(marketName)
      .replace("/", "")
      .toUpperCase();

    if (!wanted || !state.activeSymbols.length) {
      return null;
    }

    const exact = state.activeSymbols.find((item) => {
      const displayName = String(
        item.display_name ||
        item.display_symbol ||
        item.name ||
        ""
      )
        .replace(/[^A-Za-z]/g, "")
        .toUpperCase();

      return displayName === wanted;
    });

    if (exact && exact.symbol) {
      return exact;
    }

    /*
     * Some Deriv responses may expose the market name
     * differently. Check several possible fields.
     */
    const partial = state.activeSymbols.find((item) => {
      const values = [
        item.display_name,
        item.display_symbol,
        item.name,
        item.symbol
      ];

      return values.some((value) => {
        const cleaned = String(value || "")
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase();

        return cleaned === wanted;
      });
    });

    return partial || null;
  };

  const updateChart = () => {
    const line = document.querySelector("[data-live-line]");

    if (!line || state.prices.length < 2) return;

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
          (index / Math.max(values.length - 1, 1)) *
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

    if (!Number.isFinite(numericPrice)) return;

    state.previousPrice = state.price;
    state.price = numericPrice;

    state.prices.push(numericPrice);

    if (state.prices.length > 100) {
      state.prices.shift();
    }

    setAll("[data-price]", formatPrice(numericPrice));

    if (state.previousPrice !== null) {
      const change =
        ((numericPrice - state.previousPrice) /
          state.previousPrice) *
        100;

      const formatted =
        `${change >= 0 ? "+" : ""}${change.toFixed(3)}%`;

      setAll("[data-move]", formatted);
    }

    updateChart();
    updateAnalysis();
  };

  const updateAnalysis = () => {
    if (state.prices.length < 5) return;

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
    } else if (difference < 0) {
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

    const signalElement = document.querySelector("[data-signal]");

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
      setAll("[data-entry]", formatPrice(state.price));

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

  /*
   * Change the selected market.
   *
   * The argument can be the old button data-symbol,
   * but it gets converted into a market name first.
   */
  const setMarket = (value) => {
    const marketName = normaliseMarketName(value);

    state.requestedMarket = marketName;
    state.symbolName = marketName;

    state.price = null;
    state.previousPrice = null;
    state.prices = [];

    setAll("[data-market]", state.symbolName);
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

    all("[data-symbol]").forEach((button) => {
      const buttonMarket = normaliseMarketName(
        button.dataset.symbol ||
        button.textContent
      );

      button.classList.toggle(
        "active",
        buttonMarket === marketName
      );
    });

    if (state.connected && state.socket) {
      subscribeToRequestedMarket();
    }
  };

  const setupMarketButtons = () => {
    all("[data-symbol]").forEach((button) => {
      button.addEventListener("click", () => {
        setMarket(
          button.dataset.symbol ||
          button.textContent
        );
      });
    });
  };

  const setupTimeframes = () => {
    all("[data-timeframe]").forEach((button) => {
      button.addEventListener("click", () => {
        all("[data-timeframe]").forEach((item) => {
          item.classList.remove("active");
        });

        button.classList.add("active");
      });
    });
  };

  const setupTradingButtons = () => {
    const buy = document.querySelector("#buy-button");
    const sell = document.querySelector("#sell-button");

    const message = document.querySelector(
      "[data-trade-message]"
    );

    if (buy) {
      buy.addEventListener("click", () => {
        if (message) {
          message.textContent = "LOGIN REQUIRED";
        }

        window.location.href =
          "/api/deriv/login";
      });
    }

    if (sell) {
      sell.addEventListener("click", () => {
        if (message) {
          message.textContent = "LOGIN REQUIRED";
        }

        window.location.href =
          "/api/deriv/login";
      });
    }
  };

  /*
   * Ask Deriv for the currently available symbols.
   *
   * This is the important replacement for:
   * ticks: "frxEURUSD"
   */
  const requestActiveSymbols = () => {
    if (!state.socket) return;

    setStatus("LOADING MARKETS");

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief",
        product_type: "basic"
      })
    );
  };

  /*
   * After Deriv returns its current symbols,
   * find the real symbol code and subscribe to it.
   */
  const subscribeToRequestedMarket = () => {
    if (!state.socket || !state.connected) {
      return;
    }

    const market = findDerivSymbol(
      state.requestedMarket
    );

    if (!market || !market.symbol) {
      console.error(
        "Deriv symbol not found:",
        state.requestedMarket,
        state.activeSymbols
      );

      setStatus("MARKET UNAVAILABLE");
      return;
    }

    /*
     * Save the symbol returned by Deriv.
     */
    state.symbol = market.symbol;

    /*
     * Unsubscribe from any previous tick stream.
     */
    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    /*
     * Subscribe using the ACTUAL symbol returned
     * by Deriv.
     */
    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1
      })
    );

    setStatus("LIVE");

    console.log(
      "Subscribed to:",
      state.requestedMarket,
      "=>",
      state.symbol
    );
  };

  const connectToDeriv = () => {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    if (
      state.socket &&
      (
        state.socket.readyState === WebSocket.OPEN ||
        state.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    setStatus("CONNECTING");

    let socket;

    try {
      socket = new WebSocket(
        "wss://ws.derivws.com/websockets/v3?app_id=1089"
      );
    } catch (error) {
      console.error(
        "Unable to create Deriv WebSocket:",
        error
      );

      state.connected = false;
      setStatus("OFFLINE");

      return;
    }

    state.socket = socket;

    socket.addEventListener("open", () => {
      state.connected = true;

      console.log("Deriv WebSocket connected");

      /*
       * First ask Deriv what symbols are actually available.
       */
      requestActiveSymbols();
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        /*
         * Handle active_symbols response.
         */
        if (
          data.msg_type === "active_symbols" &&
          Array.isArray(data.active_symbols)
        ) {
          state.activeSymbols =
            data.active_symbols;

          console.log(
            "Deriv active symbols received:",
            state.activeSymbols.length
          );

          subscribeToRequestedMarket();

          return;
        }

        /*
         * Handle API errors.
         */
        if (data.error) {
          console.error(
            "Deriv API error:",
            data.error
          );

          setStatus(
            data.error.code === "InvalidSymbol"
              ? "INVALID SYMBOL"
              : "MARKET ERROR"
          );

          return;
        }

        /*
         * Handle live tick.
         */
        if (
          data.tick &&
          data.tick.quote !== undefined
        ) {
          updatePrice(data.tick.quote);
        }
      } catch (error) {
        console.error(
          "Market data error:",
          error
        );
      }
    });

    socket.addEventListener("error", (error) => {
      console.error(
        "Deriv WebSocket error:",
        error
      );

      state.connected = false;
      setStatus("OFFLINE");
    });

    socket.addEventListener("close", () => {
      state.connected = false;
      state.socket = null;

      setStatus("RECONNECTING");

      state.reconnectTimer = setTimeout(() => {
        connectToDeriv();
      }, 3000);
    });
  };

  const initialise = () => {
    /*
     * Start with the human-readable market name.
     * There is NO hard-coded Deriv symbol here.
     */
    state.requestedMarket = "EUR/USD";
    state.symbolName = "EUR/USD";

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
