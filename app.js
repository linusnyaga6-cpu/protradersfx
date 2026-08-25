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
    reconnectTimer: null,
    activeSymbols: []
  };

  const markets = {
    "EUR/USD": "EURUSD",
    "GBP/USD": "GBPUSD",
    "USD/JPY": "USDJPY",
    "AUD/USD": "AUDUSD",
    "USD/CAD": "USDCAD",
    "USD/CHF": "USDCHF"
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
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const normaliseMarket = (value) => {
    const cleaned = clean(value);

    for (const [name, code] of Object.entries(markets)) {
      if (
        cleaned === clean(name) ||
        cleaned === code ||
        cleaned === `FRX${code}`
      ) {
        return name;
      }
    }

    return "EUR/USD";
  };

  const formatPrice = (price) => {
    const number = Number(price);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return number >= 100
      ? number.toFixed(3)
      : number.toFixed(5);
  };

  const resetMarket = () => {
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

  const findSymbol = () => {
    const wanted =
      markets[state.requestedMarket];

    console.log(
      "SEARCHING FOR:",
      state.requestedMarket,
      wanted
    );

    const result =
      state.activeSymbols.find((item) => {
        return (
          clean(item.underlying_symbol_name) ===
            wanted ||
          clean(item.underlying_symbol) ===
            `FRX${wanted}` ||
          clean(item.underlying_symbol) ===
            wanted
        );
      });

    console.log(
      "SYMBOL RESULT:",
      result || null
    );

    return result || null;
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

    const difference =
      recent[recent.length - 1] -
      recent[0];

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
        signalElement.classList.add("buy");
      } else if (signal === "PUT") {
        signalElement.classList.add("sell");
      } else {
        signalElement.classList.add("wait");
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

  const requestActiveSymbols = () => {
    if (
      !state.socket ||
      state.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    console.log(
      "ACTIVE SYMBOLS REQUEST SENT"
    );

    setStatus(
      "LOADING MARKETS"
    );

    state.socket.send(
      JSON.stringify({
        active_symbols: "brief",
        product_type: "basic",
        req_id: 1
      })
    );
  };

  const subscribeToMarket = () => {
    const record =
      findSymbol();

    if (!record) {
      console.error(
        "EUR/USD WAS NOT FOUND IN DERIV SYMBOL LIST"
      );

      setStatus(
        "MARKET UNAVAILABLE"
      );

      return;
    }

    const actualSymbol =
      record.underlying_symbol;

    if (!actualSymbol) {
      console.error(
        "NO UNDERLYING SYMBOL:",
        record
      );

      setStatus(
        "SYMBOL UNAVAILABLE"
      );

      return;
    }

    state.symbol =
      actualSymbol;

    console.log(
      "VALID DERIV SYMBOL:",
      state.symbol
    );

    state.socket.send(
      JSON.stringify({
        forget_all: "ticks"
      })
    );

    state.socket.send(
      JSON.stringify({
        ticks: state.symbol,
        subscribe: 1,
        req_id: 2
      })
    );

    console.log(
      "LIVE TICKS REQUESTED:",
      state.symbol
    );
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

    setStatus("CONNECTING");

    let socket;

    try {
      socket =
        new WebSocket(
          "wss://ws.binaryws.com/websockets/v3"
        );
    } catch (error) {
      console.error(
        "WEBSOCKET CREATION ERROR:",
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
        let data;

        try {
          data =
            JSON.parse(
              event.data
            );
        } catch (error) {
          console.error(
            "INVALID JSON:",
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

          setStatus("MARKET ERROR");

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
            "ACTIVE SYMBOL COUNT:",
            state.activeSymbols.length
          );

          /*
           * Show the actual first records
           * in the browser console.
           */
          console.log(
            "FIRST SYMBOLS:",
            state.activeSymbols.slice(0, 10)
          );

          if (
            state.activeSymbols.length === 0
          ) {
            console.error(
              "DERIV STILL RETURNED ZERO ACTIVE SYMBOLS"
            );

            setStatus(
              "NO MARKETS RETURNED"
            );

            return;
          }

          subscribeToMarket();

          return;
        }

        if (
          data.msg_type === "tick" &&
          data.tick &&
          data.tick.quote !==
            undefined
        ) {
          updatePrice(
            data.tick.quote
          );

          setStatus("LIVE");

          return;
        }
      }
    );

    socket.addEventListener(
      "error",
      (error) => {
        console.error(
          "DERIV WEBSOCKET ERROR:",
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

            state.symbol = null;
            state.price = null;
            state.previousPrice = null;
            state.prices = [];

            resetMarket();

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
              subscribeToMarket();
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

    resetMarket();

    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();

    connectToDeriv();
  };

  initialise();
});
