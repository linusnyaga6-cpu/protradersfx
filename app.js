document.addEventListener("DOMContentLoaded", () => {
  const state = {
    socket: null,
    connected: false,
    symbol: null,
    symbolName: "EUR/USD",
    requestedMarket: "EUR/USD",
    price: null,
    previousPrice: null,
    prices: [],
    reconnectTimer: null
  };

  const markets = {
    "EUR/USD": ["EURUSD", "EUR/USD"],
    "GBP/USD": ["GBPUSD", "GBP/USD"],
    "USD/JPY": ["USDJPY", "USD/JPY"],
    "AUD/USD": ["AUDUSD", "AUD/USD"],
    "USD/CAD": ["USDCAD", "USD/CAD"],
    "USD/CHF": ["USDCHF", "USD/CHF"]
  };

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const setAll = (selector, value) => {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setStatus = (status) => {
    setAll("[data-market-status]", status);
  };

  const clean = (value) =>
    String(value || "")
      .replace(/^frx/i, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const formatPrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return number >= 100
      ? number.toFixed(3)
      : number.toFixed(5);
  };

  const normaliseMarket = (value) => {
    const cleaned = clean(value);

    for (const [name, aliases] of Object.entries(markets)) {
      if (
        aliases.some(
          (alias) => clean(alias) === cleaned
        )
      ) {
        return name;
      }
    }

    return value || "EUR/USD";
  };

  /*
   * Try to find a valid Deriv symbol inside
   * any object returned by the API.
   */
  const findSymbolInObject = (object, marketName) => {
    if (!object || typeof object !== "object") {
      return null;
    }

    const wanted = clean(marketName);

    const possibleSymbol =
      object.symbol ||
      object.underlying_symbol ||
      object.contract_symbol;

    const possibleNames = [
      object.display_name,
      object.display_symbol,
      object.underlying_symbol_name,
      object.name,
      object.market_display_name
    ];

    if (
      possibleSymbol &&
      possibleNames.some(
        (name) =>
          clean(name) === wanted
      )
    ) {
      return possibleSymbol;
    }

    if (
      possibleSymbol &&
      clean(possibleSymbol) === wanted
    ) {
      return possibleSymbol;
    }

    return null;
  };

  const updateChart = () => {
    const line =
      document.querySelector(
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

    const points = values
      .map((value, index) => {
        const x =
          padding +
          (index /
            Math.max(
              values.length - 1,
              1
            )) *
            (width - padding * 2);

        const y =
          height -
          padding -
          ((value - min) / range) *
            (height - padding * 2);

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    line.setAttribute(
      "points",
      points
    );
  };

  const updateAnalysis = () => {
    if (state.prices.length < 5) {
      return;
    }

    const recent =
      state.prices.slice(-5);

    const first = recent[0];
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

    setAll("[data-trend]", trend);
    setAll("[data-momentum]", momentum);
    setAll("[data-direction]", direction);
    setAll("[data-signal]", signal);

    const signalElement =
      document.querySelector(
        "[data-signal]"
      );

    if (signalElement) {
      signalElement.classList.remove(
        "wait",
        "buy",
        "sell"
      );

      if (signal === "CALL") {
        signalElement.classList.add(
          "buy"
        );
      } else if (signal === "PUT") {
        signalElement.classList.add(
          "sell"
        );
      } else {
        signalElement.classList.add(
          "wait"
        );
      }
    }

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
    }
  };

  const updatePrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return;
    }

    state.previousPrice =
      state.price;

    state.price = number;

    state.prices.push(number);

    if (state.prices.length > 100) {
      state.prices.shift();
    }

    setAll(
      "[data-price]",
      formatPrice(number)
    );

    if (
      state.previousPrice !== null
    ) {
      const change =
        ((number -
          state.previousPrice) /
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

  const resetDisplay = () => {
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
  };

  /*
   * Request contract information for a
   * major forex underlying.
   */
  const requestMarket = () => {
    if (
      !state.socket ||
      !state.connected
    ) {
      return;
    }

    const requested =
      normaliseMarket(
        state.requestedMarket
      );

    /*
     * Use the currency pair without the slash.
     */
    const pair =
      clean(requested);

    console.log(
      "REQUESTING MARKET:",
      requested
    );

    setStatus(
      "LOADING MARKET"
    );

    /*
     * Ask Deriv for contracts available
     * for the requested underlying.
     */
    state.socket.send(
      JSON.stringify({
        contracts_for: pair
      })
    );
  };

  /*
   * Process the contracts_for response.
   */
  const processMarketResponse = (data) => {
    console.log(
      "CONTRACTS RESPONSE:",
      data
    );

    const market =
      normaliseMarket(
        state.requestedMarket
      );

    /*
     * Look through the response for
     * a usable symbol.
     */
    const possibleObjects = [];

    if (
      data.contracts_for
    ) {
      possibleObjects.push(
        data.contracts_for
      );
    }

    if (
      Array.isArray(
        data.contracts_for
      )
    ) {
      possibleObjects.push(
        ...data.contracts_for
      );
    }

    let symbol = null;

    for (
      const object of possibleObjects
    ) {
      symbol =
        findSymbolInObject(
          object,
          market
        );

      if (symbol) {
        break;
      }
    }

    /*
     * contracts_for may not expose the
     * underlying symbol directly.
     *
     * In that case inspect the entire
     * response for a symbol-looking field.
     */
    if (!symbol) {
      const json =
        JSON.stringify(data);

      const wanted =
        clean(market);

      const match =
        json.match(
          /"(?:underlying_symbol|symbol)"\s*:\s*"([^"]+)"/g
        );

      if (match) {
        for (
          const entry of match
        ) {
          const value =
            entry
              .split(":")
              .slice(1)
              .join(":")
              .replace(/"/g, "")
              .trim();

          if (
            clean(value) === wanted ||
            clean(value).includes(wanted)
          ) {
            symbol = value;
            break;
          }
        }
      }
    }

    /*
     * If no symbol was discovered,
     * report it instead of guessing.
     */
    if (!symbol) {
      console.error(
        "NO SYMBOL FOUND FOR:",
        market
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    state.symbol =
      symbol;

    console.log(
      "VALID DERIV SYMBOL:",
      state.symbol
    );

    subscribeToTicks();
  };

  /*
   * Subscribe to live ticks.
   */
  const subscribeToTicks = () => {
    if (
      !state.socket ||
      !state.connected ||
      !state.symbol
    ) {
      return;
    }

    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1
      })
    );

    console.log(
      "TICK SUBSCRIPTION:",
      state.symbol
    );

    setStatus("LIVE");
  };

  const connectToDeriv = () => {
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
      /*
       * This is the connection that
       * previously reached DERIV CONNECTED.
       */
      socket =
        new WebSocket(
          "wss://ws.derivws.com/websockets/v3?app_id=1089"
        );
    } catch (error) {
      console.error(
        "WEBSOCKET ERROR:",
        error
      );

      setStatus(
        "OFFLINE"
      );

      return;
    }

    state.socket =
      socket;

    socket.addEventListener(
      "open",
      () => {
        state.connected =
          true;

        console.log(
          "DERIV CONNECTED"
        );

        requestMarket();
      }
    );

    socket.addEventListener(
      "message",
      (event) => {
        let data;

        try {
          data =
            JSON.parse(
              event.data
            );
        } catch (error) {
          console.error(
            "INVALID DERIV RESPONSE:",
            event.data
          );

          return;
        }

        console.log(
          "DERIV MESSAGE:",
          data
        );

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
          "contracts_for"
        ) {
          processMarketResponse(
            data
          );

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

          return;
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

        setStatus(
          "RECONNECTING"
        );

        state.reconnectTimer =
          setTimeout(
            connectToDeriv,
            3000
          );
      }
    );
  };

  const setupMarketButtons = () => {
    all("[data-symbol]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const market =
              normaliseMarket(
                button.dataset.symbol ||
                  button.textContent
              );

            state.requestedMarket =
              market;

            state.symbolName =
              market;

            state.price = null;
            state.previousPrice =
              null;
            state.prices = [];
            state.symbol = null;

            resetDisplay();

            all("[data-symbol]")
              .forEach((item) => {
                const itemMarket =
                  normaliseMarket(
                    item.dataset.symbol ||
                      item.textContent
                  );

                item.classList.toggle(
                  "active",
                  itemMarket === market
                );
              });

            if (
              state.connected
            ) {
              requestMarket();
            }
          }
        );
      });
  };

  const setupTimeframes = () => {
    all("[data-timeframe]")
      .forEach((button) => {
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
      });
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

    const login = () => {
      if (message) {
        message.textContent =
          "LOGIN REQUIRED";
      }

      window.location.href =
        "/api/deriv/login";
    };

    if (buy) {
      buy.addEventListener(
        "click",
        login
      );
    }

    if (sell) {
      sell.addEventListener(
        "click",
        login
      );
    }
  };

  const initialise = () => {
    state.requestedMarket =
      "EUR/USD";

    state.symbolName =
      "EUR/USD";

    resetDisplay();

    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();

    connectToDeriv();
  };

  initialise();
});
