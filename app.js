document.addEventListener("DOMContentLoaded", () => {
  const state = {
    symbol: "frxEURUSD",
    symbolName: "EUR/USD",
    price: null,
    previousPrice: null,
    prices: [],
    connected: false
  };

  const marketNames = {
    frxEURUSD: "EUR/USD",
    frxGBPUSD: "GBP/USD",
    frxUSDJPY: "USD/JPY",
    frxAUDUSD: "AUD/USD",
    frxUSDCAD: "USD/CAD",
    frxUSDCHF: "USD/CHF"
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
            Math.abs(difference || state.price * 0.001)
        )
      );

      setAll(
        "[data-target]",
        formatPrice(
          state.price +
            Math.abs(difference || state.price * 0.002)
        )
      );
    }
  };

  const setMarket = (symbol) => {
    if (!marketNames[symbol]) return;

    state.symbol = symbol;
    state.symbolName = marketNames[symbol];

    state.price = null;
    state.previousPrice = null;
    state.prices = [];

    setAll("[data-market]", state.symbolName);
    setAll("[data-analysis-market]", state.symbolName);
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
      button.classList.toggle(
        "active",
        button.dataset.symbol === symbol
      );
    });

    connectToDeriv();
  };

  const setupMarketButtons = () => {
    all("[data-symbol]").forEach((button) => {
      button.addEventListener("click", () => {
        setMarket(button.dataset.symbol);
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

        window.location.href = "/api/deriv/login";
      });
    }

    if (sell) {
      sell.addEventListener("click", () => {
        if (message) {
          message.textContent = "LOGIN REQUIRED";
        }

        window.location.href = "/api/deriv/login";
      });
    }
  };

  const connectToDeriv = () => {
    setStatus("CONNECTING");

    let socket;

    try {
      socket = new WebSocket(
        "wss://ws.derivws.com/websockets/v3?app_id=1089"
      );
    } catch (error) {
      console.error(error);
      setStatus("OFFLINE");
      return;
    }

    socket.addEventListener("open", () => {
      state.connected = true;

      setStatus("LIVE");

      socket.send(
        JSON.stringify({
          ticks: state.symbol,
          subscribe: 1
        })
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.tick && data.tick.quote !== undefined) {
          updatePrice(data.tick.quote);
        }
      } catch (error) {
        console.error("Market data error:", error);
      }
    });

    socket.addEventListener("error", (error) => {
      console.error("Deriv WebSocket error:", error);
      setStatus("OFFLINE");
    });

    socket.addEventListener("close", () => {
      state.connected = false;
      setStatus("RECONNECTING");

      setTimeout(() => {
        connectToDeriv();
      }, 3000);
    });
  };

  const initialise = () => {
    setAll("[data-market]", state.symbolName);
    setAll(
      "[data-analysis-market]",
      state.symbolName
    );

    setAll("[data-price]", "—");
    setAll("[data-move]", "—");
    setAll("[data-market-status]", "CONNECTING");

    setupMarketButtons();
    setupTimeframes();
    setupTradingButtons();

    connectToDeriv();
  };

  initialise();
});
