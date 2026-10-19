import { useEffect, useMemo, useRef, useState } from "react";
import { WHATSAPP_GROUP_URL } from "../lib/support";
import {
  Bot,
  CircleAlert,
  CircleCheck,
  Activity,
  MessageCircle,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  formatDerivContractType,
  getDerivBarrierError,
  getDerivBarrierRange,
  isDerivContractType,
  type DerivContractType,
} from "../lib/deriv-contracts";
import {
  settledTradeNetProfit,
  sumSettledTradeNetProfit,
  actualTradeStake,
} from "../lib/trade-financials";
import {
  formatMoneyForDisplay,
  ProfitLossValue,
  useCurrencyDisplay,
} from "../lib/display-currency";

type MarketOption = {
  label: string;
  name: string;
  symbol: string;
  family: "fx" | "volatility";
};

type MarketQuote = {
  status: "connecting" | "live" | "closed" | "error";
  price: number | null;
  pipSize: number;
  ticks: number[];
  lastTickAt: number | null;
};

type BotDefinition = {
  id: number;
  name: string;
  family: "digits" | "price";
  description: string;
  rule: string;
};

type BotSignal = {
  contractType: DerivContractType;
  barrier?: number;
  reason: string;
};

type SettledTrade = {
  id: string;
  botId: number;
  time: string;
  market: string;
  contractType: string;
  barrier?: number;
  stake: number;
  buyPrice?: number | null;
  payout?: number | null;
  currency: string;
  result: "won" | "lost" | "pending";
  settlementPending?: boolean;
  orderStatusUnknown?: boolean;
  profit: number | null;
  entrySpot: string | number | null;
  exitSpot: string | number | null;
  contractId?: string | number;
};

type Props = {
  accountMode: "DEMO" | "REAL";
  currency: string;
  balance: number | null;
  activeMarket: string;
  setActiveMarket: (label: string) => void;
  marketDefinitions: MarketOption[];
  marketQuotes: Record<string, MarketQuote>;
  onTradeSettled: () => Promise<void>;
};

const BOT_DEFINITIONS: BotDefinition[] = [
  {
    id: 1,
    name: "Parity Momentum",
    family: "digits",
    description: "Follows an even or odd side after its share reaches the selected threshold.",
    rule: "Majority parity reaches the signal threshold.",
  },
  {
    id: 2,
    name: "Parity Reversion",
    family: "digits",
    description: "Targets the less frequent parity after the other side reaches the threshold.",
    rule: "Trades the minority parity after a strong imbalance.",
  },
  {
    id: 3,
    name: "Parity Streak Break",
    family: "digits",
    description: "Waits for a configurable same-parity run, then targets the opposite parity.",
    rule: "Opposite parity after a consecutive-digit streak.",
  },
  {
    id: 4,
    name: "Parity Alternation",
    family: "digits",
    description: "Looks for a sustained even/odd alternation and targets the next side.",
    rule: "Opposite parity after an alternating sequence.",
  },
  {
    id: 5,
    name: "Digit Over Frequency",
    family: "digits",
    description: "Uses the selected barrier and recent digits to signal Digit Over.",
    rule: "Digits above the barrier reach the signal threshold.",
  },
  {
    id: 6,
    name: "Digit Under Frequency",
    family: "digits",
    description: "Uses the selected barrier and recent digits to signal Digit Under.",
    rule: "Digits below the barrier reach the signal threshold.",
  },
  {
    id: 7,
    name: "Tick Momentum",
    family: "price",
    description: "Follows a clear majority of upward or downward tick changes.",
    rule: "Up/down tick share reaches the signal threshold.",
  },
  {
    id: 8,
    name: "Tick Reversal",
    family: "price",
    description: "Targets the opposite direction after a configured directional run.",
    rule: "Opposite direction after a same-direction tick streak.",
  },
  {
    id: 9,
    name: "Range Breakout",
    family: "price",
    description: "Signals when the latest price moves beyond the preceding tick range.",
    rule: "Latest tick breaks the recent high or low.",
  },
  {
    id: 10,
    name: "Trend + Parity",
    family: "digits",
    description: "Requires price direction and matching parity frequency to agree.",
    rule: "Trend and digit parity confirmation.",
  },
  {
    id: 11,
    name: "Even Elite",
    family: "digits",
    description: "Places one Digit Even contract on each new tick of a synthetic Volatility market.",
    rule: "One DIGITEVEN order for every new market tick while running.",
  },
  {
    id: 12,
    name: "Odd Elite",
    family: "digits",
    description: "Places one Digit Odd contract on each new tick of a synthetic Volatility market.",
    rule: "One DIGITODD order for every new market tick while running.",
  },
];

type RunConfig = {
  botId: number;
  symbol: string;
  marketLabel: string;
  amount: number;
  duration: number;
  maxTrades: number;
  takeProfit: number;
  stopLoss: number;
  sampleWindow: number;
  threshold: number;
  streakLength: number;
  barrier: number;
};

function getSignal(input: {
  botId: number;
  digits: number[];
  prices: number[];
  sampleWindow: number;
  threshold: number;
  streakLength: number;
  barrier: number;
}): BotSignal | null {
  const digits = input.digits.slice(-input.sampleWindow);
  const prices = input.prices.slice(-(input.sampleWindow + 1));
  const needed = input.sampleWindow;
  const evenCount = digits.filter((digit) => digit % 2 === 0).length;
  const oddCount = digits.length - evenCount;
  const evenShare = digits.length ? (evenCount / digits.length) * 100 : 0;
  const oddShare = digits.length ? (oddCount / digits.length) * 100 : 0;
  const overShare = digits.length
    ? (digits.filter((digit) => digit > input.barrier).length / digits.length) * 100
    : 0;
  const underShare = digits.length
    ? (digits.filter((digit) => digit < input.barrier).length / digits.length) * 100
    : 0;

  if (input.botId <= 6 || input.botId === 10) {
    if (digits.length < needed) return null;
  }

  switch (input.botId) {
    case 1:
      if (evenShare >= input.threshold) {
        return { contractType: "DIGITEVEN", reason: `Even digits: ${evenShare.toFixed(1)}%` };
      }
      if (oddShare >= input.threshold) {
        return { contractType: "DIGITODD", reason: `Odd digits: ${oddShare.toFixed(1)}%` };
      }
      return null;
    case 2:
      if (evenShare >= input.threshold) {
        return { contractType: "DIGITODD", reason: `Reversion after ${evenShare.toFixed(1)}% even` };
      }
      if (oddShare >= input.threshold) {
        return { contractType: "DIGITEVEN", reason: `Reversion after ${oddShare.toFixed(1)}% odd` };
      }
      return null;
    case 3: {
      const streak = digits.slice(-input.streakLength);
      if (streak.length < input.streakLength) return null;
      const lastParity = streak[streak.length - 1] % 2;
      if (!streak.every((digit) => digit % 2 === lastParity)) return null;
      return {
        contractType: lastParity === 0 ? "DIGITODD" : "DIGITEVEN",
        reason: `${input.streakLength} same-parity digits; targeting the opposite side`,
      };
    }
    case 4: {
      const sequence = digits.slice(-Math.max(4, input.streakLength));
      if (sequence.length < Math.max(4, input.streakLength)) return null;
      const alternating = sequence.every(
        (digit, index) => index === 0 || digit % 2 !== sequence[index - 1] % 2,
      );
      if (!alternating) return null;
      const nextParity = sequence[sequence.length - 1] % 2 === 0 ? 1 : 0;
      return {
        contractType: nextParity === 0 ? "DIGITEVEN" : "DIGITODD",
        reason: `${sequence.length} alternating digits; targeting the next side`,
      };
    }
    case 5:
      return overShare >= input.threshold
        ? {
            contractType: "DIGITOVER",
            barrier: input.barrier,
            reason: `${overShare.toFixed(1)}% of recent digits are above ${input.barrier}`,
          }
        : null;
    case 6:
      return underShare >= input.threshold
        ? {
            contractType: "DIGITUNDER",
            barrier: input.barrier,
            reason: `${underShare.toFixed(1)}% of recent digits are below ${input.barrier}`,
          }
        : null;
    case 7: {
      if (prices.length < needed + 1) return null;
      const changes = prices.slice(1).map((price, index) => Math.sign(price - prices[index]));
      const upShare = (changes.filter((change) => change > 0).length / changes.length) * 100;
      const downShare = (changes.filter((change) => change < 0).length / changes.length) * 100;
      if (upShare >= input.threshold) {
        return { contractType: "CALL", reason: `Upward ticks: ${upShare.toFixed(1)}%` };
      }
      if (downShare >= input.threshold) {
        return { contractType: "PUT", reason: `Downward ticks: ${downShare.toFixed(1)}%` };
      }
      return null;
    }
    case 8: {
      const changes = prices.slice(1).map((price, index) => Math.sign(price - prices[index]));
      const streak = changes.slice(-input.streakLength);
      if (streak.length < input.streakLength) return null;
      if (streak.every((change) => change > 0)) {
        return { contractType: "PUT", reason: `${input.streakLength} upward ticks; targeting a reversal` };
      }
      if (streak.every((change) => change < 0)) {
        return { contractType: "CALL", reason: `${input.streakLength} downward ticks; targeting a reversal` };
      }
      return null;
    }
    case 9: {
      if (prices.length < needed + 1) return null;
      const current = prices[prices.length - 1];
      const reference = prices.slice(0, -1);
      const high = Math.max(...reference);
      const low = Math.min(...reference);
      if (current > high) return { contractType: "CALL", reason: "Latest tick is above the recent range" };
      if (current < low) return { contractType: "PUT", reason: "Latest tick is below the recent range" };
      return null;
    }
    case 10: {
      if (prices.length < needed + 1) return null;
      const trend = Math.sign(prices[prices.length - 1] - prices[0]);
      if (trend > 0 && evenShare >= input.threshold) {
        return {
          contractType: "DIGITEVEN",
          reason: `Upward price trend and ${evenShare.toFixed(1)}% even digits`,
        };
      }
      if (trend < 0 && oddShare >= input.threshold) {
        return {
          contractType: "DIGITODD",
          reason: `Downward price trend and ${oddShare.toFixed(1)}% odd digits`,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function formatMoney(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} ${currency}`;
}

function formatSignedProfit(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return `0.00 ${currency}`;
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(2)} ${currency}`;
}

function summarizeBotTrades(trades: SettledTrade[]) {
  const totalStake = trades.reduce(
    (sum, trade) => sum + (trade.orderStatusUnknown ? 0 : actualTradeStake(trade) ?? 0),
    0,
  );
  const unresolved = trades.some(
    (trade) => trade.settlementPending || trade.orderStatusUnknown || trade.result === "pending",
  );
  const payoutKnown = trades.length > 0 && trades.every(
    (trade) => settledTradeNetProfit(trade) !== null && typeof trade.payout === "number" && Number.isFinite(trade.payout),
  );
  const profitKnown = trades.length > 0 && !unresolved && trades.every(
    (trade) => settledTradeNetProfit(trade) !== null,
  );
  return {
    totalStake,
    totalPayout: payoutKnown
      ? trades.reduce((sum, trade) => sum + (trade.payout ?? 0), 0)
      : null,
    totalProfit: profitKnown
      ? sumSettledTradeNetProfit(trades)
      : null,
    contractsWon: trades.filter((trade) => !trade.settlementPending && !trade.orderStatusUnknown && trade.result === "won").length,
    contractsLost: trades.filter((trade) => !trade.settlementPending && !trade.orderStatusUnknown && trade.result === "lost").length,
  };
}

export default function DerivProBotsView({
  accountMode,
  currency,
  balance,
  activeMarket,
  setActiveMarket,
  marketDefinitions,
  marketQuotes,
  onTradeSettled,
}: Props) {
  const { displayCurrency, rate } = useCurrencyDisplay();
  const [selectedBotId, setSelectedBotId] = useState(1);
  const [stake, setStake] = useState("1");
  const [duration, setDuration] = useState("1");
  const [maxTrades, setMaxTrades] = useState("10");
  const [takeProfit, setTakeProfit] = useState("5");
  const [stopLoss, setStopLoss] = useState("5");
  const [sampleWindow, setSampleWindow] = useState("20");
  const [threshold, setThreshold] = useState("60");
  const [streakLength, setStreakLength] = useState("3");
  const [barrier, setBarrier] = useState("5");
  const [realMoneyAcknowledged, setRealMoneyAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [runTradeCount, setRunTradeCount] = useState(0);
  const [runProfit, setRunProfit] = useState(0);
  const [runProfitPending, setRunProfitPending] = useState(false);
  const [runStatus, setRunStatus] = useState("Choose a bot, review its signal rule, then start it.");
  const [error, setError] = useState("");
  const [trades, setTrades] = useState<SettledTrade[]>([]);
  const [runMarketLabel, setRunMarketLabel] = useState<string | null>(null);
  const [bookingEligibility, setBookingEligibility] = useState<{
    checked: boolean;
    eligible: boolean;
    reason: string;
  }>({ checked: false, eligible: false, reason: "Checking your real-account eligibility…" });
  const runningRef = useRef(false);
  const executingRef = useRef(false);
  const signalArmedRef = useRef(true);
  const tradesRef = useRef<SettledTrade[]>([]);
  const runTradeCountRef = useRef(0);
  const runProfitRef = useRef(0);
  const configRef = useRef<RunConfig | null>(null);
  const lastConsumedTickRef = useRef<string | null>(null);

  const selectedBot = BOT_DEFINITIONS.find((bot) => bot.id === selectedBotId) ?? BOT_DEFINITIONS[0];
  const effectiveMarket = running && runMarketLabel ? runMarketLabel : activeMarket;
  const market = marketDefinitions.find((item) => item.label === effectiveMarket) ?? marketDefinitions[0];
  const eligibleMarkets = marketDefinitions.filter(
    (item) => selectedBot.family !== "digits" || item.family === "volatility",
  );
  const quote = market ? marketQuotes[market.symbol] : undefined;
  const recentDigits = (quote?.ticks.slice(-100) ?? [])
    .map((tick) => Number(tick.toFixed(quote?.pipSize ?? 2).replace(/\D/g, "").slice(-1)))
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
  const sampleSize = Math.max(10, Math.min(100, Number.parseInt(sampleWindow, 10) || 20));
  const signalThreshold = Math.max(51, Math.min(95, Number.parseInt(threshold, 10) || 60));
  const streakSize = Math.max(2, Math.min(10, Number.parseInt(streakLength, 10) || 3));
  const digitSignalAllowed = selectedBot.family !== "digits" || market?.family === "volatility";
  const barrierContractType: DerivContractType | null =
    selectedBotId === 5 ? "DIGITOVER" : selectedBotId === 6 ? "DIGITUNDER" : null;
  const barrierRange = barrierContractType ? getDerivBarrierRange(barrierContractType) : null;
  const configuredBarrier = Number.parseInt(barrier, 10);
  const barrierError = barrierContractType
    ? getDerivBarrierError(barrierContractType, configuredBarrier)
    : null;
  const isEliteTickBot = selectedBotId === 11 || selectedBotId === 12;
  const currentSignal = useMemo(() => {
    if (!market || !quote || !digitSignalAllowed || barrierError) return null;
    return getSignal({
      botId: selectedBotId,
      digits: recentDigits,
      prices: quote.ticks,
      sampleWindow: sampleSize,
      threshold: signalThreshold,
      streakLength: streakSize,
      barrier: configuredBarrier,
    });
  }, [
    market,
    quote,
    digitSignalAllowed,
    barrierError,
    selectedBotId,
    recentDigits,
    sampleSize,
    signalThreshold,
    streakSize,
    configuredBarrier,
  ]);
  const resultSummary = summarizeBotTrades(trades);
  const contractSummary = [...new Set(trades.map((trade) => formatDerivContractType(trade.contractType, trade.barrier)).filter((label) => label !== "TRADE"))].join(" · ") || "—";
  const totalProfit = resultSummary.totalProfit;
  const allSessionProfitPending = trades.some(
    (trade) => trade.settlementPending || trade.orderStatusUnknown || trade.result === "pending",
  );
  const whatsappUrl = WHATSAPP_GROUP_URL;

  useEffect(() => {
    let active = true;
    fetch("/api/live-trading/eligibility", { credentials: "include" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          eligible?: boolean;
          reason?: string;
          error?: string;
        };
        if (!active) return;
        setBookingEligibility({
          checked: true,
          eligible: response.ok && payload.eligible === true,
          reason:
            payload.reason ??
            payload.error ??
            "Connect a Deriv account to check live-trading booking eligibility.",
        });
      })
      .catch(() => {
        if (!active) return;
        setBookingEligibility({
          checked: true,
          eligible: false,
          reason: "Unable to verify a real USD account right now.",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    if (isEliteTickBot) {
      if (!quote?.lastTickAt || !market) return;
      const tickKey = `${quote.lastTickAt}:${quote.ticks.length}:${quote.ticks.at(-1) ?? ""}`;
      if (lastConsumedTickRef.current === tickKey) return;
      // Consume while a request is in flight too: missed ticks are discarded, never queued.
      lastConsumedTickRef.current = tickKey;
      if (executingRef.current) return;
      if (!digitSignalAllowed || market.family !== "volatility") {
        setRunStatus("Choose a synthetic Volatility market to run this strategy.");
        return;
      }
      if (quote.status !== "live") {
        setRunStatus("Waiting for a live synthetic-market tick.");
        return;
      }
      void executeSignal({
        contractType: selectedBotId === 11 ? "DIGITEVEN" : "DIGITODD",
        reason: `New tick on ${effectiveMarket}`,
      });
      return;
    }
    if (executingRef.current) return;
    if (!currentSignal) {
      signalArmedRef.current = true;
      setRunStatus(
        digitSignalAllowed
          ? `Waiting for ${selectedBot.name} signal on ${effectiveMarket}.`
          : "Choose a Volatility market for a digit bot.",
      );
      return;
    }
    if (!signalArmedRef.current) return;
    signalArmedRef.current = false;
    void executeSignal(currentSignal);
    // Execute only once per signal; re-arm after the rule no longer qualifies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, quote?.lastTickAt, quote?.status, quote?.ticks.length, quote?.ticks, currentSignal, digitSignalAllowed, isEliteTickBot, market, selectedBotId, effectiveMarket]);

  async function executeSignal(signal: BotSignal) {
    const config = configRef.current;
    if (!config || executingRef.current) return;
    executingRef.current = true;
    setExecuting(true);
    setError("");
    setRunStatus(`${selectedBot.name} signal: ${formatDerivContractType(signal.contractType, signal.barrier)} · ${signal.reason}. Sending one order…`);

    try {
      if (!isDerivContractType(signal.contractType)) {
        throw new Error(`Unsupported Deriv contract type: ${String(signal.contractType)}. No order was sent.`);
      }
      const barrierError = getDerivBarrierError(signal.contractType, signal.barrier);
      if (barrierError) throw new Error(`${barrierError} No order was sent.`);
      const response = await fetch("/api/premium-bots/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          botId: config.botId,
          symbol: config.symbol,
          contractType: signal.contractType,
          amount: config.amount,
          duration: config.duration,
          durationUnit: "t",
          barrier: signal.barrier,
          confirm: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        trade?: {
          contractId?: string | number;
          transactionId?: string | number;
          contractType?: string;
          result?: "won" | "lost" | "pending";
          settlementPending?: boolean;
          orderStatusUnknown?: boolean;
          buyPrice?: number | null;
          payout?: number | null;
          profit?: number | null;
          entrySpot?: string | number | null;
          exitSpot?: string | number | null;
          currency?: string;
        };
      };
      if (!response.ok || !payload.trade) {
        throw new Error(payload.error ?? "Deriv did not confirm the bot trade.");
      }

      const trade: SettledTrade = {
        id: `${payload.trade.contractId ?? payload.trade.transactionId ?? Date.now()}-${tradesRef.current.length}`,
        botId: config.botId,
        time: new Date().toLocaleTimeString(),
        market: config.marketLabel,
        contractType: payload.trade.contractType ?? signal.contractType,
        barrier: signal.barrier,
        stake: config.amount,
        buyPrice: typeof payload.trade.buyPrice === "number" ? payload.trade.buyPrice : null,
        payout: typeof payload.trade.payout === "number" ? payload.trade.payout : null,
        currency: payload.trade.currency ?? currency,
        result: payload.trade.result ?? "pending",
        settlementPending: payload.trade.settlementPending === true,
        orderStatusUnknown: payload.trade.orderStatusUnknown === true,
        profit: typeof payload.trade.profit === "number" ? payload.trade.profit : null,
        entrySpot: payload.trade.entrySpot ?? null,
        exitSpot: payload.trade.exitSpot ?? null,
        contractId: payload.trade.contractId,
      };
      const nextTrades = [...tradesRef.current, trade];
      tradesRef.current = nextTrades;
      setTrades(nextTrades);
      void onTradeSettled().catch(() => undefined);

      const nextRunCount = runTradeCountRef.current + 1;
      runTradeCountRef.current = nextRunCount;
      setRunTradeCount(nextRunCount);
      if (trade.settlementPending || trade.orderStatusUnknown) {
        setRunProfitPending(true);
        setCompleted(true);
        stopRun(
          trade.orderStatusUnknown
            ? "Deriv did not confirm whether the order was placed. Check your Deriv transaction history before retrying. The bot stopped to prevent another order."
            : `Trade ${trade.contractId ?? ""} was placed; settlement is pending. The bot stopped to prevent another order.`,
          true,
        );
        return;
      }

      const settledProfit = settledTradeNetProfit(trade);
      if (settledProfit === null) {
        setRunProfitPending(true);
        setCompleted(true);
        setError("Deriv did not return an exact settled net profit/loss. The run stopped without estimating it.");
        stopRun("Stopped because the settled net P/L was unavailable.", true);
        return;
      }

      const nextRunProfit = runProfitRef.current + settledProfit;
      runProfitRef.current = nextRunProfit;
      setRunProfit(nextRunProfit);

      if (config.takeProfit > 0 && nextRunProfit >= config.takeProfit) {
        setCompleted(true);
        stopRun(`Take-profit reached: ${formatSignedProfit(nextRunProfit, trade.currency)}.`, true);
      } else if (config.stopLoss > 0 && nextRunProfit <= -config.stopLoss) {
        setCompleted(true);
        stopRun(`Stop-loss reached: ${formatSignedProfit(nextRunProfit, trade.currency)}.`, true);
      } else if (nextRunCount >= config.maxTrades) {
        setCompleted(true);
        stopRun(`Configured trade count reached: ${config.maxTrades}.`, true);
      } else if (!runningRef.current) {
        setRunStatus("Bot stopped after the current trade settled.");
      } else {
        setRunStatus(
          `Trade settled (${trade.result}); waiting for the signal to reset before the next entry.`,
        );
      }
    } catch (executionError) {
      const message =
        executionError instanceof Error ? executionError.message : "The bot order failed.";
      setError(message);
      stopRun("Stopped after the first execution error.", true);
    } finally {
      executingRef.current = false;
      setExecuting(false);
    }
  }

  function stopRun(message = "Bot stopped.", orderFinished = false) {
    runningRef.current = false;
    setRunning(false);
    setRunStatus(
      executingRef.current && !orderFinished
        ? "Stop requested; waiting for the open trade to settle."
        : message,
    );
  }

  function startRun() {
    if (accountMode === "REAL" && !realMoneyAcknowledged) {
      setError("Confirm that you understand this bot can place REAL-money trades.");
      return;
    }
    const amount = Number(stake);
    const durationTicks = Number.parseInt(duration, 10);
    const requestedTrades = Number.parseInt(maxTrades, 10);
    const takeProfitAmount = Number(takeProfit);
    const stopLossAmount = Number(stopLoss);
    if (!Number.isFinite(amount) || amount < 0.35 || amount > 10_000) {
      setError("Enter a stake from 0.35 to 10,000 in the account currency.");
      return;
    }
    if (!Number.isInteger(durationTicks) || durationTicks < 1 || durationTicks > 365) {
      setError("Duration must be between 1 and 365 ticks.");
      return;
    }
    if (!Number.isInteger(requestedTrades) || requestedTrades < 1) {
      setError("Enter the number of trades for this run.");
      return;
    }
    if (
      !Number.isFinite(takeProfitAmount) ||
      takeProfitAmount < 0 ||
      !Number.isFinite(stopLossAmount) ||
      stopLossAmount < 0
    ) {
      setError("Take-profit and stop-loss must be zero or a positive amount.");
      return;
    }
    if (!market || (selectedBot.family === "digits" && market.family !== "volatility")) {
      setError("Select a synthetic Volatility market for this digit bot.");
      return;
    }
    if (barrierError) {
      setError(barrierError);
      return;
    }
    if (!eligibleMarkets.length) {
      setError("No supported synthetic Volatility markets are available right now.");
      return;
    }

    const config: RunConfig = {
      botId: selectedBotId,
      symbol: market.symbol,
      marketLabel: market.label,
      amount,
      duration: durationTicks,
      maxTrades: requestedTrades,
      takeProfit: takeProfitAmount,
      stopLoss: stopLossAmount,
      sampleWindow: sampleSize,
      threshold: signalThreshold,
      streakLength: streakSize,
      barrier: configuredBarrier,
    };
    configRef.current = config;
    setRunMarketLabel(market.label);
    runTradeCountRef.current = 0;
    runProfitRef.current = 0;
    setRunTradeCount(0);
    setRunProfit(0);
    setRunProfitPending(false);
    setCompleted(false);
    lastConsumedTickRef.current = quote?.lastTickAt
      ? `${quote.lastTickAt}:${quote.ticks.length}:${quote.ticks.at(-1) ?? ""}`
      : null;
    runningRef.current = true;
    signalArmedRef.current = true;
    setError("");
    setRunning(true);
    setRunStatus(`Running ${selectedBot.name} on ${market.label} in ${accountMode} mode.`);
  }

  function selectBot(botId: number) {
    if (running) return;
    setSelectedBotId(botId);
    if (botId === 11 || botId === 12) setDuration("1");
    const bot = BOT_DEFINITIONS.find((item) => item.id === botId);
    if (bot?.family === "digits") {
      const volatilityMarket = marketDefinitions.find((item) => item.family === "volatility");
      if (volatilityMarket && marketDefinitions.find((item) => item.label === activeMarket)?.family !== "volatility") {
        setActiveMarket(volatilityMarket.label);
      }
    }
    setError("");
  }

  return (
    <section className="strategy-workspace deriv-pro-bots-workspace">
      <div className="strategy-workspace-main deriv-pro-bots-main">
        <header className="strategy-workspace-header deriv-pro-bots-header">
          <div>
            <span className="terminal-eyebrow">DERIV PRO BOTS · FREE TO USE</span>
            <h1>Rule-based strategies, under your control</h1>
            <p>Load a strategy to review its entry rule and risk limits. Nothing starts until you press Start; Elite strategies submit one-tick digit contracts on synthetic Volatility markets.</p>
          </div>
          <span className={`strategy-status-pill ${running ? "is-running" : completed ? "is-complete" : ""}`}>
            {running ? "RUNNING" : completed ? "COMPLETE" : "READY"}
          </span>
        </header>

        <div className="deriv-pro-bot-grid" aria-label="Deriv Pro Bots">
          {BOT_DEFINITIONS.map((bot) => (
            <button
              key={bot.id}
              type="button"
              className={`deriv-pro-bot-card ${selectedBotId === bot.id ? "is-selected" : ""}`}
              onClick={() => selectBot(bot.id)}
              disabled={running}
              aria-pressed={selectedBotId === bot.id}
              data-testid={`button-load-bot-${bot.id}`}
            >
              <span className="deriv-pro-bot-number">STRATEGY {String(bot.id).padStart(2, "0")}</span>
              <strong>{bot.name}</strong>
              {bot.id > 10 && <span className="deriv-pro-bot-summary">1 digit order · every tick</span>}
              <small>{selectedBotId === bot.id ? "LOADED" : bot.id > 10 ? "LOAD STRATEGY" : bot.family === "digits" ? "DIGIT SIGNAL" : "TICK SIGNAL"}</small>
            </button>
          ))}
        </div>

        <section className="deriv-pro-bot-runner" aria-label={`${selectedBot.name} settings`}>
          <div className="deriv-pro-bot-runner-heading">
            <div>
              <span className="terminal-eyebrow">BOT {selectedBot.id} · {selectedBot.family.toUpperCase()} RULE</span>
              <h2>{selectedBot.name}</h2>
              <p>{selectedBot.description}</p>
            </div>
            <span className={`mode-badge ${accountMode === "REAL" ? "is-real" : ""}`}>{accountMode} MODE</span>
          </div>

          <div className="deriv-pro-bot-rule">
            <Bot size={17} />
            <span><strong>Entry rule:</strong> {selectedBot.rule}</span>
          </div>
          {isEliteTickBot && (
            <div className="deriv-pro-bot-tick-note">
              <Activity size={16} />
              <span><strong>Tick-by-tick execution</strong> Each fresh tick can trigger one {selectedBotId === 11 ? "DIGITEVEN" : "DIGITODD"} order. One-tick duration is selected by default; ticks arriving during an open request are skipped.</span>
            </div>
          )}

          <div className="deriv-pro-bot-settings">
            <label>
              <span>Market</span>
              <select
                value={effectiveMarket}
                disabled={running}
                onChange={(event) => setActiveMarket(event.target.value)}
              >
                {eligibleMarkets.map((item) => <option key={item.symbol} value={item.label}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Stake ({currency})</span>
              <input type="number" min="0.35" max="10000" step="0.01" value={stake} disabled={running} onChange={(event) => setStake(event.target.value)} />
            </label>
            <label>
              <span>Duration (ticks)</span>
              <input type="number" min="1" max="365" step="1" value={duration} disabled={running} onChange={(event) => setDuration(event.target.value)} />
            </label>
            <label>
              <span>Trades in this run</span>
              <input type="number" min="1" step="1" value={maxTrades} disabled={running} onChange={(event) => setMaxTrades(event.target.value)} />
            </label>
            <label>
              <span>Take-profit ({currency})</span>
              <input type="number" min="0" step="0.01" value={takeProfit} disabled={running} onChange={(event) => setTakeProfit(event.target.value)} />
            </label>
            <label>
              <span>Stop-loss ({currency})</span>
              <input type="number" min="0" step="0.01" value={stopLoss} disabled={running} onChange={(event) => setStopLoss(event.target.value)} />
            </label>
            <label>
              <span>Tick sample</span>
              <input type="number" min="10" max="100" step="1" value={sampleWindow} disabled={running} onChange={(event) => setSampleWindow(event.target.value)} />
            </label>
            <label>
              <span>Signal threshold (%)</span>
              <input type="number" min="51" max="95" step="1" value={threshold} disabled={running} onChange={(event) => setThreshold(event.target.value)} />
            </label>
            {(selectedBotId === 3 || selectedBotId === 4 || selectedBotId === 8) && (
              <label>
                <span>Streak length</span>
                <input type="number" min="2" max="10" step="1" value={streakLength} disabled={running} onChange={(event) => setStreakLength(event.target.value)} />
              </label>
            )}
            {(selectedBotId === 5 || selectedBotId === 6) && (
              <label>
                <span>Digit barrier</span>
                <input
                  type="number"
                  min={barrierRange?.minimum ?? 0}
                  max={barrierRange?.maximum ?? 9}
                  step="1"
                  value={barrier}
                  disabled={running}
                  aria-invalid={Boolean(barrierError)}
                  onChange={(event) => setBarrier(event.target.value)}
                />
                {barrierError && <small role="alert">{barrierError}</small>}
              </label>
            )}
          </div>
          {selectedBot.family === "digits" && eligibleMarkets.length === 0 && (
            <div className="deriv-pro-bot-no-market" role="status">
              <CircleAlert size={16} />
              <span><strong>No synthetic Volatility markets available</strong> Connect to a supported market feed before loading a digit strategy.</span>
            </div>
          )}

          <div className="deriv-pro-bot-signal" aria-live="polite">
            <span className={`deriv-pro-bot-live-dot ${quote?.status === "live" ? "is-live" : ""}`} />
            <div>
              <strong>
                {isEliteTickBot
                  ? running
                    ? executing ? "Order in progress" : "Armed · one order per new tick"
                    : quote?.status === "live" ? "Ready · waits for Start and a fresh tick" : "Waiting for market data"
                  : currentSignal ? `Signal ready · ${formatDerivContractType(currentSignal.contractType, currentSignal.barrier)}` : "No entry signal"}
              </strong>
              <small>
                {isEliteTickBot
                  ? !digitSignalAllowed
                    ? "Select a synthetic Volatility market. FX symbols are not supported."
                    : quote?.status === "live"
                      ? `Synthetic market ${effectiveMarket} · one-tick contract · ${quote.ticks.length} ticks buffered`
                      : quote?.status === "error" || quote?.status === "closed"
                        ? "Market feed unavailable. Check the market or wait for the feed to reconnect."
                        : "Connecting to the synthetic market feed."
                  : currentSignal?.reason ??
                    (quote?.status === "live"
                      ? `Watching ${selectedBot.family === "digits" ? recentDigits.length : quote.ticks.length} live ticks on ${effectiveMarket}.`
                      : "Waiting for live market ticks.")}
              </small>
            </div>
            <span className="deriv-pro-bot-price">
              {quote?.price === null || quote?.price === undefined ? "—" : quote.price.toFixed(quote.pipSize)}
            </span>
          </div>

          {accountMode === "REAL" && (
            <label className="deriv-pro-bot-real-confirm">
              <input
                type="checkbox"
                checked={realMoneyAcknowledged}
                disabled={running}
                onChange={(event) => setRealMoneyAcknowledged(event.target.checked)}
              />
              <span>I understand this bot can place trades using REAL funds.</span>
            </label>
          )}

          <div className="deriv-pro-bot-controls">
            {!running ? (
              <button className="strategy-primary-button" type="button" onClick={startRun} disabled={selectedBot.family === "digits" && eligibleMarkets.length === 0}>
                <Play size={14} /> Start {selectedBot.name}
              </button>
            ) : (
              <button className="strategy-secondary-button" type="button" onClick={() => stopRun()}>
                <Square size={14} /> Stop Bot
              </button>
            )}
            <span className="deriv-pro-bot-status" role="status">
              {executing ? "Order submitted · waiting for the one-tick contract response…" : runStatus}
            </span>
          </div>
          {error && <div className="deriv-pro-bot-error" role="alert"><CircleAlert size={15} />{error}</div>}

          <div className="deriv-pro-bot-run-summary">
            <span>Run trades <strong>{runTradeCount}/{configRef.current?.maxTrades ?? (Number(maxTrades) || 0)}</strong></span>
            <span>Run net P/L <strong>{runProfitPending ? "PENDING" : runTradeCount === 0 ? "—" : <ProfitLossValue amount={runProfit} currency={currency} />}</strong></span>
            <span>All-session net P/L <strong>{allSessionProfitPending ? "PENDING" : <ProfitLossValue amount={totalProfit} currency={currency} />}</strong></span>
            <span>Balance <strong>{balance === null ? "—" : formatMoneyForDisplay(balance, currency, displayCurrency, rate)}</strong></span>
          </div>

          <div className="deriv-pro-bot-results">
            <div className="deriv-pro-bot-results-heading">
              <div><span className="terminal-eyebrow">TRADE RESULTS</span><h3>Bot transactions</h3></div>
              <small>Session history · {trades.length} trades</small>
            </div>
            {trades.length === 0 ? (
              <div className="deriv-pro-bot-empty">Settled bot trades will appear here.</div>
            ) : (
              <div className="deriv-pro-bot-table-wrap">
                <table className="deriv-pro-bot-table">
                  <thead><tr><th>Bot</th><th>Time</th><th>Market</th><th>Contract</th><th>Entry → Exit</th><th>Contract value (stake)</th><th>Net P/L</th><th>Result</th></tr></thead>
                  <tbody>
                    {[...trades].reverse().map((trade) => {
                      const netProfit = settledTradeNetProfit(trade);
                      const profitPending = trade.settlementPending || trade.orderStatusUnknown || trade.result === "pending";
                      return (
                      <tr key={trade.id}>
                        <td>Bot {trade.botId}</td>
                        <td>{trade.time}</td>
                        <td>{trade.market}</td>
                        <td>{formatDerivContractType(trade.contractType, trade.barrier)}</td>
                        <td>{trade.entrySpot ?? "—"} → {trade.exitSpot ?? "—"}</td>
                        <td>{formatMoneyForDisplay(actualTradeStake(trade), trade.currency, displayCurrency, rate)}</td>
                        <td>{profitPending ? "PENDING" : <ProfitLossValue amount={netProfit} currency={trade.currency} />}</td>
                        <td><span className={`deriv-pro-bot-result-badge is-${trade.orderStatusUnknown ? "pending" : trade.result}`}>{trade.orderStatusUnknown ? "unknown" : trade.settlementPending ? "pending" : trade.result}</span></td>
                      </tr>
                    );})}
                  </tbody>
                </table>
                <div className="bot-transaction-totals deriv-pro-bot-result-totals" aria-label="Premium bot transaction totals">
                  <span><small>CONTRACT VALUE (STAKE)</small><strong>{formatMoneyForDisplay(resultSummary.totalStake, currency, displayCurrency, rate)}</strong></span>
                  <span><small>CONTRACT</small><strong>{contractSummary}</strong></span>
                  <span><small>NO. OF RUNS</small><strong>{trades.length}</strong></span>
                  <span><small>CONTRACTS LOST</small><strong>{resultSummary.contractsLost}</strong></span>
                  <span><small>CONTRACTS WON</small><strong>{resultSummary.contractsWon}</strong></span>
                  <span><small>TOTAL NET PROFIT/LOSS</small><strong>{allSessionProfitPending ? "PENDING" : <ProfitLossValue amount={resultSummary.totalProfit} currency={currency} />}</strong></span>
                </div>
              </div>
            )}
          </div>
        </section>
        <p className="deriv-pro-bot-disclaimer">These rule-based signals use past ticks and do not predict future results. Trading can lose the stake; test in Demo first. Take-profit and stop-loss are measured from this page’s settled session results.</p>
      </div>

      <aside className="strategy-side-panel deriv-pro-bot-side">
        <div className="strategy-side-kicker">ACCOUNT & LIVE SUPPORT</div>
        <h2>{market?.label ?? "No market selected"}</h2>
        <div className="apex-price">{quote?.price === null || quote?.price === undefined ? "— —" : quote.price.toFixed(quote.pipSize)} <small>{quote?.status === "live" ? "LIVE" : "CONNECTING"}</small></div>
        <div className="deriv-pro-bot-account-card">
          <span>CONNECTED ACCOUNT</span>
          <strong>{accountMode} · {currency}</strong>
          <small>{balance === null ? "Balance not available" : `Balance ${formatMoneyForDisplay(balance, currency, displayCurrency, rate)}`}</small>
        </div>
        <div className="deriv-pro-bot-booking">
          <div className="deriv-pro-bot-booking-icon"><ShieldCheck size={17} /></div>
          <h3>Book live trading</h3>
          <p>WhatsApp booking is available after a real USD Deriv account is verified above $100. The ten bots remain free and do not require this check.</p>
          {bookingEligibility.eligible ? (
            <a className="strategy-primary-button" href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={14} /> Book on WhatsApp
            </a>
          ) : (
            <div className="deriv-pro-bot-eligibility" role="status">
              {bookingEligibility.checked ? <CircleAlert size={14} /> : <span className="deriv-pro-bot-spinner" />}
              <span>{bookingEligibility.reason}</span>
            </div>
          )}
          <small>Booking and support through our WhatsApp group.</small>
        </div>
        <div className="deriv-pro-bot-note"><CircleCheck size={14} /><span>Free bots · direct Deriv execution · no recurring fees</span></div>
      </aside>
    </section>
  );
}
