import type { DerivContractType } from './deriv-contracts';

export type BulkTradeType = 'Even/Odd' | 'Rise/Fall' | 'Over/Under';
export type BulkMarketDefinition = {
  label: string;
  name: string;
  symbol: string;
  family: 'fx' | 'volatility';
};
export type BulkMarketQuote = {
  status: 'connecting' | 'live' | 'closed' | 'error';
  price: number | null;
  previousPrice: number | null;
  pipSize: number;
  ticks: number[];
  lastTickAt: number | null;
};
export type BulkScanResult = {
  definition: BulkMarketDefinition;
  quote: BulkMarketQuote;
  side: 'Even' | 'Odd' | 'Rise' | 'Fall' | 'Over' | 'Under';
  contractType: DerivContractType;
  observedShare: number;
  recentObservedShare: number;
  windowAgreement: boolean;
  hasSignal: boolean;
  sampleSize: number;
  rationale: string;
  barrier?: number;
};
export type BulkScanAnalysis = {
  result: BulkScanResult | null;
  digitDistribution: Array<{ digit: number; percentage: number }>;
  sampleSize: number;
  message: string;
};

export const MIN_BULK_SCAN_TICKS = 20;
const MAX_BULK_SCAN_TICKS = 999;
const MAX_BULK_TICK_AGE_MS = 15_000;

type BulkWindowSummary = {
  side: BulkScanResult['side'];
  observedShare: number;
  hasActivity: boolean;
  rationale: string;
};

function summarizeBulkWindow(
  ticks: number[],
  digits: number[],
  tradeType: BulkTradeType,
): BulkWindowSummary {
  if (tradeType === 'Rise/Fall') {
    const changes = ticks.slice(1).map((tick, index) => tick - ticks[index]);
    const rising = changes.filter((change) => change > 0).length;
    const falling = changes.filter((change) => change < 0).length;
    const flat = changes.length - rising - falling;
    const directional = rising + falling;
    const side = rising >= falling ? 'Rise' : 'Fall';
    const leadingCount = Math.max(rising, falling);
    const observedShare = changes.length ? (leadingCount / changes.length) * 100 : 0;
    return {
      side,
      observedShare,
      hasActivity: directional > 0 && rising !== falling && observedShare > 50,
      rationale: `${rising} rising, ${falling} falling and ${flat} flat tick changes`,
    };
  }

  if (tradeType === 'Over/Under') {
    const over = digits.filter((digit) => digit > 4).length;
    const under = digits.filter((digit) => digit < 4).length;
    const neutral = digits.filter((digit) => digit === 4).length;
    const side = over > under ? 'Over' : 'Under';
    const leadingCount = Math.max(over, under);
    const observedShare = digits.length ? (leadingCount / digits.length) * 100 : 0;
    return {
      side,
      observedShare,
      hasActivity: over !== under && observedShare > 50,
      rationale: `${over} digits over 4, ${under} under 4 and ${neutral} neutral 4s`,
    };
  }

  const even = digits.filter((digit) => digit % 2 === 0).length;
  const odd = digits.length - even;
  const side = even >= odd ? 'Even' : 'Odd';
  const leadingCount = Math.max(even, odd);
  const observedShare = digits.length ? (leadingCount / digits.length) * 100 : 0;
  return {
    side,
    observedShare,
    hasActivity: even !== odd && observedShare > 50,
    rationale: `${even} even and ${odd} odd digits`,
  };
}

export function analyzeBulkMarket(
  definition: BulkMarketDefinition,
  quote: BulkMarketQuote | undefined,
  tradeType: BulkTradeType,
  requestedWindow: number,
  now = Date.now(),
): BulkScanAnalysis {
  const emptyDistribution = Array.from({ length: 10 }, (_, digit) => ({ digit, percentage: 0 }));
  if (!Number.isInteger(requestedWindow) || requestedWindow < MIN_BULK_SCAN_TICKS || requestedWindow > MAX_BULK_SCAN_TICKS) {
    return {
      result: null,
      digitDistribution: emptyDistribution,
      sampleSize: 0,
      message: `Set the scan window to ${MIN_BULK_SCAN_TICKS}–${MAX_BULK_SCAN_TICKS} ticks.`,
    };
  }

  const windowSize = requestedWindow;
  const ticks = (quote?.ticks ?? []).filter(Number.isFinite).slice(-windowSize);
  const requestedPipSize = quote?.pipSize ?? 2;
  const pipSize = Number.isInteger(requestedPipSize) && requestedPipSize >= 0 && requestedPipSize <= 20 ? requestedPipSize : 2;
  const digits = ticks.map((tick) => Number(tick.toFixed(pipSize).replace(/\D/g, '').slice(-1)))
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
  const counts = Array.from({ length: 10 }, () => 0);
  digits.forEach((digit) => { counts[digit] += 1; });
  const digitDistribution = counts.map((count, digit) => ({
    digit,
    percentage: digits.length ? (count / digits.length) * 100 : 0,
  }));
  const sampleSize = ticks.length;
  const tickAge = quote?.lastTickAt === null || quote?.lastTickAt === undefined
    ? Number.POSITIVE_INFINITY
    : now - quote.lastTickAt;

  if (quote?.status !== 'live' || tickAge > MAX_BULK_TICK_AGE_MS) {
    return { result: null, digitDistribution, sampleSize, message: `Waiting for a fresh live Deriv tick on ${definition.name}.` };
  }
  if (sampleSize < windowSize || digits.length < windowSize) {
    return {
      result: null,
      digitDistribution,
      sampleSize,
      message: `Need ${windowSize} live ticks for this scan window; received ${sampleSize}.`,
    };
  }

  const overall = summarizeBulkWindow(ticks, digits, tradeType);
  const splitIndex = Math.floor(ticks.length / 2);
  const firstHalf = summarizeBulkWindow(ticks.slice(0, splitIndex), digits.slice(0, splitIndex), tradeType);
  const recentHalf = summarizeBulkWindow(ticks.slice(splitIndex), digits.slice(splitIndex), tradeType);
  const windowAgreement = overall.hasActivity && firstHalf.hasActivity && recentHalf.hasActivity &&
    firstHalf.side === recentHalf.side && overall.side === recentHalf.side;
  const side = overall.side;
  let contractType: DerivContractType;
  let barrier: number | undefined;
  if (tradeType === 'Rise/Fall') {
    contractType = side === 'Rise' ? 'CALL' : 'PUT';
  } else if (tradeType === 'Over/Under') {
    contractType = side === 'Over' ? 'DIGITOVER' : 'DIGITUNDER';
    barrier = 4;
  } else {
    contractType = side === 'Even' ? 'DIGITEVEN' : 'DIGITODD';
  }
  const rationale = `${overall.rationale}. First half: ${firstHalf.side} ${firstHalf.observedShare.toFixed(1)}%; recent half: ${recentHalf.side} ${recentHalf.observedShare.toFixed(1)}%.`;

  return {
    result: {
      definition,
      quote: quote!,
      side,
      contractType,
      observedShare: overall.observedShare,
      recentObservedShare: recentHalf.observedShare,
      windowAgreement,
      hasSignal: windowAgreement,
      sampleSize,
      rationale,
      barrier,
    },
    digitDistribution,
    sampleSize,
    message: windowAgreement
      ? `${definition.name}: both halves show ${side} in ${sampleSize} live ticks. This describes the sample; it is not a forecast.`
      : `${definition.name}: the two halves do not show a majority for the same side across all ticks. No automatic entry is available.`,
  };
}
