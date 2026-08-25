document.addEventListener("DOMContentLoaded", () => {
  const state = {
    symbol: "frxEURUSD",
    symbolName: "EUR/USD",
    price: null,
    previousPrice: null,
    connected: false
  };

  const $ = (selector) => document.querySelector(selector);

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function formatPrice(price) {
    if (price === null || price === undefined || Number.isNaN(Number(price))) {
      return "—";
    }

    return Number(price).toFixed(5);
  }

  function updateMarket(price) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) return;

    state.previousPrice = state.price;
    state.price = numericPrice;

    setText("#price", formatPrice(numericPrice));
    setText("#market-price", formatPrice(numericPrice));

    if (state.previousPrice !== null) {
      const move = numericPrice - state.previousPrice;
      const percent =
        state.previousPrice !== 0
          ? (move / state.previousPrice) * 100
          : 0;

      setText(
        "#move",
        `${move >= 0 ? "+" : ""}${percent.toFixed(3)}%`
      );
    }

    setText("#connection", "LIVE");
    setText("#status", "LIVE");
  }

  function setConnected(value) {
    state.connected = value;

    setText("#connection", value ? "LIVE" : "CONNECTING");
    setText("#status", value ? "LIVE" : "CONNECTING");
  }

  async function getMarketPrice() {
    try {
      const response = await fetch(
        `/api/market?symbol=${encodeURIComponent(state.symbol)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(`Market request failed: ${response.status}`);
      }

      const data = await response.json();

      const price =
        data.price ??
        data.quote ??
        data.spot ??
        data.ask ??
        data.bid;

      if (price !== undefined && price !== null) {
        updateMarket(price);
        setConnected(true);
      }
    } catch (error) {
      console.error("Market update error:", error);
      setConnected(false);
    }
  }

  function selectMarket(symbol, name) {
    state.symbol = symbol;
    state.symbolName = name;

    setText("#symbol", name);
    setText("#market-symbol", name);

    getMarketPrice();
  }

  function setupMarketButtons() {
    const markets = [
      {
        symbol: "frxEURUSD",
        name: "EUR/USD"
      },
      {
        symbol: "frxGBPUSD",
        name: "GBP/USD"
      },
      {
        symbol: "frxUSDJPY",
        name: "USD/JPY"
      },
      {
        symbol: "frxAUDUSD",
        name: "AUD/USD"
      },
      {
        symbol: "frxUSDCAD",
        name: "USD/CAD"
      },
      {
        symbol: "frxUSDCHF",
        name: "USD/CHF"
      }
    ];

    document.querySelectorAll("[data-symbol]").forEach((button) => {
      button.addEventListener("click", () => {
        const symbol = button.dataset.symbol;
        const market = markets.find((item) => item.symbol === symbol);

        if (market) {
          selectMarket(market.symbol, market.name);
        }
      });
    });
  }

  function setupAuthButtons() {
    const loginButtons = document.querySelectorAll(
      '[data-action="login"], #login'
    );

    const signupButtons = document.querySelectorAll(
      '[data-action="signup"], #signup'
    );

    loginButtons.forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = "/api/deriv/login";
      });
    });

    signupButtons.forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = "/api/deriv/signup";
      });
    });
  }

  function setupNavigation() {
    document.querySelectorAll("[data-scroll]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.querySelector(
          button.dataset.scroll
        );

        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });
  }

  function startMarketUpdates() {
    getMarketPrice();

    setInterval(() => {
      getMarketPrice();
    }, 5000);
  }

  function init() {
    setupMarketButtons();
    setupAuthButtons();
    setupNavigation();

    setText("#symbol", state.symbolName);
    setText("#market-symbol", state.symbolName);
    setText("#price", "—");
    setText("#market-price", "—");
    setText("#move", "—");
    setText("#connection", "CONNECTING");
    setText("#status", "CONNECTING");

    startMarketUpdates();
  }

  init();
});
