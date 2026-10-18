import { createContext, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getGetOwnerAccessQueryKey,
  getGetOwnerActivityQueryKey,
  getGetLiveTradingEligibilityQueryKey,
  useGetOwnerAccess,
  useGetOwnerActivity,
  useGetLiveTradingEligibility,
  type OwnerActivityResponse,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import DerivProBotsView from './components/DerivProBotsView';
import CurrencyConverter from './components/CurrencyConverter';
import { useDisplayCurrencyPreference } from './hooks/useDisplayCurrencyPreference';
import { convertCurrency, currencyLabel } from './lib/currencies';
import RiskDisclaimerNote from './components/RiskDisclaimerNote';
import LanguageSelector from './components/LanguageSelector';
import { useLanguage } from './lib/language-context';
import { heroDescriptions } from './lib/languages';
import { useUsdKesRate } from './hooks/useUsdKesRate';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { LegacyAuthProvider, useAppAuth } from '@/auth';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { analyzeBulkMarket, MIN_BULK_SCAN_TICKS, type BulkScanResult } from './lib/bulk-trader-scanner';
import {
  executeDerivTrade,
  formatDerivContractType,
  getDerivBarrierError,
  isDerivContractType,
  mapManualContractToDeriv,
  requestDerivProposal,
  type DerivContractType,
  type DerivExecutionInput,
  type DerivProposalQuote,
  type ManualContractSide,
  type ManualContractType,
} from './lib/deriv-contracts';
import { manualEntryBatchDecision } from './lib/manual-entry-batch';
import { startPublicIntro } from './lib/public-intro';
import { normalizeTradeExecution, settledTradeNetProfit, sumSettledTradeNetProfit } from './lib/trade-financials';
import {
  CurrencyDisplayContext,
  formatMoneyForDisplay,
  formatSignedMoneyForDisplay,
  type DisplayCurrency,
  useCurrencyDisplay,
} from './lib/display-currency';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Crown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  FileText,
  Flame,
  Gauge,
  Layers3,
  LineChart,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const DERIV_REFERRAL_URL = 'https://t.deriv.link?t=SSJBZ9FQTVP8';
const SUPPORT_PHONE_DISPLAY = '0793614024';
const SUPPORT_PHONE_LINK = 'tel:+254793614024';
const SUPPORT_PHONE_INTERNATIONAL = SUPPORT_PHONE_DISPLAY.replace(/\D/g, '').replace(/^0/, '254');
const WHATSAPP_SUPPORT_URL = `https://wa.me/${SUPPORT_PHONE_INTERNATIONAL}?text=${encodeURIComponent('Hi, I need support with ProTraders FX.')}`;
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/CSjckmOKEZgBGgAoKacPNt';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const PUBLIC_MARKET_WS = 'wss://api.derivws.com/trading/v1/options/ws/public';
const PUBLIC_TICK_BUFFER = 1000;

type MarketDefinition = {
  label: string;
  name: string;
  symbol: string;
  family: 'fx' | 'volatility';
};
type StreamStatus = 'connecting' | 'live' | 'closed' | 'error';
type MarketQuote = {
  status: StreamStatus;
  price: number | null;
  previousPrice: number | null;
  pipSize: number;
  ticks: number[];
  lastTickAt: number | null;
};
type ExecutedTrade = {
  contractId?: string | number;
  transactionId?: string | number;
  type?: string;
  contractType?: string;
  contract_type?: string;
  longcode?: string;
  barrier?: number;
  marketName?: string;
  mode?: string;
  buyPrice?: number;
  currency?: string;
  result?: 'won' | 'lost' | 'pending';
  status?: string | null;
  settlementPending?: boolean;
  settlementError?: string | null;
  orderStatusUnknown?: boolean;
  profit?: number | null;
  payout?: number | null;
  stake?: number;
  entrySpot?: number | string | null;
  exitSpot?: number | string | null;
};
type BatchResult = {
  profit: number;
  amount: number;
  trades: number;
  currency: string;
  settlementPending?: boolean;
  orderStatusUnknown?: boolean;
  tradeResults?: ExecutedTrade[];
};

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function formatSignedProfit(profit: number | string | null | undefined) {
  const value = finiteNumber(profit);
  if (value === null) return '—';
  if (value === 0) return 'FLAT';
  return value > 0 ? `+${Math.abs(value).toFixed(2)}` : `-${Math.abs(value).toFixed(2)}`;
}

function resolvedTradeProfit(trade: ExecutedTrade) {
  return settledTradeNetProfit(trade);
}

function configuredMultiplier(value: string) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 1 ? parsed : null;
}

function nextMartingaleStake(baseStake: number, multiplier: number, consecutiveLosses: number) {
  return baseStake * (multiplier ** consecutiveLosses);
}

function normalizeExecutedTrade(trade: ExecutedTrade): ExecutedTrade {
  return normalizeTradeExecution(trade);
}

function unresolvedTradeMessage(trade: ExecutedTrade) {
  if (trade.orderStatusUnknown) {
    return "Deriv did not confirm whether the order was placed. Check your Deriv transaction history before retrying.";
  }
  return `Trade ${trade.contractId ?? ""} was placed; settlement is pending. Do not submit it again.`;
}

function totalTradeProfit(trades: ExecutedTrade[]) {
  return sumSettledTradeNetProfit(trades);
}

function settledTradeOutcome(trade: ExecutedTrade): 'won' | 'lost' | null {
  if (trade.settlementPending || trade.orderStatusUnknown) return null;
  const status = String(trade.status ?? '').toLowerCase();
  if (status === 'won' || status === 'lost') return status;
  const result = String(trade.result ?? '').toLowerCase();
  if (result === 'won' || result === 'lost') return result;
  const profit = resolvedTradeProfit(trade);
  return profit === null ? null : profit > 0 ? 'won' : profit < 0 ? 'lost' : null;
}

function summarizeTrades(trades: ExecutedTrade[]) {
  const totalStake = trades.reduce((total, trade) => (
    total + (trade.orderStatusUnknown ? 0 : finiteNumber(trade.stake) ?? finiteNumber(trade.buyPrice) ?? 0)
  ), 0);
  const payoutIsComplete = trades.length > 0 && trades.every((trade) => (
    !trade.settlementPending && !trade.orderStatusUnknown && finiteNumber(trade.payout) !== null
  ));
  const totalPayout = payoutIsComplete
    ? trades.reduce((total, trade) => total + (finiteNumber(trade.payout) ?? 0), 0)
    : null;
  const totalProfit = trades.some((trade) => trade.settlementPending || trade.orderStatusUnknown)
    ? null
    : totalTradeProfit(trades);
  const outcomes = trades.map(settledTradeOutcome);
  return {
    totalStake,
    totalPayout,
    totalProfit,
    contractsWon: outcomes.filter((outcome) => outcome === 'won').length,
    contractsLost: outcomes.filter((outcome) => outcome === 'lost').length,
    settledCount: outcomes.filter((outcome) => outcome !== null).length,
  };
}

function formatTradePoint(value: number | string | null | undefined) {
  const parsed = finiteNumber(value);
  if (parsed === null) return '—';
  return parsed.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function tradeContractLabel(trade: ExecutedTrade) {
  const candidates = [trade.contractType, trade.contract_type, trade.type].filter((value) => typeof value === 'string' && value.trim());
  for (const candidate of candidates) {
    const label = formatDerivContractType(candidate, trade.barrier);
    if (label !== 'TRADE') return label;
  }
  return 'TRADE';
}

function tradeContractSummary(trades: ExecutedTrade[]) {
  const labels = [...new Set(trades.map(tradeContractLabel).filter((label) => label !== 'TRADE'))];
  return labels.length ? labels.join(' · ') : trades.length ? 'Contract details unavailable' : '—';
}

function tradeDirection(trade: ExecutedTrade): 'up' | 'down' | null {
  const contractType = String(trade.contractType ?? trade.type ?? '').toUpperCase();
  if (['CALL', 'RISE', 'DIGITOVER', 'OVER'].includes(contractType)) return 'up';
  if (['PUT', 'FALL', 'DIGITUNDER', 'UNDER'].includes(contractType)) return 'down';
  return null;
}

function TradeTypeCell({ trade, meta }: { trade: ExecutedTrade; meta: string }) {
  const direction = tradeDirection(trade);
  return (
    <span className="trade-type-cell">
      <span className={`trade-type-symbol ${direction ? `is-${direction}` : 'is-neutral'}`} aria-hidden="true">
        <BarChart3 size={13} />
        {direction === 'up' && <span className="trade-type-direction is-up"><ArrowUpRight size={14} /></span>}
        {direction === 'down' && <span className="trade-type-direction is-down"><ArrowDownRight size={14} /></span>}
      </span>
      <span className="trade-type-copy">
        <strong>{tradeContractLabel(trade)}</strong>
        <small>{meta}</small>
      </span>
    </span>
  );
}

function TradeSpotPair({ trade, className }: { trade: ExecutedTrade; className: string }) {
  return (
    <span className={`trade-spot-pair ${className}`}>
      <b><i className="is-entry" aria-hidden="true" />{formatTradePoint(trade.entrySpot)}</b>
      <b><i className="is-exit" aria-hidden="true" />{formatTradePoint(trade.exitSpot)}</b>
    </span>
  );
}

function TradeMoneyDetails({ trade, fallbackCurrency }: { trade: ExecutedTrade; fallbackCurrency: string }) {
  const { displayCurrency, rate } = useCurrencyDisplay();
  const currency = trade.currency ?? fallbackCurrency;
  const stake = finiteNumber(trade.stake) ?? finiteNumber(trade.buyPrice);
  const profit = resolvedTradeProfit(trade);
  return (
    <span className="trade-money-details">
      <b>{stake === null ? 'Stake —' : `Stake ${formatMoneyForDisplay(stake, currency, displayCurrency, rate)}`}</b>
      <strong className={profit === null ? 'is-flat' : profit < 0 ? 'is-loss' : 'is-win'}>
        {profit === null ? 'Net P/L pending' : `Net P/L ${formatSignedMoneyForDisplay(profit, currency, displayCurrency, rate)}`}
      </strong>
    </span>
  );
}

function TradeResultDialog({ result, onClose }: { result: BatchResult | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'summary' | 'transactions' | 'journal'>('summary');
  const { displayCurrency, rate } = useCurrencyDisplay();
  useEffect(() => {
    if (result) setActiveTab('summary');
  }, [result]);
  if (!result) return null;
  const resultTone = result.profit < 0 ? 'is-loss' : result.profit > 0 ? 'is-win' : 'is-flat';
  const tradeResults = result.tradeResults ?? [];
  const latestTrade = tradeResults.at(-1);
  const tradeSummary = summarizeTrades(tradeResults);
  const totalStake = tradeResults.length ? tradeSummary.totalStake : result.amount;
  const contractSummary = tradeContractSummary(tradeResults);
  return (
    <div className="bot-result-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`bot-result-dialog ai-batch-result ${resultTone}`} role="dialog" aria-modal="true" aria-label="Trade result">
        <button type="button" className="bot-result-close" onClick={onClose} aria-label="Close result">×</button>
        <span className="ai-batch-result-kicker">{result.orderStatusUnknown ? 'ORDER STATUS UNKNOWN' : result.settlementPending ? 'SETTLEMENT PENDING' : result.profit < 0 ? 'LOSS' : result.profit > 0 ? 'PROFIT' : 'FLAT'}</span>
        <strong className="ai-batch-result-value">{result.settlementPending || result.orderStatusUnknown ? 'PENDING' : formatSignedMoneyForDisplay(result.profit, result.currency, displayCurrency, rate)}</strong>
        {(result.settlementPending || result.orderStatusUnknown) && <p role="status">{result.orderStatusUnknown ? "Deriv did not confirm whether the order was placed. Check your Deriv transaction history before retrying." : "The order was placed. Deriv has not returned its final result yet; do not submit it again."}</p>}
        <div className="ai-batch-result-tabs" role="tablist" aria-label="Trade result details">
          {([
            ['summary', 'SUMMARY'],
            ['transactions', 'TRANSACTIONS'],
            ['journal', 'JOURNAL'],
          ] as const).map(([tab, label]) => (
            <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{label}</button>
          ))}
        </div>
        {activeTab === 'summary' && (
          <div className="ai-batch-result-summary">
            <div className="ai-batch-result-stats">
              <span><small>TOTAL STAKE</small><b>{formatMoneyForDisplay(totalStake, result.currency, displayCurrency, rate)}</b></span>
              <span><small>CONTRACT</small><b>{contractSummary}</b></span>
              <span><small>NO. OF RUNS</small><b>{result.trades}</b></span>
              <span><small>CONTRACTS LOST</small><b>{tradeSummary.contractsLost}</b></span>
              <span><small>CONTRACTS WON</small><b>{tradeSummary.contractsWon}</b></span>
              <span><small>TOTAL NET PROFIT/LOSS</small><b className={tradeSummary.totalProfit !== null && tradeSummary.totalProfit < 0 ? 'is-loss' : 'is-win'}>{formatSignedMoneyForDisplay(tradeSummary.totalProfit, result.currency, displayCurrency, rate)}</b></span>
            </div>
            <div className="ai-batch-result-points">
              <span><small>LAST ENTRY POINT</small><b>{formatTradePoint(latestTrade?.entrySpot)}</b></span>
              <span><small>LAST EXIT POINT</small><b>{formatTradePoint(latestTrade?.exitSpot)}</b></span>
            </div>
          </div>
        )}
        {activeTab === 'transactions' && (
          <div className="ai-batch-result-table" role="table" aria-label="Settled transactions">
            <div className="ai-batch-result-table-row is-head" role="row"><span>CONTRACT</span><span>ENTRY / EXIT SPOT</span><span>STAKE / NET P/L</span></div>
            {tradeResults.length ? tradeResults.slice().reverse().map((trade, index) => {
              return (
                <div className="ai-batch-result-table-row" role="row" key={`${trade.contractId ?? 'trade'}-${index}`}>
                  <TradeTypeCell trade={trade} meta={[trade.orderStatusUnknown ? 'ORDER STATUS UNKNOWN' : trade.settlementPending ? 'SETTLEMENT PENDING' : `Trade ${tradeResults.length - index}`, trade.marketName, trade.mode, trade.transactionId ? `TX ${trade.transactionId}` : ''].filter(Boolean).join(' · ')} />
                  <TradeSpotPair trade={trade} className="ai-batch-result-row-points" />
                  <TradeMoneyDetails trade={trade} fallbackCurrency={result.currency} />
                </div>
              );
            }) : <p className="ai-batch-result-empty">Settled transactions will appear here.</p>}
          </div>
        )}
        {activeTab === 'journal' && (
          <div className="ai-batch-result-table ai-batch-result-journal-table" role="table" aria-label="Trade journal">
            <div className="ai-batch-result-table-row is-head" role="row"><span>TRADE / CONTRACT</span><span>ENTRY / EXIT SPOT</span><span>STAKE / NET P/L</span></div>
            {tradeResults.length ? tradeResults.slice().reverse().map((trade, index) => (
              <div className="ai-batch-result-table-row" role="row" key={`${trade.contractId ?? 'points'}-${index}`}>
                <span><b>#{tradeResults.length - index}</b><small>{tradeContractLabel(trade)}{trade.marketName ? ` · ${trade.marketName}` : ''} · {trade.status ?? trade.result ?? 'pending'}</small></span>
                <span className="ai-batch-result-row-points"><b><i>ENTRY</i>{formatTradePoint(trade.entrySpot)}</b><b><i>EXIT</i>{formatTradePoint(trade.exitSpot)}</b></span>
                <TradeMoneyDetails trade={trade} fallbackCurrency={result.currency} />
              </div>
            )) : <p className="ai-batch-result-empty">Settled trades will appear in the journal.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function TradeFigureStrip({ trades, currency }: { trades: ExecutedTrade[]; currency: string }) {
  const { displayCurrency, rate } = useCurrencyDisplay();
  if (!trades.length) return null;
  const placed = trades.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0);
  const profit = totalTradeProfit(trades);
  const tone = profit === null ? 'is-flat' : profit < 0 ? 'is-loss' : profit > 0 ? 'is-win' : 'is-flat';
  return (
    <div className={`trade-figure-strip ${tone}`} aria-label="Trade figures">
      <span><small>TRADES</small><b>{trades.length}</b></span>
      <span><small>PLACED</small><b>{formatMoneyForDisplay(placed, currency, displayCurrency, rate)}</b></span>
      <span><small>NET P/L</small><b>{formatSignedMoneyForDisplay(profit, currency, displayCurrency, rate)}</b></span>
    </div>
  );
}

type BotTransactionTab = 'Summary' | 'Transactions' | 'Journal';

function BotTransactionPanel({
  trades,
  currency,
  running,
  activeTab,
  onTabChange,
  onViewDetail,
  historyLabel = 'TRADE HISTORY',
  sectionLabel = 'Bot transaction details',
  runningLabel = 'Current bot run is active',
  emptyMessage,
}: {
  trades: ExecutedTrade[];
  currency: string;
  running: boolean;
  activeTab: BotTransactionTab;
  onTabChange: (tab: BotTransactionTab) => void;
  onViewDetail: () => void;
  historyLabel?: string;
  sectionLabel?: string;
  runningLabel?: string;
  emptyMessage?: string;
}) {
  const { displayCurrency, rate } = useCurrencyDisplay();
  const tradeSummary = summarizeTrades(trades);
  const placed = tradeSummary.totalStake;
  const profit = tradeSummary.totalProfit;
  const contracts = tradeContractSummary(trades);
  const latestTrade = trades.at(-1);

  const downloadTransactions = () => {
    if (!trades.length) return;
    const escapeCsv = (value: string | number | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Contract', 'Market', 'Mode', 'Entry spot', 'Exit spot', 'Stake', 'Net P/L', 'Currency'],
      ...trades.map((trade) => [
        tradeContractLabel(trade),
        trade.marketName,
        trade.mode,
        formatTradePoint(trade.entrySpot),
        formatTradePoint(trade.exitSpot),
        formatTradePoint(trade.stake ?? trade.buyPrice),
        formatSignedProfit(resolvedTradeProfit(trade)),
        trade.currency ?? currency,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'protraders-transactions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="free-bot-transactions" className="bot-transaction-panel" aria-label={sectionLabel}>
      <header className="bot-transaction-heading">
        <div><span>{historyLabel}</span><strong>Transactions</strong></div>
        <div className="bot-transaction-actions">
          <button type="button" onClick={downloadTransactions} disabled={!trades.length}>Download</button>
          <button type="button" onClick={onViewDetail} disabled={!trades.length}>View Detail</button>
        </div>
      </header>
      <nav className="bot-transaction-tabs" role="tablist" aria-label="Bot transaction views">
        {(['Summary', 'Transactions', 'Journal'] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => onTabChange(tab)}>{tab}</button>
        ))}
      </nav>
      {activeTab === 'Summary' && (
        <div className="bot-transaction-summary">
            <article><span>SETTLED TRADES</span><strong>{tradeSummary.settledCount}</strong><small>{running ? runningLabel : 'Completed contracts'}</small></article>
          <article><span>TOTAL STAKE</span><strong>{formatMoneyForDisplay(placed, currency, displayCurrency, rate)}</strong><small>Stake placed only</small></article>
          <article><span>CONTRACT</span><strong>{contracts}</strong><small>Selected contract type</small></article>
          <article><span>NET P/L</span><strong className={profit !== null && profit < 0 ? 'is-loss' : 'is-win'}>{formatSignedMoneyForDisplay(profit, currency, displayCurrency, rate)}</strong><small>Settled result, stake excluded</small></article>
          <article><span>LAST ENTRY / EXIT</span><strong>{formatTradePoint(latestTrade?.entrySpot)} / {formatTradePoint(latestTrade?.exitSpot)}</strong><small>Latest settled contract</small></article>
        </div>
      )}
      {activeTab === 'Transactions' && (
        <div className="bot-transaction-table" role="table" aria-label="Bot settled transactions">
          <div className="bot-transaction-row is-head" role="row"><span>CONTRACT</span><span>ENTRY / EXIT SPOT</span><span>STAKE / NET P/L</span></div>
          {trades.length ? trades.slice().reverse().map((trade, index) => {
            return (
              <div className="bot-transaction-row" role="row" key={`${trade.contractId ?? 'bot-trade'}-${index}`}>
                <TradeTypeCell trade={trade} meta={[trade.orderStatusUnknown ? 'ORDER STATUS UNKNOWN' : trade.settlementPending ? 'SETTLEMENT PENDING' : `Trade ${trades.length - index}`, trade.marketName, trade.mode, trade.transactionId ? `TX ${trade.transactionId}` : ''].filter(Boolean).join(' · ')} />
                <TradeSpotPair trade={trade} className="bot-transaction-points" />
                <TradeMoneyDetails trade={trade} fallbackCurrency={currency} />
              </div>
            );
          }) : <p className="bot-transactions-empty">{emptyMessage ?? (running ? 'The current contract will appear here after it settles.' : 'Press Run Bot to create a transaction.')}</p>}
          {trades.length > 0 && (
            <div className="bot-transaction-totals" aria-label="Transaction totals">
              <span><small>TOTAL STAKE</small><strong>{formatMoneyForDisplay(placed, currency, displayCurrency, rate)}</strong></span>
              <span><small>CONTRACT</small><strong>{contracts}</strong></span>
              <span><small>NO. OF RUNS</small><strong>{trades.length}</strong></span>
              <span><small>CONTRACTS LOST</small><strong>{tradeSummary.contractsLost}</strong></span>
              <span><small>CONTRACTS WON</small><strong>{tradeSummary.contractsWon}</strong></span>
              <span><small>TOTAL NET PROFIT/LOSS</small><strong className={profit !== null && profit < 0 ? 'is-loss' : 'is-win'}>{formatSignedMoneyForDisplay(profit, currency, displayCurrency, rate)}</strong></span>
            </div>
          )}
        </div>
      )}
      {activeTab === 'Journal' && (
        <div className="bot-transaction-journal">
          {trades.length ? trades.slice().reverse().map((trade, index) => (
            <div key={`${trade.contractId ?? 'journal-trade'}-${index}`}>
              <strong>Trade {trades.length - index} · {tradeContractLabel(trade)}</strong>
              <span>
                {trade.marketName ?? 'Market'}{trade.mode ? ` · ${trade.mode}` : ''} · {trade.status ?? trade.result ?? 'pending'} · Entry {formatTradePoint(trade.entrySpot)} → Exit {formatTradePoint(trade.exitSpot)}
                <TradeMoneyDetails trade={trade} fallbackCurrency={currency} />
              </span>
            </div>
          )) : <p className="bot-transactions-empty">No journal entries yet.</p>}
        </div>
      )}
    </section>
  );
}

function OwnerActivityView() {
  const activityQuery = useGetOwnerActivity({
    query: {
      queryKey: getGetOwnerActivityQueryKey(),
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  const data: OwnerActivityResponse | undefined = activityQuery.data;
  const formatCurrencyTotals = (pick: 'tradingAmount' | 'expectedCommission') => {
    if (!data?.currencyTotals.length) return '—';
    return data.currencyTotals
      .map((total) => {
        const amount = total[pick];
        return amount === null ? `${total.currency} —` : `${total.currency} ${amount.toFixed(2)}`;
      })
      .join(' · ');
  };

  return (
    <section className="owner-activity-view">
      <div className="owner-activity-heading">
        <div>
          <span className="terminal-eyebrow">OWNER MONITORING / LAST {data?.periodDays ?? 30} DAYS</span>
          <h1>Platform trading activity</h1>
          <p>Verified trades placed through ProTraders. Updates every 10 seconds.</p>
        </div>
        <div className="owner-activity-actions">
          <span className="owner-session-badge"><ShieldCheck size={14} /> OWNER VERIFIED</span>
          <button
            type="button"
            onClick={() => void activityQuery.refetch()}
            disabled={activityQuery.isFetching}
            data-testid="button-refresh-owner-activity"
          >
            {activityQuery.isFetching ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>
      {activityQuery.isPending && <div className="owner-activity-state">Loading platform activity…</div>}
      {activityQuery.isError && (
        <div className="owner-activity-state is-error" role="alert">
          <span>{activityQuery.error instanceof Error ? activityQuery.error.message : 'Owner activity is unavailable.'}</span>
          <button type="button" onClick={() => void activityQuery.refetch()} data-testid="button-retry-owner-activity">Retry</button>
        </div>
      )}
      {!activityQuery.isPending && !activityQuery.isError && data && (
        <>
          <div className="owner-activity-grid">
            <article data-testid="metric-active-accounts">
              <span>ACTIVE DERIV ACCOUNTS</span><strong>{data.activeUsers}</strong><small>Unique linked accounts with trades</small>
            </article>
            <article data-testid="metric-settled-trades">
              <span>SETTLED TRADES</span><strong>{data.settledTrades}</strong><small>Completed contracts in this period</small>
            </article>
            <article className="is-compact-value" data-testid="metric-trading-amount">
              <span>TRADING AMOUNT</span><strong>{formatCurrencyTotals('tradingAmount')}</strong><small>Total placed stake by currency</small>
            </article>
            <article className="is-commission is-compact-value" data-testid="metric-expected-commission">
              <span>EXPECTED COMMISSION</span>
              <strong>{formatCurrencyTotals('expectedCommission')}</strong>
              <small>{data.commissionRate === null ? 'Rate not configured; estimate unavailable' : `${(data.commissionRate * 100).toFixed(2)}% configured rate`}</small>
            </article>
          </div>
          <div className="owner-activity-table-wrap">
            <div className="owner-activity-table-heading"><strong>RECENT PLATFORM TRADES</strong><span>Most recent 50 · last {data.periodDays} days</span></div>
            {data.recentTrades.length === 0 ? <p className="owner-activity-empty">No trade executions have been recorded through the platform in this period.</p> : (
              <div className="owner-activity-table">
                {data.recentTrades.map((trade, index) => (
                  <div className="owner-activity-row" key={`${trade.accountRef}-${trade.at}-${index}`} data-testid={`row-platform-trade-${index}`}>
                    <span>
                      <strong>{trade.accountRef}</strong>
                      <small>{trade.symbol} · {trade.contractType} · {trade.mode.toUpperCase()} · {new Date(trade.at).toLocaleString()}</small>
                    </span>
                    <b>{trade.currency} {trade.amount.toFixed(2)}</b>
                    <em className={trade.profit !== null && trade.profit < 0 ? 'is-loss' : 'is-win'}>
                      {formatSignedProfit(trade.profit)}<small>{trade.result.toUpperCase()}</small>
                    </em>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const ONE_SECOND_VOLATILITY_VALUES = [10, 15, 25, 30, 50, 75, 90, 100];
const R_VOLATILITY_VALUES = new Set([10, 25, 50, 75, 100]);
const VOLATILITY_DEFINITIONS: MarketDefinition[] = ONE_SECOND_VOLATILITY_VALUES.flatMap((value) => [
  { label: `VOL ${value} 1s`, name: `Volatility ${value} (1s) Index`, symbol: `1HZ${value}V`, family: 'volatility' as const },
  ...(R_VOLATILITY_VALUES.has(value)
    ? [{ label: `VOL ${value} R`, name: `Volatility ${value} R Index`, symbol: `R_${value}`, family: 'volatility' as const }]
    : []),
]);

const MARKET_DEFINITIONS: MarketDefinition[] = [
  { label: 'EUR/USD', name: 'EUR/USD', symbol: 'frxEURUSD', family: 'fx' },
  { label: 'GBP/USD', name: 'GBP/USD', symbol: 'frxGBPUSD', family: 'fx' },
  { label: 'USD/JPY', name: 'USD/JPY', symbol: 'frxUSDJPY', family: 'fx' },
  { label: 'AUD/USD', name: 'AUD/USD', symbol: 'frxAUDUSD', family: 'fx' },
  { label: 'USD/CAD', name: 'USD/CAD', symbol: 'frxUSDCAD', family: 'fx' },
  ...VOLATILITY_DEFINITIONS,
];
const PUBLIC_MARKET_SYMBOLS = MARKET_DEFINITIONS.map(({ symbol }) => symbol);
const DEFAULT_MARKET_LABEL = 'VOL 100 1s';
const MARKET_CACHE_KEY = 'protraders-fx:last-deriv-quotes-v2';
const PERSISTED_TICK_BUFFER = PUBLIC_TICK_BUFFER;

function getMarketDefinition(label: string) {
  return MARKET_DEFINITIONS.find((market) => market.label === label) ?? VOLATILITY_DEFINITIONS.find((market) => market.label === DEFAULT_MARKET_LABEL)!;
}

function getVolatilityDefinition(name: string) {
  return VOLATILITY_DEFINITIONS.find((market) => market.name === name) ?? getMarketDefinition(DEFAULT_MARKET_LABEL);
}

function usePublicMarketBoard() {
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>(() => {
    let cached: Partial<Record<string, MarketQuote>> = {};
    try {
      const serialized = window.localStorage.getItem(MARKET_CACHE_KEY) ?? '{}';
      if (serialized.length <= 512_000) {
        const parsed: unknown = JSON.parse(serialized);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cached = parsed as Partial<Record<string, MarketQuote>>;
        }
      }
    } catch {
      cached = {};
    }
    return Object.fromEntries(PUBLIC_MARKET_SYMBOLS.map((symbol) => {
      const saved = cached[symbol];
      const ticks = Array.isArray(saved?.ticks)
        ? saved.ticks.filter((tick): tick is number => typeof tick === 'number' && Number.isFinite(tick)).slice(-PERSISTED_TICK_BUFFER)
        : [];
      return [symbol, {
        status: saved?.status ?? 'connecting',
        price: typeof saved?.price === 'number' && Number.isFinite(saved.price) ? saved.price : null,
        previousPrice: typeof saved?.previousPrice === 'number' && Number.isFinite(saved.previousPrice) ? saved.previousPrice : null,
        pipSize: typeof saved?.pipSize === 'number' && Number.isFinite(saved.pipSize) ? saved.pipSize : 2,
        ticks,
        lastTickAt: typeof saved?.lastTickAt === 'number' && Number.isFinite(saved.lastTickAt) ? saved.lastTickAt : null,
      } satisfies MarketQuote];
    }));
  });
  const queuedQuotesRef = useRef(quotes);
  const publishTimerRef = useRef<number | null>(null);
  const cacheTimerRef = useRef<number | null>(null);
  const queueQuoteUpdate = (update: (previous: Record<string, MarketQuote>) => Record<string, MarketQuote>) => {
    queuedQuotesRef.current = update(queuedQuotesRef.current);
    if (publishTimerRef.current !== null) return;
    publishTimerRef.current = window.setTimeout(() => {
      publishTimerRef.current = null;
      setQuotes(queuedQuotesRef.current);
    }, 250);
  };
  useEffect(() => {
    if (cacheTimerRef.current !== null) return;
    cacheTimerRef.current = window.setTimeout(() => {
      cacheTimerRef.current = null;
      try {
        const compact = Object.fromEntries(Object.entries(queuedQuotesRef.current).map(([symbol, quote]) => [
          symbol,
          { ...quote, ticks: quote.ticks.slice(-PERSISTED_TICK_BUFFER) },
        ]));
        window.localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(compact));
      } catch {
        // Storage is a convenience cache; the live stream remains the source of truth.
      }
    }, 2500);
  }, [quotes]);
  useEffect(() => () => {
    if (publishTimerRef.current !== null) window.clearTimeout(publishTimerRef.current);
    if (cacheTimerRef.current !== null) window.clearTimeout(cacheTimerRef.current);
  }, []);
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let suspended = false;
    const liveSymbols = PUBLIC_MARKET_SYMBOLS;

    const closeSocket = () => {
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socket = null;
      }
    };

    const updateQuote = (symbol: string, update: Partial<MarketQuote>) => {
      queueQuoteUpdate((previous) => ({ ...previous, [symbol]: { ...previous[symbol], ...update } }));
    };

    const connect = () => {
      if (disposed || suspended) return;
      closeSocket();
      liveSymbols.forEach((symbol) => updateQuote(symbol, { status: 'connecting' }));
      socket = new WebSocket(PUBLIC_MARKET_WS);
      socket.onopen = () => {
        liveSymbols.forEach((symbol) => {
           socket?.send(JSON.stringify({ ticks_history: symbol, start: 0, end: 'latest', count: PUBLIC_TICK_BUFFER }));
          socket?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        });
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            tick?: { quote?: number; pip_size?: number; symbol?: string };
            quote?: number;
            history?: { prices?: number[]; times?: number[] };
            error?: { code?: string; message?: string };
            echo_req?: { ticks?: string; ticks_history?: string };
          };
          const historySymbol = message.echo_req?.ticks_history;
          const history = message.history;
          if (history && historySymbol) {
            const prices = (history.prices ?? []).filter((price): price is number => typeof price === 'number' && Number.isFinite(price));
            if (prices.length) {
              queueQuoteUpdate((previous) => {
                const current = previous[historySymbol];
                return {
                  ...previous,
                  [historySymbol]: {
                    ...current,
                    status: current?.status === 'live' || current?.status === 'closed' || current?.status === 'error'
                      ? current.status
                      : 'connecting',
                    price: prices.at(-1) ?? null,
                    previousPrice: prices.at(-2) ?? prices.at(-1) ?? null,
                    pipSize: message.tick?.pip_size ?? (historySymbol.startsWith('frx') ? 5 : 2),
                    ticks: prices.slice(-PUBLIC_TICK_BUFFER),
                    lastTickAt: history.times?.at(-1) ?? null,
                  },
                };
              });
            }
            return;
          }
          if (message.error) {
            const symbol = typeof message.echo_req?.ticks === 'string'
              ? message.echo_req.ticks
              : typeof message.echo_req?.ticks_history === 'string'
                ? message.echo_req.ticks_history
                : undefined;
            if (symbol) {
              updateQuote(symbol, {
                status: message.error.code === 'MarketIsClosed' ? 'closed' : 'error',
              });
            }
            return;
          }
          const quote = message.tick?.quote ?? message.quote;
          if (typeof quote !== 'number' || !Number.isFinite(quote)) return;
          const symbol = message.tick?.symbol;
          if (!symbol) return;
          queueQuoteUpdate((previous) => {
            if (!previous[symbol]) return previous;
            return {
              ...previous,
              [symbol]: {
                ...previous[symbol],
                status: 'live',
                price: quote,
                previousPrice: previous[symbol].price ?? previous[symbol].previousPrice,
                pipSize: message.tick?.pip_size ?? 2,
                 ticks: [...previous[symbol].ticks.slice(-(PUBLIC_TICK_BUFFER - 1)), quote],
                lastTickAt: Date.now(),
              },
            };
          });
        } catch {
          liveSymbols.forEach((symbol) => updateQuote(symbol, { status: 'error' }));
        }
      };
      socket.onerror = () => liveSymbols.forEach((symbol) => updateQuote(symbol, { status: 'error' }));
      socket.onclose = () => {
        if (!disposed && !suspended) {
          liveSymbols.forEach((symbol) => updateQuote(symbol, { status: 'error' }));
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    const pauseForNavigation = () => {
      suspended = true;
      closeSocket();
    };
    const resumeAfterNavigation = (event: PageTransitionEvent) => {
      if (suspended || event.persisted || socket?.readyState === WebSocket.CLOSED) {
        suspended = false;
        connect();
      }
    };
    window.addEventListener('pagehide', pauseForNavigation);
    window.addEventListener('pageshow', resumeAfterNavigation);
    connect();
    return () => {
      disposed = true;
      window.removeEventListener('pagehide', pauseForNavigation);
      window.removeEventListener('pageshow', resumeAfterNavigation);
      closeSocket();
    };
  }, []);

  return quotes;
}

function formatMarketPrice(value: number | null, pipSize = 2) {
  return value === null ? '— —' : value.toFixed(pipSize);
}

function quoteTone(quote?: MarketQuote) {
  if (!quote || quote.price === null) return 'neutral';
  const previous = quote.previousPrice ?? quote.ticks.at(-2);
  if (previous === undefined || previous === null || quote.price === previous) return 'neutral';
  return quote.price > previous ? 'up' : 'down';
}

function quoteLastDigit(quote?: MarketQuote) {
  if (!quote || quote.price === null) return '—';
  const formatted = formatMarketPrice(quote.price, quote.pipSize);
  return formatted.replace(/\D/g, '').slice(-1) || '—';
}

type DigitDistribution = {
  counts: number[];
  percentages: number[];
  recentDigits: number[];
  sampleSize: number;
  evenPercentage: number | null;
  oddPercentage: number | null;
};

type DcircleTradeSetup = {
  contractType: ManualContractType;
  side: ManualContractSide;
  stake: string;
  durationTicks: string;
  barrier: string;
};

type DcircleTradeContextValue = {
  activeMarket: string;
  setActiveMarket: (market: string) => void;
  accountMode: 'DEMO' | 'REAL';
  currency: string;
  defaultSetup: DcircleTradeSetup;
  tradeStatus: string;
  onTradeMarket: (definition: MarketDefinition, setup: DcircleTradeSetup) => Promise<boolean>;
};

const DcircleTradeContext = createContext<DcircleTradeContextValue | null>(null);

function getDigitDistribution(quote?: MarketQuote): DigitDistribution {
  const pipSize = quote?.pipSize ?? 2;
  const recentTicks = quote?.ticks.slice(-100) ?? [];
  const recentDigits = recentTicks
    .map((tick) => Number(formatMarketPrice(tick, pipSize).replace(/\D/g, '').slice(-1)))
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
  const counts = Array.from({ length: 10 }, () => 0);
  recentDigits.forEach((digit) => { counts[digit] += 1; });
  const sampleSize = recentDigits.length;
  const percentages = counts.map((count) => sampleSize ? (count / sampleSize) * 100 : 0);
  const evenCount = counts.reduce((total, count, digit) => total + (digit % 2 === 0 ? count : 0), 0);
  const oddCount = sampleSize - evenCount;
  return {
    counts,
    percentages,
    recentDigits,
    sampleSize,
    evenPercentage: sampleSize ? (evenCount / sampleSize) * 100 : null,
    oddPercentage: sampleSize ? (oddCount / sampleSize) * 100 : null,
  };
}

type OverTwoScannerResult = {
  definition: MarketDefinition;
  quote?: MarketQuote;
  digits: number[];
  counts: number[];
  percentages: number[];
  sampleSize: number;
  qualifies: boolean;
  score: number;
};

function getQuoteDigits(quote: MarketQuote | undefined, lookback: number) {
  const pipSize = quote?.pipSize ?? 2;
  return (quote?.ticks.slice(-lookback) ?? [])
    .map((tick) => Number(formatMarketPrice(tick, pipSize).replace(/\D/g, '').slice(-1)))
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
}

function getOverTwoScannerResult(definition: MarketDefinition, quote: MarketQuote | undefined, lookback: number, maxPercentage: number): OverTwoScannerResult {
  const digits = getQuoteDigits(quote, lookback);
  const counts = Array.from({ length: 10 }, () => 0);
  digits.forEach((digit) => { counts[digit] += 1; });
  const sampleSize = digits.length;
  const percentages = counts.map((count) => sampleSize ? (count / sampleSize) * 100 : 0);
  const qualifies = sampleSize >= lookback && [0, 1, 2].every((digit) => percentages[digit] < maxPercentage);
  const score = Math.max(percentages[0] ?? 100, percentages[1] ?? 100, percentages[2] ?? 100);
  return { definition, quote, digits, counts, percentages, sampleSize, qualifies, score };
}

type MarketAiResult = {
  definition: MarketDefinition;
  quote?: MarketQuote;
  score: number;
  bias: 'RISE' | 'FALL' | 'WAIT';
};
type FloatingDigitRecommendation = {
  side: 'Over' | 'Under';
  contractType: 'DIGITOVER' | 'DIGITUNDER';
  barrier: number;
  probability: number;
  sampleSize: number;
  label: string;
  rationale: string;
};

type FloatingScanResult = {
  signal: ReturnType<typeof getMarketSignal>;
  volatilityScore: number;
  sampleSize: number;
  recommendations: FloatingDigitRecommendation[];
  bestRecommendation: FloatingDigitRecommendation;
};

function getFloatingScanResult(definition: MarketDefinition, quote?: MarketQuote): FloatingScanResult {
  const signal = getMarketSignal(definition, quote);
  const recent = quote?.ticks.slice(-36) ?? [];
  const counts = Array.from({ length: 10 }, () => 0);
  recent.forEach((tick) => {
    const digit = Number(formatMarketPrice(tick, quote?.pipSize ?? 2).replace(/\D/g, '').slice(-1));
    if (Number.isFinite(digit)) counts[digit] += 1;
  });
  const sampleSize = recent.length;
  const probabilityFor = (side: FloatingDigitRecommendation['side'], barrier: number) => {
    if (!sampleSize) return 50;
    const favorable = counts.reduce((total, count, digit) => total + (side === 'Over' ? (digit > barrier ? count : 0) : (digit < barrier ? count : 0)), 0);
    return (favorable / sampleSize) * 100;
  };
  const requestedTypes: Array<[FloatingDigitRecommendation['side'], number]> = [
    ['Over', 1],
    ['Under', 7],
    ['Over', 2],
    ['Under', 8],
  ];
  const recommendations = requestedTypes.map(([side, barrier]) => {
    const probability = probabilityFor(side, barrier);
    const contractType = side === 'Over' ? 'DIGITOVER' as const : 'DIGITUNDER' as const;
    return {
      side,
      contractType,
      barrier,
      probability,
      sampleSize,
      label: `${side.toUpperCase()} ${barrier}`,
      rationale: sampleSize ? `${probability.toFixed(1)}% of the last ${sampleSize} digits support ${side.toLowerCase()} ${barrier}` : 'Waiting for enough live digits to confirm this setup',
    };
  });
  const first = recent[0] ?? quote?.price ?? 0;
  const last = recent.at(-1) ?? first;
  const movement = recent.length > 1 ? recent.slice(1).reduce((total, tick, index) => total + Math.abs(tick - recent[index]), 0) / (recent.length - 1) : 0;
  const reference = Math.max(Math.abs(last) * 0.00001, quote?.pipSize ? 10 ** -quote.pipSize : 0.01);
  const volatilityScore = clampSignalScore(35 + (movement / reference) * 3 + Math.abs(last - first) / reference);
  const bestRecommendation = recommendations.reduce((best, recommendation) => recommendation.probability > best.probability ? recommendation : best, recommendations[0]);
  return { signal, volatilityScore, sampleSize, recommendations, bestRecommendation };
}

 function FloatingMarketAI({ marketQuotes, draggable, accountMode, currency, onTradeSettled }: { marketQuotes: Record<string, MarketQuote>; draggable: boolean; accountMode: 'DEMO' | 'REAL'; currency: string; onTradeSettled: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [executionState, setExecutionState] = useState<'idle' | 'executing'>('idle');
  const [liveMarketCount, setLiveMarketCount] = useState(0);
  const [scanResult, setScanResult] = useState<FloatingScanResult | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<FloatingDigitRecommendation | null>(null);
  const [stake, setStake] = useState('1');
  const [duration, setDuration] = useState('1');
  const [runCount, setRunCount] = useState('1');
  const [martingale, setMartingale] = useState('1');
  const [takeProfit, setTakeProfit] = useState('0');
  const [stopLoss, setStopLoss] = useState('0');
  const [executionStatus, setExecutionStatus] = useState('');
  const [trades, setTrades] = useState<ExecutedTrade[]>([]);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const stopRequestedRef = useRef(false);
  const floatingExecutionLockRef = useRef(false);
  useEffect(() => () => { stopRequestedRef.current = true; }, []);
  const [position, setPosition] = useState(() => ({
    x: Math.max(16, window.innerWidth - 82),
    y: Math.max(100, window.innerHeight - 150),
  }));
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const movedRef = useRef(false);

  const clampPosition = (x: number, y: number) => ({
    x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - 68)),
    y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - 68)),
  });

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current.x, current.y));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    const handleOpenRequest = () => {
      setOpen(true);
    };
    window.addEventListener('market-ai-open', handleOpenRequest);
    return () => window.removeEventListener('market-ai-open', handleOpenRequest);
  }, []);

  const executeBestMarket = async (result: FloatingScanResult) => {
    if (floatingExecutionLockRef.current) {
      stopRequestedRef.current = true;
      setExecutionStatus('Stopping after the current trade settles…');
      return;
    }
    const recommendation = selectedRecommendation ?? result.bestRecommendation;
    const amount = Number(stake);
    const durationTicks = Math.max(1, Number.parseInt(duration, 10) || 1);
    const requestedRuns = Math.max(1, Math.floor(Number(runCount) || 1));
    const martingaleMultiplier = configuredMultiplier(martingale);
    const takeProfitLimit = Number(takeProfit);
    const stopLossLimit = Number(stopLoss);
    if (!Number.isFinite(amount) || amount < 0.35) {
      setExecutionStatus(`Enter a stake of at least ${currency} 0.35.`);
      return;
    }
    if (martingaleMultiplier === null) {
      setExecutionStatus('Enter a Martingale multiplier of 1 or greater.');
      return;
    }
    if (!Number.isFinite(takeProfitLimit) || takeProfitLimit < 0 || !Number.isFinite(stopLossLimit) || stopLossLimit < 0) {
      setExecutionStatus(`Enter valid ${currency} Take Profit and Stop Loss limits.`);
      return;
    }
    stopRequestedRef.current = false;
    floatingExecutionLockRef.current = true;
    setExecutionState('executing');
    setBatchResult(null);
    setTrades([]);
    setExecutionStatus(`Executing ${requestedRuns} ${formatDerivContractType(recommendation.contractType, recommendation.barrier)} trade${requestedRuns === 1 ? '' : 's'} on ${result.signal.definition.name}…`);
    let cumulativeProfit = 0;
    let completed = 0;
    let stopReason = '';
    let firstError = '';
    let consecutiveLosses = 0;
    let totalPlaced = 0;
    const settledTrades: ExecutedTrade[] = [];
    let pendingSettlementTrade: ExecutedTrade | null = null;
    for (let index = 0; index < requestedRuns; index += 1) {
      if (stopRequestedRef.current) {
        stopReason = 'Bot stopped by user.';
        break;
      }
      try {
        const tradeAmount = nextMartingaleStake(amount, martingaleMultiplier, consecutiveLosses);
        const rawTrade = await executeDerivTrade<ExecutedTrade>({
          symbol: result.signal.definition.symbol,
          contractType: recommendation.contractType,
          amount: tradeAmount,
          duration: durationTicks,
          durationUnit: 't',
          currency,
          barrier: recommendation.barrier,
          mode: accountMode === 'REAL' ? 'real' : 'demo',
        });
        const trade: ExecutedTrade = {
          ...normalizeExecutedTrade(rawTrade),
          marketName: result.signal.definition.name,
          mode: accountMode,
        };
        if (trade.settlementPending || trade.orderStatusUnknown) {
          pendingSettlementTrade = trade;
          totalPlaced += trade.stake ?? trade.buyPrice ?? tradeAmount;
          settledTrades.push(trade);
          setTrades((current) => [...current, trade]);
          await onTradeSettled();
          break;
        }
        const exactProfit = resolvedTradeProfit(trade);
        if (exactProfit === null) throw new Error('Deriv did not return an exact settled net profit/loss.');
        completed += 1;
        cumulativeProfit += exactProfit;
        totalPlaced += trade.stake ?? trade.buyPrice ?? tradeAmount;
        consecutiveLosses = exactProfit < 0 ? consecutiveLosses + 1 : 0;
        settledTrades.push(trade);
        setTrades((current) => [...current, trade]);
        await onTradeSettled();
        if (takeProfitLimit > 0 && cumulativeProfit >= takeProfitLimit) {
          stopReason = `Take Profit reached at ${formatSignedProfit(cumulativeProfit)} ${currency}.`;
          break;
        }
        if (stopLossLimit > 0 && cumulativeProfit <= -stopLossLimit) {
          stopReason = `Stop Loss reached at ${formatSignedProfit(cumulativeProfit)} ${currency}.`;
          break;
        }
      } catch (error) {
        firstError = error instanceof Error ? error.message : 'Live trade request failed.';
        break;
      }
    }
    floatingExecutionLockRef.current = false;
    setExecutionState('idle');
    setExecutionStatus(pendingSettlementTrade
      ? `${unresolvedTradeMessage(pendingSettlementTrade)} The bot stopped to prevent another order.`
      : firstError || stopReason || (completed ? `Completed ${completed} trade${completed === 1 ? '' : 's'}.` : 'No trade settled.'));
    if (completed > 0 || pendingSettlementTrade) setBatchResult({
      profit: cumulativeProfit,
      amount: totalPlaced,
      trades: completed + (pendingSettlementTrade ? 1 : 0),
      currency,
      settlementPending: Boolean(pendingSettlementTrade),
      orderStatusUnknown: Boolean(pendingSettlementTrade?.orderStatusUnknown),
      tradeResults: settledTrades,
    });
  };

  const scanMarkets = () => {
    if (executionState === 'executing') return;
    setScanState('scanning');
    setScanResult(null);
    setBatchResult(null);
    setTrades([]);
    setExecutionStatus('');
    window.setTimeout(() => {
      const liveVolatilitySignals = VOLATILITY_DEFINITIONS
        .map((definition) => getFloatingScanResult(definition, marketQuotes[definition.symbol]))
        .filter((result) => result.signal.quote?.price !== null && result.signal.quote?.price !== undefined);
      const allVolatilitySignals = VOLATILITY_DEFINITIONS.map((definition) => getFloatingScanResult(definition, marketQuotes[definition.symbol]));
      const rankedSignals = (liveVolatilitySignals.length ? liveVolatilitySignals : allVolatilitySignals)
        .sort((left, right) => right.bestRecommendation.probability - left.bestRecommendation.probability || right.volatilityScore - left.volatilityScore);
      const bestMarket = rankedSignals[0] ?? null;
      setScanResult(bestMarket);
      setSelectedRecommendation(bestMarket?.bestRecommendation ?? null);
      setLiveMarketCount(MARKET_DEFINITIONS.filter((definition) => marketQuotes[definition.symbol]?.status === 'live').length);
      setScanState('complete');
    }, 650);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
    movedRef.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggable || !dragRef.current) return;
    const next = clampPosition(event.clientX - dragRef.current.offsetX, event.clientY - dragRef.current.offsetY);
    if (Math.abs(next.x - position.x) > 2 || Math.abs(next.y - position.y) > 2) movedRef.current = true;
    setPosition(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const handleIconClick = () => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    setOpen(true);
    scanMarkets();
  };

  const panelLeft = Math.min(Math.max(12, position.x - 230), Math.max(12, window.innerWidth - 316));
  const panelTop = position.y > 320 ? position.y - 300 : position.y + 70;

  return (
    <>
      {open && (
        <section className="market-ai-panel" style={{ left: panelLeft, top: panelTop }} aria-label="Market AI scanner">
          <div className="market-ai-panel-header">
            <div><span className="market-ai-kicker">AI MARKET MATRIX</span><strong>Analysis Dashboard</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Market AI">×</button>
          </div>
          <div className="market-ai-matrix-head">Volatility Scanner <b>{scanState === 'complete' ? `${liveMarketCount} live markets` : 'Waiting for scan data...'}</b></div>
           <div className="market-ai-matrix-log market-ai-result-summary">
            <span>LIVE MARKETS</span><strong>{scanState === 'complete' ? liveMarketCount : '—'}</strong>
             <span>TOP RESULT</span><strong>{scanResult?.signal.definition.label ?? '—'}</strong>
          </div>
           <div className="market-ai-parameters">
             <label>STAKE<input inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
             <label>NUMBER OF TICKS<input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value.replace(/\D/g, '').slice(0, 3) || '1')} /></label>
             <label>RUNS<input inputMode="numeric" value={runCount} onChange={(event) => setRunCount(event.target.value)} /></label>
             <label>MARTINGALE ×<input inputMode="decimal" value={martingale} onChange={(event) => setMartingale(event.target.value)} /></label>
             <label>TAKE PROFIT<input inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} /></label>
             <label>STOP LOSS<input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /></label>
           </div>
           {scanResult && (
             <>
               <div className="market-ai-scan-result">
                 <div><span>BEST VOLATILITY TYPE</span><strong>{scanResult.signal.definition.name}</strong><small>{scanResult.volatilityScore}% live volatility · {scanResult.sampleSize || '—'} recent ticks</small></div>
                 <b>{scanResult.signal.lastDigit}</b>
               </div>
               <div className="market-ai-recommendations">
                 <div className="market-ai-recommendations-head"><span>DIGIT SETUPS</span><small>Select a type, then run the bot</small></div>
                 {scanResult.recommendations.map((recommendation) => (
                   <button
                     key={`${recommendation.side}-${recommendation.barrier}`}
                     type="button"
                     className={`market-ai-recommendation ${selectedRecommendation?.label === recommendation.label ? 'is-selected' : ''}`}
                     onClick={() => setSelectedRecommendation(recommendation)}
                   >
                     <span><strong>{recommendation.label}</strong><small>{recommendation.rationale}</small></span>
                     <b>{recommendation.probability.toFixed(1)}%</b>
                   </button>
                 ))}
               </div>
             </>
           )}
          <div className={`market-ai-matrix-status ${scanState === 'scanning' ? 'is-scanning' : ''}`}>
            <span>{scanState === 'complete' ? 'RESULTS READY' : scanState === 'scanning' ? 'SCANNING' : 'STANDBY'}</span>
              <strong>{executionState === 'executing' ? executionStatus : scanState === 'complete' ? executionStatus || `${selectedRecommendation?.label ?? 'Best setup'} ready. Click RUN BOT to trade.` : 'Scan live volatility first. Trading will not start automatically.'}</strong>
          </div>
           {trades.length > 0 && <TradeFigureStrip trades={trades} currency={currency} />}
            <button type="button" className={`market-ai-scan ${executionState === 'executing' ? 'is-stop' : ''}`} onClick={() => executionState === 'executing' ? void executeBestMarket(scanResult!) : scanResult ? void executeBestMarket(scanResult) : scanMarkets()} disabled={scanState === 'scanning' || !scanResult && scanState === 'complete'}>
              <Sparkles size={14} /> {scanState === 'scanning' ? 'Scanning live markets…' : executionState === 'executing' ? 'Stop after current trade' : 'RUN BOT'}
          </button>
            <span className="market-ai-note">Floating AI scans only. Review the volatility and digit type, then click RUN BOT to begin sequential trading.</span>
        </section>
      )}
      <button
        type="button"
        className={`market-ai-fab ${open ? 'is-open' : ''} ${draggable && dragRef.current ? 'is-dragging' : ''} ${draggable ? 'is-draggable' : ''}`}
        style={{ left: position.x, top: position.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleIconClick}
        aria-label="Open Market AI scanner"
        title={draggable ? 'Drag or open AI market matrix' : 'Open AI market matrix'}
      >
        <Sparkles size={21} />
        <span>AI</span>
      </button>
       <TradeResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </>
  );
}

function ManualTraderLaunchScreen() {
  return (
        <section className="manual-launch-screen" aria-label="Manual Trader loading">
      <div className="manual-launch-content">
        <div className="manual-launch-mark"><BarChart3 size={34} /></div>
        <h1>DTRADER</h1>
        <p>Clean entries beat busy charts.</p>
      </div>
    </section>
  );
}

function Home() {
  const { isLoaded, isSignedIn, startupError, retrySession } = useAppAuth();
  const [startupRecoveryVisible, setStartupRecoveryVisible] = useState(false);
  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]');
    if (!robots) return;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    robots.setAttribute('content', isSignedIn || path !== '/' ? 'noindex, nofollow, noarchive' : 'index, follow');
  }, [isSignedIn]);
  useEffect(() => {
    if (isLoaded) {
      setStartupRecoveryVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setStartupRecoveryVisible(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);
  if (isLoaded && isSignedIn) return <AuthenticatedHome />;
  const recoveryMessage = !isLoaded && !startupRecoveryVisible
    ? null
    : startupError ?? (startupRecoveryVisible
      ? 'Workspace startup did not finish. Retry the account check or reconnect your Deriv account.'
      : null);
  return (
    <PublicLandingShell
      startupError={recoveryMessage}
      onRetry={startupRecoveryVisible ? () => window.location.reload() : retrySession}
    />
  );
}

function AuthenticatedHome() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn, user, activeMode, balance, currency, refreshAccount, switchMode } = useAppAuth();
  const ownerAccessQuery = useGetOwnerAccess({
    query: {
      queryKey: getGetOwnerAccessQueryKey(),
      enabled: isLoaded && isSignedIn,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  });
  const [activeMarket, setActiveMarket] = useState(DEFAULT_MARKET_LABEL);
  const [accountMode, setAccountMode] = useState<'DEMO' | 'REAL'>(activeMode === 'real' ? 'REAL' : 'DEMO');
  const { displayCurrency, selectCurrency, automatic: automaticCurrency } = useDisplayCurrencyPreference();
  const [direction, setDirection] = useState<'RISE' | 'FALL'>('RISE');
  const [contractType, setContractType] = useState<'RISE/FALL' | 'OVER/UNDER' | 'ODD/EVEN'>('RISE/FALL');
  const [contractSide, setContractSide] = useState<'RISE' | 'FALL' | 'OVER' | 'UNDER' | 'ODD' | 'EVEN'>('RISE');
  const [manualContractMenuOpen, setManualContractMenuOpen] = useState(false);
  const [manualQuotesBySide, setManualQuotesBySide] = useState<Partial<Record<ManualContractSide, DerivProposalQuote>>>({});
  const [manualQuoteErrorsBySide, setManualQuoteErrorsBySide] = useState<Partial<Record<ManualContractSide, string>>>({});
  const [manualQuoteState, setManualQuoteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [manualQuoteError, setManualQuoteError] = useState('');
  const [stake, setStake] = useState('10');
  const [manualEntries, setManualEntries] = useState('1');
  const [manualEntriesExecuting, setManualEntriesExecuting] = useState(false);
  const [numberOfTicks, setNumberOfTicks] = useState('1');
  const [manualBarrier, setManualBarrier] = useState('4');
  const [reviewState, setReviewState] = useState('');
  const [manualTradeResult, setManualTradeResult] = useState<BatchResult | null>(null);
  const [manualHistoryByAccount, setManualHistoryByAccount] = useState<Record<string, ExecutedTrade[]>>({});
  const [manualTransactionTab, setManualTransactionTab] = useState<BotTransactionTab>('Transactions');
  const manualHistoryKey = `${accountMode}:${currency}`;
  const manualTradeHistory = manualHistoryByAccount[manualHistoryKey] ?? [];
  const [freeBotToOpen, setFreeBotToOpen] = useState<'diagnosis' | 'recovery' | 'scanner1' | 'scanner2' | null>(null);
  const [manualTraderLoading, setManualTraderLoading] = useState(true);
  const manualExecutionLockRef = useRef(false);
  const manualStopRequestedRef = useRef(false);
  const [activeTool, setActiveTool] = useWorkspaceNavigation();
  const terminalMainRef = useRef<HTMLElement>(null);
  const terminalNavigationRef = useRef<HTMLDivElement>(null);
  const openTool = (tool: string, botId?: 'diagnosis' | 'recovery' | 'scanner1' | 'scanner2') => {
    setFreeBotToOpen(tool === 'Free Bots' ? botId ?? null : null);
    setActiveTool(tool);
  };
  useEffect(() => {
    terminalMainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    terminalNavigationRef.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTool]);
  useEffect(() => {
    setAccountMode(activeMode === 'real' ? 'REAL' : 'DEMO');
  }, [activeMode]);
  useEffect(() => {
    if (!isSignedIn) {
      setManualHistoryByAccount({});
      setManualTradeResult(null);
    }
  }, [isSignedIn]);
  useEffect(() => {
    if (activeTool !== 'Manual Trader') {
      setManualTraderLoading(false);
      return;
    }
    setManualTraderLoading(true);
    const timer = window.setTimeout(() => setManualTraderLoading(false), 850);
    return () => window.clearTimeout(timer);
  }, [activeTool]);
  const marketQuotes = usePublicMarketBoard();
  const usdKesRateState = useUsdKesRate();
  const usdKesRate = usdKesRateState.rates;
  const displayBalance = balance === null
    ? '—'
    : formatMoneyForDisplay(balance, currency, displayCurrency, usdKesRate);
  const canConvertBalance = true;
  const alternateBalance = balance !== null && convertCurrency(balance, currency, displayCurrency, usdKesRate) !== null
    ? formatMoneyForDisplay(balance, currency, displayCurrency, usdKesRate)
    : null;
  const activeDefinition = getMarketDefinition(activeMarket);
  const activeQuote = marketQuotes[activeDefinition.symbol];
  const digitDistribution = useMemo(() => getDigitDistribution(activeQuote), [activeQuote]);
  const chart = useMemo(() => {
    const pipSize = activeQuote?.pipSize ?? 2;
    const values = (activeQuote?.ticks.length ? activeQuote.ticks : activeQuote?.price === null ? [] : [activeQuote.price])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .slice(-100);
    if (!values.length) {
      return {
        path: '',
        fill: '',
        labels: ['—', '—', '—', '—', '—'],
        tickLabels: ['Waiting for ticks', '', ''],
        trend: 'WAITING FOR TICKS',
        direction: 'flat' as const,
        delta: 0,
        sampleSize: 0,
        plotTop: 36,
        plotBottom: 380,
        lastPoint: null,
      };
    }
    const observedMin = Math.min(...values);
    const observedMax = Math.max(...values);
    const tickSize = 10 ** -pipSize;
    const scaleFactor = 10 ** pipSize;
    const midpoint = (observedMin + observedMax) / 2;
    const minimumRange = tickSize * 8;
    const targetRange = Math.max((observedMax - observedMin) * 1.2, minimumRange);
    const min = Math.floor((midpoint - targetRange / 2) * scaleFactor) / scaleFactor;
    let max = Math.ceil((midpoint + targetRange / 2) * scaleFactor) / scaleFactor;
    if (max - min < minimumRange) max = min + minimumRange;
    const range = max - min;
    const plotTop = 36;
    const plotBottom = 380;
    const plotHeight = plotBottom - plotTop;
    const path = values.map((value, index) => {
      const x = values.length === 1 ? 920 : (index / (values.length - 1)) * 920;
      const y = plotTop + ((max - value) / range) * plotHeight;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const delta = lastValue - firstValue;
    const direction = delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'flat' as const;
    const lastX = 920;
    const lastY = plotTop + ((max - lastValue) / range) * plotHeight;
    const labels = Array.from({ length: 5 }, (_, index) => formatMarketPrice(max - range * (index / 4), pipSize));
    const displayedTicks = values.length - 1;
    const middleTicks = Math.round(displayedTicks / 2);
    const tickLabels = displayedTicks > 0
      ? [`${displayedTicks} ticks ago`, `${middleTicks} ticks ago`, 'Latest tick']
      : ['No prior ticks', '', 'Latest quote'];
    return {
      path,
      fill: `${path} L 920 ${plotBottom} L 0 ${plotBottom} Z`,
      labels,
      tickLabels,
      trend: values.length < 2 ? 'WAITING FOR TICK' : delta > 0 ? 'RISING' : delta < 0 ? 'FALLING' : 'FLAT',
      direction,
      delta,
      sampleSize: values.length,
      plotTop,
      plotBottom,
      lastPoint: { x: lastX, y: lastY, bottom: plotBottom },
    };
  }, [activeQuote]);
  const manualContractName = contractType === 'RISE/FALL' ? 'Rise/Fall' : contractType === 'OVER/UNDER' ? 'Over/Under' : 'Even/Odd';
  const latestDigit = digitDistribution.recentDigits.at(-1) ?? null;
  const latestManualTrade = manualTradeHistory.at(-1) ?? null;
  const latestManualStake = latestManualTrade
    ? finiteNumber(latestManualTrade.stake) ?? finiteNumber(latestManualTrade.buyPrice)
    : null;
  const manualEntryCount = Number(manualEntries);
  const manualEntryCountValid = Number.isInteger(manualEntryCount) && manualEntryCount >= 1 && manualEntryCount <= 100;
  const manualEntryStake = finiteNumber(stake);
  const manualEntryStakeValid = manualEntryStake !== null && manualEntryStake >= 0.35 && manualEntryStake <= 10_000;
  const manualTotalStake = manualEntryCountValid && manualEntryStakeValid
    ? manualEntryStake * manualEntryCount
    : null;
  const latestManualContractLabel = latestManualTrade
    ? tradeContractLabel(latestManualTrade)
    : 'No settled trades yet';
  const isManualTradeExecuting = manualEntriesExecuting || reviewState.startsWith('Executing ');
  const manualContractMarketSupported = contractType === 'RISE/FALL' || activeDefinition.family === 'volatility';
  const quoteAccountModeReady = (activeMode === 'real' ? 'REAL' : 'DEMO') === accountMode;
  const manualContractOptions: Array<{ type: ManualContractType; side: ManualContractSide; label: string; description: string }> = [
    { type: 'RISE/FALL', side: 'RISE', label: 'Rise / Fall', description: 'Trade price direction' },
    { type: 'OVER/UNDER', side: 'OVER', label: 'Over / Under', description: 'Compare digit to barrier' },
    { type: 'ODD/EVEN', side: 'EVEN', label: 'Even / Odd', description: 'Trade last-digit parity' },
  ];
  const manualSideBarrierError = (side: ManualContractSide) => {
    const proposalContractType = mapManualContractToDeriv(contractType, side);
    return proposalContractType
      ? getDerivBarrierError(
          proposalContractType,
          contractType === 'OVER/UNDER' ? Number.parseInt(manualBarrier, 10) : undefined,
        )
      : null;
  };
  useEffect(() => {
    setManualQuotesBySide({});
    setManualQuoteErrorsBySide({});
    setManualQuoteError('');
    if (!isSignedIn || !manualContractMarketSupported || !quoteAccountModeReady) {
      setManualQuoteState('idle');
      return;
    }
    const amount = Number(stake);
    if (!Number.isFinite(amount) || amount < 0.35 || amount > 10_000) {
      setManualQuoteState('idle');
      return;
    }
    const duration = Math.max(1, Math.min(365, Number.parseInt(numberOfTicks, 10) || 1));
    const sides: ManualContractSide[] = contractType === 'RISE/FALL'
      ? ['RISE', 'FALL']
      : contractType === 'OVER/UNDER'
        ? ['OVER', 'UNDER']
        : ['EVEN', 'ODD'];
    const controller = new AbortController();
    let current = true;
    setManualQuoteState('loading');
    const timer = window.setTimeout(async () => {
      const results = await Promise.all(sides.map(async (side) => {
        const proposalContractType = mapManualContractToDeriv(contractType, side);
        if (!proposalContractType) return { side, quote: null, error: 'Choose a side that matches the selected contract.' };
        const barrier = contractType === 'OVER/UNDER' ? Number.parseInt(manualBarrier, 10) : undefined;
        const barrierError = getDerivBarrierError(proposalContractType, barrier);
        if (barrierError) return { side, quote: null, error: barrierError };
        try {
          const quote = await requestDerivProposal({
            symbol: activeDefinition.symbol,
            contractType: proposalContractType,
            amount,
            duration,
            durationUnit: 't',
            currency,
            mode: accountMode === 'REAL' ? 'real' : 'demo',
            barrier,
          }, controller.signal);
          return { side, quote, error: '' };
        } catch (error) {
          return { side, quote: null, error: error instanceof Error ? error.message : 'Deriv could not return a proposal quote.' };
        }
      }));
      if (!current) return;
      const availableQuotes = Object.fromEntries(
        results.filter((result) => result.quote).map((result) => [result.side, result.quote]),
      ) as Partial<Record<ManualContractSide, DerivProposalQuote>>;
      const sideErrors = Object.fromEntries(
        results.filter((result) => result.error).map((result) => [result.side, result.error]),
      ) as Partial<Record<ManualContractSide, string>>;
      setManualQuotesBySide(availableQuotes);
      setManualQuoteErrorsBySide(sideErrors);
      const firstError = results.find((result) => result.error)?.error ?? '';
      setManualQuoteError(Object.keys(availableQuotes).length ? '' : firstError);
      setManualQuoteState(Object.keys(availableQuotes).length ? 'ready' : 'error');
    }, 450);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accountMode, activeDefinition.symbol, activeMode, contractType, currency, isSignedIn, manualBarrier, manualContractMarketSupported, numberOfTicks, quoteAccountModeReady, stake]);
  const manualPayoutLabel = (side: ManualContractSide) => {
    const sideError = manualQuoteErrorsBySide[side];
    if (sideError) return 'Payout quote unavailable';
    const quote = manualQuotesBySide[side];
    if (quote?.payout !== null && quote?.payout !== undefined) {
      return `Potential payout ${quote.currency ?? currency} ${quote.payout.toFixed(2)}`;
    }
    if (!manualContractMarketSupported) return 'Select a Volatility market';
    if (manualQuoteState === 'loading') return 'Updating Deriv quote…';
    if (manualQuoteError) return 'Payout quote unavailable';
    return 'Enter a valid stake for a quote';
  };
  const navItems = [
    { label: 'Dashboard', icon: Gauge },
    ...(ownerAccessQuery.data?.isOwner === true ? [{ label: 'Owner Activity', icon: ShieldCheck }] : []),
    { label: 'Bot Builder', icon: Bot },
    { label: 'Volt AI', icon: Sparkles },
    { label: 'Auto AI', icon: Sparkles },
    { label: 'Free Bots', icon: Bot },
    { label: 'Deriv Pro Bots', icon: Flame },
    { label: 'Quick Bot', icon: Zap },
    { label: 'Signal AI', icon: BarChart3 },
    { label: 'Manual Trader', icon: LineChart },
    { label: 'Bulk Trader', icon: Layers3 },
    { label: 'Apex Bot', icon: Flame },
    { label: 'Copy Trader', icon: Copy },
    { label: 'Analysis Tools', icon: Search },
  ];

  async function executeManualTrade(
    action: 'BUY' | 'SELL',
    requestedSide?: ManualContractSide,
    marketOverride?: MarketDefinition,
    tradeSetup?: DcircleTradeSetup,
    requestedEntryCount: string | number = 1,
  ): Promise<boolean> {
    if (manualExecutionLockRef.current) return false;
    const selectedContractType = tradeSetup?.contractType ?? contractType;
    const configuredSide = tradeSetup?.side ?? contractSide;
    if (action === 'SELL' && selectedContractType !== 'RISE/FALL') {
      setReviewState('Buy/Sell execution is only available for Rise/Fall contracts.');
      return false;
    }
    const oppositeSide = selectedContractType === 'RISE/FALL'
      ? configuredSide === 'RISE' ? 'FALL' : 'RISE'
      : selectedContractType === 'OVER/UNDER'
        ? configuredSide === 'OVER' ? 'UNDER' : 'OVER'
        : configuredSide === 'EVEN' ? 'ODD' : 'EVEN';
    const selectedSide = action === 'BUY' ? requestedSide ?? configuredSide : oppositeSide;
    const proposalContractType = mapManualContractToDeriv(selectedContractType, selectedSide);
    if (!proposalContractType) {
      setReviewState(`Choose a side that matches the ${selectedContractType} contract.`);
      return false;
    }
    const amount = Number(tradeSetup?.stake ?? stake);
    const durationTicks = Math.max(1, Number.parseInt(tradeSetup?.durationTicks ?? numberOfTicks, 10) || 1);
    const entryCount = Number(requestedEntryCount);
    if (!Number.isInteger(entryCount) || entryCount < 1 || entryCount > 100) {
      setReviewState('Choose a whole number of runs from 1 to 100.');
      return false;
    }
    const barrier = selectedContractType === 'OVER/UNDER'
      ? Number.parseInt(tradeSetup?.barrier ?? manualBarrier, 10)
      : undefined;
    const barrierError = getDerivBarrierError(proposalContractType, barrier);
    if (barrierError) {
      setReviewState(`${barrierError} No trade was sent.`);
      return false;
    }
    const tradeDefinition = marketOverride ?? activeDefinition;
    if (selectedContractType !== 'RISE/FALL' && tradeDefinition.family !== 'volatility') {
      setReviewState('Over/Under and Even/Odd contracts require a Volatility market. Select one before trading.');
      return false;
    }
    if (!Number.isFinite(amount) || amount < 0.35 || amount > 10_000) {
      setReviewState(`Enter a stake from ${currency} 0.35 to 10,000.`);
      return false;
    }
    const tradeMode = accountMode;
    const tradeCurrency = currency;
    const selectedEntry: DerivExecutionInput = {
      symbol: tradeDefinition.symbol,
      contractType: proposalContractType,
      amount,
      duration: durationTicks,
      durationUnit: 't',
      currency: tradeCurrency,
      barrier,
      mode: tradeMode === 'REAL' ? 'real' : 'demo',
    };
    setManualTradeResult(null);
    const executionLabel = selectedContractType === 'RISE/FALL' ? `${action} ` : '';
    const contractLabel = formatDerivContractType(proposalContractType, barrier);
    manualExecutionLockRef.current = true;
    manualStopRequestedRef.current = false;
    setManualEntriesExecuting(true);
    setReviewState(`Run 1/${entryCount} · ${executionLabel}${contractLabel} on ${tradeDefinition.name} in ${tradeMode} mode…`);

    let totalProfit = 0;
    let settledRuns = 0;
    let totalStake = 0;
    let firstError = '';
    let unknownOrderTrade: ExecutedTrade | null = null;
    let stoppedByUser = false;
    const placedTrades: ExecutedTrade[] = [];
    try {
      for (let index = 0; index < entryCount; index += 1) {
        if (manualStopRequestedRef.current) {
          stoppedByUser = true;
          break;
        }
        setReviewState(`Run ${index + 1}/${entryCount} · same ${executionLabel}${contractLabel} · ${tradeDefinition.name} · ${tradeMode}…`);
        try {
          const rawTrade = await executeDerivTrade<ExecutedTrade>(selectedEntry);
          let executedTrade: ExecutedTrade = {
            ...normalizeExecutedTrade(rawTrade),
            marketName: tradeDefinition.name,
            mode: tradeMode,
          };
          const batchDecision = manualEntryBatchDecision(executedTrade);
          const exactProfit = resolvedTradeProfit(executedTrade);
          if (!executedTrade.orderStatusUnknown && !executedTrade.settlementPending && exactProfit === null) {
            executedTrade = { ...executedTrade, settlementPending: true };
          }
          if (batchDecision === 'stop-unknown' && !executedTrade.orderStatusUnknown) {
            executedTrade = { ...executedTrade, orderStatusUnknown: true, settlementPending: true };
          }
          placedTrades.push(executedTrade);
          if (!executedTrade.orderStatusUnknown) {
            totalStake += finiteNumber(executedTrade.buyPrice) ?? finiteNumber(executedTrade.stake) ?? amount;
          }
          const historyKey = `${tradeMode}:${executedTrade.currency ?? tradeCurrency}`;
          setManualHistoryByAccount((current) => ({
            ...current,
            [historyKey]: [...(current[historyKey] ?? []), executedTrade],
          }));
          setManualTransactionTab('Transactions');
          if (batchDecision === 'stop-unknown') {
            unknownOrderTrade = executedTrade;
            break;
          }
          totalProfit += exactProfit ?? 0;
          if (exactProfit !== null) settledRuns += 1;
        } catch (error) {
          firstError = error instanceof Error ? error.message : 'Unable to execute the Deriv contract.';
          break;
        }
      }
    } finally {
      manualExecutionLockRef.current = false;
      setManualEntriesExecuting(false);
    }

    if (placedTrades.length > 0) {
      const pendingSettlementCount = placedTrades.filter((trade) => (
        trade.settlementPending && !trade.orderStatusUnknown
      )).length;
      const settledProfitLabel = settledRuns > 0
        ? `${formatSignedProfit(totalProfit)} settled P/L ${tradeCurrency}`
        : 'no results settled yet';
      setManualTradeResult({
        profit: totalProfit,
        amount: totalStake,
        trades: placedTrades.length,
        currency: tradeCurrency,
        settlementPending: placedTrades.some((trade) => trade.settlementPending),
        orderStatusUnknown: placedTrades.some((trade) => trade.orderStatusUnknown),
        tradeResults: placedTrades,
      });
      if (unknownOrderTrade) {
        setReviewState(`${unresolvedTradeMessage(unknownOrderTrade)} Remaining runs stopped to avoid a duplicate order.`);
      } else if (firstError) {
        setReviewState(`${placedTrades.length}/${entryCount} same-selection runs placed before stopping: ${firstError}${pendingSettlementCount ? ` · ${pendingSettlementCount} result${pendingSettlementCount === 1 ? '' : 's'} pending` : ''} · ${settledProfitLabel}`);
      } else if (stoppedByUser) {
        setReviewState(`Stopped after ${placedTrades.length}/${entryCount} same-selection runs · ${pendingSettlementCount ? `${pendingSettlementCount} result${pendingSettlementCount === 1 ? '' : 's'} pending · ` : ''}${settledProfitLabel}`);
      } else if (pendingSettlementCount > 0) {
        setReviewState(`${placedTrades.length}/${entryCount} same-selection runs placed · ${pendingSettlementCount} result${pendingSettlementCount === 1 ? '' : 's'} pending · ${settledProfitLabel}`);
      } else {
        setReviewState(`${placedTrades.length}/${entryCount} same-selection runs settled · ${settledProfitLabel}`);
      }
      void Promise.resolve().then(() => refreshAccount()).catch(() => undefined);
      return true;
    }
    setReviewState(firstError || (stoppedByUser ? 'Stopped before placing an entry.' : 'No manual entries were placed.'));
    return false;
  }

  async function handleAccountMode(nextMode: 'DEMO' | 'REAL') {
    if (manualExecutionLockRef.current) {
      setReviewState('Wait for the current manual batch to finish before switching accounts.');
      return;
    }
    setAccountMode(nextMode);
    try {
      await switchMode(nextMode.toLowerCase() as 'demo' | 'real');
    } catch (error) {
      setAccountMode(accountMode);
      setReviewState(error instanceof Error ? error.message : `Unable to switch to ${nextMode} mode.`);
    }
  }

  function openManualHistoryDetail() {
    if (!manualTradeHistory.length) return;
    const profit = totalTradeProfit(manualTradeHistory);
    if (profit === null) return;
    setManualTradeResult({
      profit,
      amount: manualTradeHistory.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0),
      trades: manualTradeHistory.length,
      currency,
      tradeResults: manualTradeHistory,
    });
  }

  return (
    <CurrencyDisplayContext.Provider value={{
      displayCurrency,
      rate: usdKesRate,
      toggleDisplayCurrency: () => selectCurrency(displayCurrency === 'USD' ? 'KES' : 'USD'),
    }}>
    <div className={`terminal-shell ${activeTool === 'Manual Trader' ? 'is-manual-mode' : ''} ${activeTool === 'Manual Trader' && manualTraderLoading ? 'is-manual-loading' : ''} ${activeTool === 'Dashboard' ? 'is-dashboard-mode' : ''} ${['Bot Builder', 'Free Bots', 'Deriv Pro Bots', 'Bulk Trader', 'Quick Bot', 'Analysis Tools', 'Volt AI', 'Auto AI', 'Signal AI', 'Apex Bot', 'Copy Trader'].includes(activeTool) ? 'is-reference-mode' : ''}`}>
      <header className="terminal-header">
        <a href={basePath || '/'} className="terminal-brand" aria-label="ProTraders FX home">
          <span className="terminal-brand-mark"><BarChart3 size={17} /></span>
          <span><strong>PROTRADERS FX</strong><small>POWERED BY DERIV</small></span>
        </a>
        <div className="terminal-header-actions">
          <LanguageSelector />
          <a href={`${basePath}/account`} className="terminal-header-link"><FileText size={13} /> {t('Reports')}</a>
          <div className="account-switcher">
            <button type="button" className={accountMode === 'DEMO' ? 'is-selected' : ''} onClick={() => void handleAccountMode('DEMO')}>DEMO</button>
            <button type="button" className={accountMode === 'REAL' ? 'is-selected' : ''} onClick={() => void handleAccountMode('REAL')}>REAL</button>
          </div>
          <div className="terminal-balance">
            <CircleDollarSign size={15} />
            <div className="terminal-balance-copy">
              <div className="terminal-balance-primary">
                <strong>{displayBalance}</strong>
                <CurrencyConverter
                  automatic={automaticCurrency}
                  rates={usdKesRate}
                  source={usdKesRateState.source}
                  checkedAt={usdKesRateState.checkedAt}
                  updatedAt={usdKesRateState.updatedAt}
                  loading={usdKesRateState.loading}
                  stale={usdKesRateState.stale}
                  onRefresh={usdKesRateState.refresh}
                  displayCurrency={displayCurrency}
                  onSelectCurrency={selectCurrency}
                />
              </div>
              {canConvertBalance && (
                <small
                  className={`terminal-balance-kes ${alternateBalance === null ? 'is-unavailable' : ''}`}
                  data-testid="usd-kes-balance-equivalent"
                  title={`Daily display estimate. Your Deriv account and trade currency remain ${currency}.`}
                >
                  {alternateBalance === null
                    ? usdKesRateState.loading ? 'Loading exchange rate…' : 'Rate unavailable · open calculator to retry'
                    : usdKesRateState.stale ? `≈ ${alternateBalance} · saved estimate` : `≈ ${alternateBalance} · display only`}
                </small>
              )}
            </div>
            <ChevronDown size={13} />
          </div>
          <a href={`${basePath}/account`} className="account-button">{t('Account')}</a>
          <a href={DERIV_REFERRAL_URL} target="_blank" rel="noopener noreferrer" className="get-started">{t('Get Started')}</a>
        </div>
      </header>

      <nav className="terminal-nav" aria-label="Trading products" role="tablist" aria-orientation="horizontal">
        <div ref={terminalNavigationRef} className="terminal-nav-scroll" tabIndex={0} aria-label="Scrollable trading tools">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} type="button" role="tab" aria-selected={activeTool === label} className={`terminal-nav-item ${activeTool === label ? 'is-active' : ''}`} onClick={() => { setFreeBotToOpen(null); setActiveTool(label); }}>
              <Icon size={13} /> <span>{t(label)}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="market-strip" aria-label="Markets">
        <div className="market-live"><i /> LIVE</div>
        {MARKET_DEFINITIONS.map(({ label, symbol }) => {
          const quote = marketQuotes[symbol];
          return (
          <button key={label} type="button" className={`market-tab ${activeMarket === label ? 'is-active' : ''} ${quote?.status === 'live' ? 'is-live' : ''}`} onClick={() => setActiveMarket(label)}>
            <span>{label}</span><small className={`market-price ${quoteTone(quote)}`}>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)} <b>{quoteLastDigit(quote)}</b></small>
          </button>
          );
        })}
      </div>

      <DcircleTradeContext.Provider value={{
        activeMarket,
        setActiveMarket,
        accountMode,
        currency,
        defaultSetup: { contractType, side: contractSide, stake, durationTicks: numberOfTicks, barrier: manualBarrier },
        tradeStatus: reviewState,
        onTradeMarket: (definition, setup) => executeManualTrade('BUY', setup.side, definition, setup),
      }}>
      <main ref={terminalMainRef} id="trading-workspace-panel" className={`terminal-main ${activeTool === 'Manual Trader' ? 'manual-main' : ''}`} role="tabpanel" tabIndex={0} aria-label={`${activeTool} workspace`}>
        {activeTool === 'Dashboard' ? <DashboardView accountMode={accountMode} marketQuotes={marketQuotes} isOwner={ownerAccessQuery.data?.isOwner === true} onNavigate={setActiveTool} /> : activeTool === 'Owner Activity' ? <OwnerActivityView /> : activeTool === 'Quick Bot' ? <QuickBotView accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} marketQuotes={marketQuotes} onNavigate={openTool} onTradeSettled={refreshAccount} /> : activeTool === 'Bulk Trader' ? <BulkTraderView accountMode={accountMode} currency={currency} activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketQuotes={marketQuotes} onTradeSettled={refreshAccount} /> : activeTool === 'Analysis Tools' ? <AnalysisToolsView marketQuotes={marketQuotes} /> : activeTool === 'Volt AI' ? <VoltAiView activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketQuotes={marketQuotes} onNavigate={setActiveTool} /> : activeTool === 'Auto AI' ? <AutoAiView activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketQuotes={marketQuotes} onNavigate={setActiveTool} /> : activeTool === 'Signal AI' ? <SignalAiView activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketQuotes={marketQuotes} onNavigate={setActiveTool} /> : activeTool === 'Apex Bot' ? <ApexBotView activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketQuotes={marketQuotes} /> : activeTool === 'Copy Trader' ? <CopyTraderView activeMarket={activeMarket} marketQuotes={marketQuotes} currency={currency} /> : activeTool === 'Free Bots' ? <FreeBotsView accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} marketQuotes={marketQuotes} onTradeSettled={refreshAccount} initialBotId={freeBotToOpen} /> : activeTool === 'Bot Builder' ? <RecoveryBotView accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} marketQuotes={marketQuotes} onTradeSettled={refreshAccount} /> : activeTool === 'Deriv Pro Bots' ? <DerivProBotsView accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} setActiveMarket={setActiveMarket} marketDefinitions={MARKET_DEFINITIONS} marketQuotes={marketQuotes} supportPhoneDisplay={SUPPORT_PHONE_DISPLAY} onTradeSettled={refreshAccount} /> : activeTool === 'Manual Trader' ? (
        manualTraderLoading ? <ManualTraderLaunchScreen /> : <>
        <div className="terminal-heading">
          <div>
             <h1>Manual Trader</h1>
          </div>
          <span className="mode-badge">{accountMode} MODE</span>
        </div>

        <div className="trading-workspace">
           <div className="manual-left-column">
           <section className="chart-card" aria-label="Market chart">
            <div className="chart-card-header">
              <div className="manual-market-picker">
                 <span className="chart-label">MARKET</span>
                <select value={activeMarket} onChange={(event) => setActiveMarket(event.target.value)} aria-label="Select market">
                  <optgroup label="Forex">
                    {MARKET_DEFINITIONS.filter(({ family }) => family === 'fx').map(({ label, name }) => <option key={label} value={label}>{name}</option>)}
                  </optgroup>
                  <optgroup label="Volatility">
                    {MARKET_DEFINITIONS.filter(({ family }) => family === 'volatility').map(({ label, name }) => <option key={label} value={label}>{name}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="chart-tools">
                <button type="button" aria-label="Previous market"><ChevronLeft size={15} /></button>
                <span className={`chart-status status-${activeQuote?.status ?? 'connecting'} quote-${quoteTone(activeQuote)}`}><i /> {activeQuote?.status === 'live' ? 'Live feed' : activeQuote?.status === 'error' ? 'Reconnecting' : 'Last quote'}</span>
                <button type="button" aria-label="Chart settings"><Settings2 size={15} /></button>
              </div>
            </div>
            <div className="chart-stage">
              <span className="chart-window-badge" data-testid="text-chart-window">
                 {chart.sampleSize ? `${chart.sampleSize} TICKS` : 'WAITING'}
              </span>
              <div className="chart-y-labels">{chart.labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
              <svg
                viewBox="0 0 920 420"
                preserveAspectRatio="none"
                className="market-chart"
                role="img"
                data-testid="chart-live-price"
                aria-label={`${activeDefinition.name} live price trace from ${chart.sampleSize} consecutive Deriv ticks; latest price ${formatMarketPrice(activeQuote?.price ?? null, activeQuote?.pipSize ?? 2)}`}
              >
                <defs>
                   <linearGradient id="manual-chart-fill" x1="0" x2="0" y1="0" y2="1">
                     <stop offset="0%" stopColor={chart.direction === 'down' ? '#db5f7c' : chart.direction === 'flat' ? '#7657cf' : '#3978f5'} stopOpacity=".22" />
                     <stop offset="100%" stopColor={chart.direction === 'down' ? '#db5f7c' : chart.direction === 'flat' ? '#7657cf' : '#3978f5'} stopOpacity="0" />
                  </linearGradient>
                </defs>
                 <g className="chart-grid-lines" aria-hidden="true">
                   {Array.from({ length: 5 }, (_, index) => {
                     const y = chart.plotTop + ((chart.plotBottom - chart.plotTop) * index) / 4;
                     return <line key={`horizontal-${index}`} x1="0" y1={y} x2="920" y2={y} />;
                   })}
                   {Array.from({ length: 6 }, (_, index) => {
                     const x = (920 * index) / 5;
                     return <line key={`vertical-${index}`} x1={x} y1={chart.plotTop} x2={x} y2={chart.plotBottom} />;
                   })}
                 </g>
                 {chart.fill && <path className="chart-area-fill" d={chart.fill} fill="url(#manual-chart-fill)" />}
                 {chart.lastPoint && (
                   <line
                     className="chart-price-guide"
                     x1="0"
                     y1={chart.lastPoint.y}
                     x2="920"
                     y2={chart.lastPoint.y}
                   />
                 )}
                 {chart.path && (
                   <path
                     className={`market-chart-line is-${chart.direction}`}
                     d={chart.path}
                     fill="none"
                     stroke={chart.direction === 'down' ? '#db5f7c' : '#3978f5'}
                     strokeWidth="2.6"
                     strokeLinecap="round"
                     strokeLinejoin="round"
                   />
                 )}
                  {chart.lastPoint && (
                    <g className={`chart-live-cursor is-${chart.direction}`} aria-label="Latest price cursor">
                      <line x1={chart.lastPoint.x} y1={chart.lastPoint.y} x2={chart.lastPoint.x} y2={chart.lastPoint.bottom} />
                       <polygon
                         className="chart-cursor-arrow"
                         points={`${chart.lastPoint.x - 28},${chart.lastPoint.y - 16} ${chart.lastPoint.x},${chart.lastPoint.y} ${chart.lastPoint.x - 28},${chart.lastPoint.y + 16}`}
                         data-testid="chart-current-arrow"
                       />
                       <circle cx={chart.lastPoint.x} cy={chart.lastPoint.y} r="10" />
                       <circle cx={chart.lastPoint.x} cy={chart.lastPoint.y} r="4.5" />
                    </g>
                  )}
              </svg>
              {chart.lastPoint && activeQuote?.price !== null && activeQuote?.price !== undefined && (
                <div
                  className={`chart-price-tag is-${chart.direction}`}
                  style={{
                    top: `calc(${(chart.lastPoint.y / 420) * 100}% ${22 - (48 * chart.lastPoint.y / 420) < 0 ? '-' : '+'} ${Math.abs(22 - (48 * chart.lastPoint.y / 420))}px)`,
                  }}
                  data-testid="text-chart-live-price"
                >
                  <small>LAST</small>
                  <strong>{formatMarketPrice(activeQuote.price, activeQuote.pipSize)}</strong>
                </div>
              )}
              {!chart.path && <div className="chart-empty-state">{activeQuote?.status === 'error' ? 'RECONNECTING TO MARKET' : 'WAITING FOR PRICE FEED'}</div>}
              <div className="chart-time-labels" aria-label="Tick order, oldest to newest">
                {chart.tickLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
               <button type="button" className="manual-chart-ai-button" onClick={() => window.dispatchEvent(new Event('market-ai-open'))} aria-label="Open floating AI scanner">
                 <Sparkles size={15} /><span>AI</span>
               </button>
              <div className="chart-rail" aria-label="Chart tools">
                <button type="button" aria-label="Chart type"><LineChart size={15} /></button>
                <button type="button" aria-label="Indicators"><BarChart3 size={15} /></button>
                <button type="button" aria-label="Drawing tools"><Settings2 size={15} /></button>
              </div>
            </div>
            <div className="chart-footer">
               <span><i className={activeQuote?.status === 'live' ? 'positive-dot' : 'status-dot-muted'} /> {activeQuote?.status === 'live' ? 'Live' : 'Last quote'}</span>
               <span>{chart.sampleSize} ticks</span>
              <span className={`chart-move is-${chart.direction}`} data-testid="text-chart-direction">
                 {chart.trend}{chart.sampleSize > 1 ? ` · ${chart.delta > 0 ? '+' : chart.delta < 0 ? '−' : ''}${formatMarketPrice(Math.abs(chart.delta), activeQuote?.pipSize ?? 2)}` : ''}
              </span>
            </div>
           </section>
            </div>

            <form className="trade-ticket manual-trade-ticket" onSubmit={(event) => event.preventDefault()}>
              <div className="trade-ticket-header manual-ticket-header">
                <div className="manual-ticket-title">
                   <span className="chart-label">TYPE</span>
                  <button
                    type="button"
                    className="manual-contract-trigger"
                    aria-expanded={manualContractMenuOpen}
                    aria-haspopup="listbox"
                    disabled={isManualTradeExecuting}
                    onClick={() => setManualContractMenuOpen((open) => !open)}
                  >
                    <span className="manual-contract-icon"><LineChart size={16} /></span>
                    <strong>{manualContractName}</strong>
                    <ChevronDown size={16} />
                  </button>
                </div>
                <span className="ticket-mode">{accountMode}</span>
                {manualContractMenuOpen && (
                  <div className="manual-contract-menu" role="listbox" aria-label="Choose a contract type">
                    {manualContractOptions.map((option) => (
                      <button
                        type="button"
                        key={option.type}
                        role="option"
                        aria-selected={contractType === option.type}
                        className={contractType === option.type ? 'is-selected' : ''}
                        onClick={() => {
                          setContractType(option.type);
                          setContractSide(option.side);
                          setManualContractMenuOpen(false);
                        }}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <section className="manual-digit-panel manual-ticket-digit-panel" aria-label="Live digit distribution">
                <header className="manual-digit-panel-header">
                  <div>
                    <span className="chart-label">DIGITS</span>
                    <strong>{digitDistribution.recentDigits.length ? digitDistribution.recentDigits.slice(-8).join('') : 'Waiting'}</strong>
                    {contractType === 'OVER/UNDER' && <small className="manual-digit-hint">Tap digit for barrier</small>}
                  </div>
                  <div className="manual-digit-status-group">
                    <span className="manual-digit-live"><i /> {activeQuote?.status === 'live' ? 'LIVE' : 'CONNECTING'}</span>
                  </div>
                </header>

                <div className={`manual-digit-grid ${contractType === 'OVER/UNDER' ? 'is-barrier-mode' : ''}`} role="group" aria-label="Live digit distribution">
                  {digitDistribution.percentages.map((percentage, digit) => {
                    const frequencyTone = !digitDistribution.sampleSize
                      ? 'is-neutral'
                      : percentage > 10
                        ? 'is-positive'
                        : percentage < 10
                          ? 'is-negative'
                          : 'is-neutral';
                    const selectedBarrier = contractType === 'OVER/UNDER' && manualBarrier === String(digit);
                    const frequencyLabel = frequencyTone === 'is-positive'
                      ? 'above recent 10 percent baseline'
                      : frequencyTone === 'is-negative'
                        ? 'below recent 10 percent baseline'
                        : 'at recent 10 percent baseline';
                    const isEntryDigit = latestDigit === digit;
                    return (
                      <button
                        type="button"
                        key={digit}
                        className={`manual-digit-cell ${frequencyTone} ${selectedBarrier ? 'is-barrier' : ''} ${isEntryDigit ? 'is-latest' : ''}`}
                        disabled={isManualTradeExecuting}
                        onClick={() => setManualBarrier(String(digit))}
                        aria-pressed={selectedBarrier}
                        aria-label={`Digit ${digit}, ${digitDistribution.sampleSize ? `${percentage.toFixed(1)} percent, ${frequencyLabel}` : 'frequency unavailable'}${isEntryDigit ? ', latest live tick cursor' : ''}${contractType === 'OVER/UNDER' ? selectedBarrier ? ', selected Over/Under barrier' : ', select as Over/Under barrier' : ''}`}
                        title={digitDistribution.sampleSize
                          ? `${percentage.toFixed(1)}% recent frequency · ${frequencyLabel}${isEntryDigit ? ' · Latest live tick cursor' : ''}`
                          : `Digit ${digit}: frequency unavailable until live ticks arrive`}
                        data-testid={`manual-digit-${digit}`}
                        data-current-tick={isEntryDigit || undefined}
                      >
                        <strong>{digit}</strong>
                        <span>{digitDistribution.sampleSize ? `${percentage.toFixed(1)}%` : '—'}</span>
                      </button>
                    );
                  })}
                </div>

                <footer className="manual-digit-panel-footer">
                  <span><i className="digit-legend-above" /> ABOVE 10%</span>
                  <span><i className="digit-legend-below" /> BELOW 10%</span>
                  <span><i className="digit-legend-entry" /> CURRENT ENTRY</span>
                  <span>{digitDistribution.sampleSize ? `${digitDistribution.sampleSize} TICKS · FREQUENCY ONLY` : 'WAITING FOR TICKS'}</span>
                </footer>
              </section>
              <div className="ticket-body manual-contract-body">
                {contractType === 'OVER/UNDER' && (
                  <section className="manual-prediction" aria-label="Choose last digit prediction barrier">
                    <div className="manual-prediction-heading">
                      <span>BARRIER</span>
                      <strong>Barrier {manualBarrier}</strong>
                    </div>
                    <div className="manual-prediction-grid">
                      {Array.from({ length: 10 }, (_, digit) => (
                        <button
                          type="button"
                          key={digit}
                          className={manualBarrier === String(digit) ? 'is-selected' : ''}
                          aria-pressed={manualBarrier === String(digit)}
                          aria-label={`Set Over/Under barrier to ${digit}`}
                          onClick={() => setManualBarrier(String(digit))}
                        >
                          {digit}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <div className="manual-ticket-field manual-duration-field">
                   <label className="field-label" htmlFor="manual-number-of-ticks">DURATION</label>
                  <div className="manual-tick-range">
                    <input
                      id="manual-number-of-ticks"
                      type="range"
                      min="1"
                      max="365"
                      step="1"
                      value={Math.min(365, Math.max(1, Number.parseInt(numberOfTicks, 10) || 1))}
                      disabled={isManualTradeExecuting}
                      onChange={(event) => setNumberOfTicks(event.target.value)}
                      data-testid="manual-ticks-input"
                    />
                    <output htmlFor="manual-number-of-ticks">{numberOfTicks} Ticks</output>
                  </div>
                </div>
                <div className="manual-ticket-field">
                  <label className="field-label" htmlFor="stake">STAKE</label>
                  <div className="manual-number-row">
                    <button type="button" disabled={isManualTradeExecuting} onClick={() => setStake(String(Math.max(1, Number(stake || 0) - 1)))} aria-label="Decrease stake" data-testid="manual-stake-decrease">−</button>
                    <input id="stake" inputMode="decimal" disabled={isManualTradeExecuting} value={stake} onChange={(event) => setStake(event.target.value)} data-testid="manual-stake-input" />
                    <span>{currency}</span>
                    <button type="button" disabled={isManualTradeExecuting} onClick={() => setStake(String(Number(stake || 0) + 1))} aria-label="Increase stake" data-testid="manual-stake-increase">+</button>
                  </div>
                </div>
                <div className="manual-entry-settings">
                  <div className="manual-ticket-field">
                    <label className="field-label" htmlFor="manual-entry-count">RUNS ON THIS SELECTION</label>
                    <div className="manual-number-row manual-entry-number-row">
                      <button type="button" disabled={isManualTradeExecuting || manualEntryCount <= 1} onClick={() => setManualEntries(String(Math.max(1, Math.floor(manualEntryCount || 1) - 1)))} aria-label="Decrease number of runs">−</button>
                      <input
                        id="manual-entry-count"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="100"
                        step="1"
                        disabled={isManualTradeExecuting}
                        value={manualEntries}
                        onChange={(event) => setManualEntries(event.target.value)}
                        data-testid="manual-entry-count"
                      />
                      <button type="button" disabled={isManualTradeExecuting || manualEntryCount >= 100} onClick={() => setManualEntries(String(Math.min(100, Math.floor(manualEntryCount || 1) + 1)))} aria-label="Increase number of runs">+</button>
                    </div>
                  </div>
                  <div className="manual-entry-risk" aria-live="polite">
                    <small>ESTIMATED TOTAL STAKE</small>
                    <strong>{manualTotalStake === null ? '—' : `${manualTotalStake.toFixed(2)} ${currency}`}</strong>
                    <span>{manualEntryCountValid ? `Repeats this market, side and barrier · same stake each run` : 'Choose 1–100 runs'}</span>
                  </div>
                </div>
                <div className="manual-ticket-context">
                  <span><small>MARKET</small><strong>{activeDefinition.name}</strong></span>
                  <span><small>CONTRACT</small><strong>{contractType === 'OVER/UNDER' ? `${contractSide} ${manualBarrier}` : contractSide}</strong></span>
                </div>
                <div className="manual-payout-readout" aria-live="polite">
                  <span>PAYOUT</span>
                  <strong>{manualPayoutLabel(contractSide)}</strong>
                  {(manualQuoteErrorsBySide[contractSide] || manualQuoteState === 'error') && (
                    <small>Quote unavailable. The trade button requests a fresh Deriv proposal when you place the order.</small>
                  )}
                </div>
                {!manualContractMarketSupported && (
                  <p className="live-execution-warning" role="alert">Choose a Volatility market for digit trades.</p>
                )}
                {reviewState && <p className="review-state" role="status" data-testid="manual-trade-status">{reviewState}</p>}
                {manualEntriesExecuting && (
                  <button
                    type="button"
                    className="manual-stop-after-current"
                    onClick={() => {
                      manualStopRequestedRef.current = true;
                      setReviewState('Stop requested · waiting for the current entry to settle…');
                    }}
                    data-testid="manual-stop-batch"
                  >
                    STOP AFTER CURRENT ENTRY
                  </button>
                )}
                <div className={`manual-ticket-actions is-${contractType === 'RISE/FALL' ? 'direction' : contractType === 'OVER/UNDER' ? 'barrier' : 'parity'}`} aria-label={`${manualContractName} execution`}>
                  {contractType === 'RISE/FALL' ? (
                    <>
                      <button type="button" className="is-rise" disabled={isManualTradeExecuting} onClick={() => { setContractSide('RISE'); void executeManualTrade('BUY', 'RISE', undefined, undefined, manualEntries); }} data-testid="manual-execute-rise">
                        <strong>BUY RISE</strong><span>{manualPayoutLabel('RISE')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                      <button type="button" className="is-fall" disabled={isManualTradeExecuting} onClick={() => { setContractSide('FALL'); void executeManualTrade('BUY', 'FALL', undefined, undefined, manualEntries); }} data-testid="manual-execute-fall">
                        <strong>BUY FALL</strong><span>{manualPayoutLabel('FALL')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                    </>
                  ) : contractType === 'OVER/UNDER' ? (
                    <>
                      <button type="button" className="is-over" disabled={isManualTradeExecuting || !manualContractMarketSupported || Boolean(manualSideBarrierError('OVER'))} onClick={() => { setContractSide('OVER'); void executeManualTrade('BUY', 'OVER', undefined, undefined, manualEntries); }} data-testid="manual-execute-over">
                        <strong>OVER {manualBarrier}</strong><span>{manualPayoutLabel('OVER')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                      <button type="button" className="is-under" disabled={isManualTradeExecuting || !manualContractMarketSupported || Boolean(manualSideBarrierError('UNDER'))} onClick={() => { setContractSide('UNDER'); void executeManualTrade('BUY', 'UNDER', undefined, undefined, manualEntries); }} data-testid="manual-execute-under">
                        <strong>UNDER {manualBarrier}</strong><span>{manualPayoutLabel('UNDER')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="is-even" disabled={isManualTradeExecuting || !manualContractMarketSupported} onClick={() => { setContractSide('EVEN'); void executeManualTrade('BUY', 'EVEN', undefined, undefined, manualEntries); }} data-testid="manual-execute-even">
                        <strong>EVEN</strong><span>{manualPayoutLabel('EVEN')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                      <button type="button" className="is-odd" disabled={isManualTradeExecuting || !manualContractMarketSupported} onClick={() => { setContractSide('ODD'); void executeManualTrade('BUY', 'ODD', undefined, undefined, manualEntries); }} data-testid="manual-execute-odd">
                        <strong>ODD</strong><span>{manualPayoutLabel('ODD')}</span><small>PLACE {manualEntryCountValid ? manualEntryCount : '—'} {manualEntryCount === 1 ? 'RUN' : 'RUNS'}</small>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
            <ErrorBoundary
              resetKey={`${manualHistoryKey}:${manualTradeHistory.length}`}
              FallbackComponent={() => (
                <section className="manual-result-aside manual-result-error" role="status">
                  <header><span>TRADE DETAILS</span></header>
                  <p>Manual Trader is still available. The latest result details could not be displayed.</p>
                </section>
              )}
            >
              <section className="manual-result-aside" aria-live="polite" aria-label="Selected market results">
                <header><span>LAST TRADE</span><small>{latestManualTrade?.marketName ?? activeDefinition.name} · {latestManualTrade?.mode ?? accountMode}</small></header>
                <div className="manual-result-primary">
                  <div><small>{latestManualTrade ? 'CONTRACT' : 'TRADE HISTORY'}</small><strong>{latestManualContractLabel}</strong></div>
                  <b>{latestManualTrade ? formatSignedMoneyForDisplay(resolvedTradeProfit(latestManualTrade), latestManualTrade.currency ?? currency, displayCurrency, usdKesRate) : '—'}</b>
                </div>
                <div className="manual-result-stats">
                  <span><small>DIGIT</small><strong>{latestDigit ?? '—'}</strong></span>
                  <span><small>STAKE</small><strong>{latestManualStake === null ? '—' : formatMoneyForDisplay(latestManualStake, latestManualTrade?.currency ?? currency, displayCurrency, usdKesRate)}</strong></span>
                  <span><small>FEED</small><strong>{activeQuote?.status === 'live' ? 'LIVE' : 'WAITING'}</strong></span>
                </div>
              </section>
            </ErrorBoundary>
         </div>
          <ErrorBoundary
            resetKey={`${manualHistoryKey}:${manualTradeHistory.length}`}
            FallbackComponent={() => (
              <section className="bot-transaction-panel manual-transaction-error" role="status">
                <strong>Manual Trader is still open.</strong>
                <span>The transaction list could not be displayed. Your trade controls remain available.</span>
              </section>
            )}
          >
            <BotTransactionPanel
              trades={manualTradeHistory}
              currency={currency}
              running={reviewState.startsWith('Executing ')}
              activeTab={manualTransactionTab}
              onTabChange={setManualTransactionTab}
              onViewDetail={openManualHistoryDetail}
              historyLabel="CURRENT SESSION"
              sectionLabel="Manual trade history"
              runningLabel="Manual contract is settling"
              emptyMessage={reviewState.startsWith('Executing ') ? 'Waiting for the manual contract to settle.' : 'Settled manual trades will appear here.'}
            />
          </ErrorBoundary>
        </>
        ) : <ToolPlaceholderView title={activeTool} />}
      </main>
      </DcircleTradeContext.Provider>

      <footer className="terminal-footer">
        <span className="footer-brand">PROTRADERS FX · TRADES VIA DERIV</span>
        <RiskDisclaimerNote />
        <div className="support-contact-links" aria-label="ProTraders support contacts">
          <a href={SUPPORT_PHONE_LINK} aria-label={`Call ProTraders support at ${SUPPORT_PHONE_DISPLAY}`}>Call support · {SUPPORT_PHONE_DISPLAY}</a>
          <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer">WhatsApp support group <ArrowUpRight size={11} /></a>
        </div>
      </footer>
      <FloatingMarketAI marketQuotes={marketQuotes} draggable accountMode={accountMode} currency={currency} onTradeSettled={refreshAccount} />
      <ErrorBoundary
        resetKey={manualTradeResult ?? 'closed'}
        FallbackComponent={({ resetError }) => (
          <div className="manual-result-render-error" role="alert">
            <span>The order result popup could not load. Manual Trader and its transaction history remain open.</span>
            <button type="button" onClick={() => { setManualTradeResult(null); resetError(); }}>Close</button>
          </div>
        )}
      >
        <TradeResultDialog result={manualTradeResult} onClose={() => setManualTradeResult(null)} />
      </ErrorBoundary>
    </div>
    </CurrencyDisplayContext.Provider>
  );
}

function ToolPlaceholderView({ title }: { title: string }) {
  const subtitle = title === 'Premium AI Bots'
    ? 'Premium strategy workspace'
    : title === 'Volt AI' || title === 'Auto AI' || title === 'Signal AI'
      ? 'Signal and automation workspace'
      : 'Trading workspace';
  return (
    <section className="tool-placeholder-view">
      <div className="tool-placeholder-heading">
        <span className="terminal-eyebrow">{subtitle.toUpperCase()}</span>
        <h1>{title}</h1>
        <p>This workspace opens as its own tab. Select another tool above to switch without scrolling through a long page.</p>
      </div>
      <div className="tool-placeholder-tabs"><span className="is-active">Overview</span><span>Live data</span><span>Settings</span></div>
      <div className="tool-placeholder-grid">
        <article><strong>Focused workspace</strong><p>Keep this tool separate from the rest of the trading desk and return to the same tab when you need it.</p></article>
        <article><strong>Official Deriv feed</strong><p>Live market context remains available in the market rail above every workspace.</p></article>
        <article><strong>Review before execution</strong><p>Actions stay review-only until a proposal is explicitly requested and confirmed.</p></article>
      </div>
    </section>
  );
}

function clampSignalScore(value: number) {
  return Math.max(18, Math.min(92, Math.round(value)));
}

function getMarketSignal(definition: MarketDefinition, quote?: MarketQuote) {
  const lastDigit = Number(quoteLastDigit(quote));
  const recent = quote?.ticks.slice(-24) ?? [];
  const first = recent[0] ?? quote?.price ?? 0;
  const last = recent.at(-1) ?? first;
  const direction = last > first ? 1 : last < first ? -1 : 0;
  const digitBias = Number.isFinite(lastDigit) ? (lastDigit - 4.5) * 3.2 : 0;
  const score = clampSignalScore(56 + direction * 13 + digitBias);
  return {
    definition,
    quote,
    score,
    bias: score >= 62 ? 'RISE' : score <= 42 ? 'FALL' : 'WAIT',
    lastDigit: Number.isFinite(lastDigit) ? String(lastDigit) : '—',
  } as const;
}

function StrategySignalCard({ signal, selected, onSelect }: { signal: ReturnType<typeof getMarketSignal>; selected?: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`strategy-signal-card ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span className="strategy-signal-top"><strong>{signal.definition.label}</strong><small>{signal.quote?.status === 'live' ? 'LIVE' : 'LAST QUOTE'}</small></span>
      <b className={`strategy-signal-bias bias-${signal.bias.toLowerCase()}`}>{signal.bias}</b>
      <span className="strategy-signal-price">{formatMarketPrice(signal.quote?.price ?? null, signal.quote?.pipSize ?? 2)} <i>digit {signal.lastDigit}</i></span>
      <span className="strategy-signal-meter"><i style={{ width: `${signal.score}%` }} /></span>
      <small className="strategy-signal-score">{signal.score}% confidence <ChevronRight size={13} /></small>
    </button>
  );
}

function VoltAiView({ activeMarket, setActiveMarket, marketQuotes, onNavigate }: { activeMarket: string; setActiveMarket: (market: string) => void; marketQuotes: Record<string, MarketQuote>; onNavigate: (tool: string) => void }) {
  const [mode, setMode] = useState('Momentum scan');
  const [scanState, setScanState] = useState<'ready' | 'scanning' | 'complete'>('ready');
  const [selectedMarket, setSelectedMarket] = useState(activeMarket);
  const [reviewState, setReviewState] = useState('');
  const signals = useMemo(() => VOLATILITY_DEFINITIONS.slice(0, 8).map((definition) => getMarketSignal(definition, marketQuotes[definition.symbol])), [marketQuotes]);
  const selectedSignal = signals.find((signal) => signal.definition.label === selectedMarket) ?? signals[0];

  const scan = () => {
    setScanState('scanning');
    window.setTimeout(() => setScanState('complete'), 550);
  };

  return (
    <section className="strategy-workspace volt-ai-workspace">
      <div className="strategy-workspace-main">
        <header className="strategy-workspace-header">
          <div><span className="terminal-eyebrow">VOLT AI · LIVE SCANNER</span><h1>Find the cleanest market setup</h1><p>Rank official Deriv volatility markets using live tick momentum and digit context before you review a trade.</p></div>
          <span className="strategy-status-pill"><i /> {scanState === 'scanning' ? 'SCANNING' : scanState === 'complete' ? 'SCAN UPDATED' : 'READY TO SCAN'}</span>
        </header>
        <div className="strategy-control-bar">
          <label><span>SCAN MODE</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option>Momentum scan</option><option>Digit pressure</option><option>Quiet market filter</option></select></label>
          <label><span>FOCUS MARKET</span><select value={selectedMarket} onChange={(event) => { setSelectedMarket(event.target.value); setActiveMarket(event.target.value); }}>{signals.map(({ definition }) => <option key={definition.label} value={definition.label}>{definition.name}</option>)}</select></label>
          <button type="button" className="strategy-primary-button" onClick={scan} disabled={scanState === 'scanning'}>{scanState === 'scanning' ? 'Scanning…' : 'Run live scan'} <Sparkles size={14} /></button>
        </div>
        <div className="strategy-signal-grid">{signals.map((signal) => <StrategySignalCard key={signal.definition.symbol} signal={signal} selected={signal.definition.label === selectedSignal?.definition.label} onSelect={() => { setSelectedMarket(signal.definition.label); setActiveMarket(signal.definition.label); }} />)}</div>
      </div>
      <aside className="strategy-side-panel">
        <div className="strategy-side-kicker">SELECTED SIGNAL</div>
        <h2>{selectedSignal?.definition.name ?? 'Waiting for feed'}</h2>
        <div className={`strategy-side-bias bias-${selectedSignal?.bias.toLowerCase() ?? 'wait'}`}>{selectedSignal?.bias ?? 'WAIT'} <b>{selectedSignal?.score ?? 0}%</b></div>
        <p>Volt AI uses the current tick stream as decision support. Review the market in Manual Trader before requesting a proposal.</p>
        <button type="button" className="strategy-secondary-button" onClick={() => onNavigate('Manual Trader')}>Review in Manual Trader <ChevronRight size={14} /></button>
        {reviewState && <span className="strategy-review-state" role="status">{reviewState}</span>}
        <button type="button" className="strategy-link-button" onClick={() => setReviewState(`Signal saved for ${selectedSignal?.definition.label ?? 'selected market'}.`)}>Save signal for review</button>
      </aside>
    </section>
  );
}

function AutoAiView({ activeMarket, setActiveMarket, marketQuotes, onNavigate }: { activeMarket: string; setActiveMarket: (market: string) => void; marketQuotes: Record<string, MarketQuote>; onNavigate: (tool: string) => void }) {
  const [running, setRunning] = useState(false);
  const [riskMode, setRiskMode] = useState('Balanced');
  const [stake, setStake] = useState('1');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('5');
  const [reviewState, setReviewState] = useState('');
  const definition = getMarketDefinition(activeMarket);
  const quote = marketQuotes[definition.symbol];

  const toggleReviewLoop = () => {
    setRunning((current) => !current);
    setReviewState(running ? 'Auto AI review loop paused. No contract was purchased.' : `Auto AI review loop armed for ${definition.label}. Review-only mode is active.`);
  };

  return (
    <section className="strategy-workspace auto-ai-workspace">
      <div className="strategy-workspace-main">
        <header className="strategy-workspace-header">
          <div><span className="terminal-eyebrow">AUTO AI · REVIEW LOOP</span><h1>Automate the routine, keep the decision</h1><p>Set the market, risk guardrails, and signal cadence. Auto AI will keep a review queue ready without placing trades.</p></div>
          <span className={`strategy-status-pill ${running ? 'is-active' : ''}`}><i /> {running ? 'REVIEW LOOP ON' : 'REVIEW LOOP OFF'}</span>
        </header>
        <form className="strategy-settings-grid" onSubmit={(event) => { event.preventDefault(); setReviewState(`Auto AI settings saved · ${stake} USD stake · ${riskMode} risk.`); }}>
          <label><span>MARKET</span><select value={activeMarket} onChange={(event) => setActiveMarket(event.target.value)}>{MARKET_DEFINITIONS.map(({ label, name }) => <option key={label} value={label}>{name}</option>)}</select></label>
          <label><span>RISK PROFILE</span><select value={riskMode} onChange={(event) => setRiskMode(event.target.value)}><option>Conservative</option><option>Balanced</option><option>Fast review</option></select></label>
          <label><span>STAKE</span><input inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
          <label><span>TAKE PROFIT</span><input inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} /></label>
          <label><span>STOP LOSS</span><input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /></label>
          <button type="submit" className="strategy-secondary-button">Save guardrails <Settings2 size={14} /></button>
        </form>
        <div className="auto-ai-monitor">
          <div><span className="strategy-card-kicker">CURRENT MARKET</span><strong>{definition.name}</strong><b>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</b><small>{quote?.status === 'live' ? '● LIVE TICK STREAM' : 'LAST QUOTE AVAILABLE'}</small></div>
          <div><span className="strategy-card-kicker">NEXT REVIEW</span><strong>{running ? 'Monitoring now' : 'Not scheduled'}</strong><small>{running ? 'Signal queue updates with each tick.' : 'Arm the review loop to begin.'}</small></div>
          <div><span className="strategy-card-kicker">SAFETY LIMITS</span><strong>{takeProfit || '0'} / {stopLoss || '0'} USD</strong><small>Take profit / stop loss</small></div>
        </div>
      </div>
      <aside className="strategy-side-panel">
        <div className="strategy-side-kicker">AUTO AI CONTROL</div>
        <h2>{running ? 'Review loop is active' : 'Review loop is ready'}</h2>
        <p>Auto AI does not connect a personal Deriv account or execute contracts. It prepares the next market review from the public feed.</p>
        <button type="button" className={`strategy-primary-button ${running ? 'is-danger' : ''}`} onClick={toggleReviewLoop}>{running ? 'Pause review loop' : 'Start review loop'} <Zap size={14} /></button>
        <button type="button" className="strategy-secondary-button" onClick={() => onNavigate('Analysis Tools')}>Open Analysis Tools <ChevronRight size={14} /></button>
        {reviewState && <span className="strategy-review-state" role="status">{reviewState}</span>}
      </aside>
    </section>
  );
}

function SignalAiView({ activeMarket, setActiveMarket, marketQuotes, onNavigate }: { activeMarket: string; setActiveMarket: (market: string) => void; marketQuotes: Record<string, MarketQuote>; onNavigate: (tool: string) => void }) {
  const [filter, setFilter] = useState('All signals');
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState('');
  const signals = useMemo(() => VOLATILITY_DEFINITIONS.slice(0, 10).map((definition) => getMarketSignal(definition, marketQuotes[definition.symbol])), [marketQuotes]);
  const visibleSignals = signals.filter((signal) => filter === 'All signals' || signal.bias === filter.toUpperCase());
  const selected = signals.find((signal) => signal.definition.label === selectedSignal) ?? visibleSignals[0];

  return (
    <section className="strategy-workspace signal-ai-workspace">
      <div className="strategy-workspace-main">
        <header className="strategy-workspace-header">
          <div><span className="terminal-eyebrow">SIGNAL AI · SIGNAL DESK</span><h1>Review signals as they arrive</h1><p>Filter the public Deriv tick stream by direction and send a selected setup into the correct review workspace.</p></div>
          <span className="strategy-status-pill"><i /> {visibleSignals.length} SIGNALS</span>
        </header>
        <div className="strategy-filter-bar">
          {['All signals', 'Rise', 'Fall', 'Wait'].map((item) => <button key={item} type="button" className={filter === item ? 'is-selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}
          <span>Updated from live market ticks</span>
        </div>
        <div className="signal-feed">
          {visibleSignals.map((signal) => (
            <button type="button" key={signal.definition.symbol} className={`signal-feed-row ${selected?.definition.symbol === signal.definition.symbol ? 'is-selected' : ''}`} onClick={() => { setSelectedSignal(signal.definition.label); setActiveMarket(signal.definition.label); }}>
              <span className="signal-feed-market"><strong>{signal.definition.label}</strong><small>{signal.definition.name}</small></span>
              <span className={`strategy-signal-bias bias-${signal.bias.toLowerCase()}`}>{signal.bias}</span>
              <span className="signal-feed-price">{formatMarketPrice(signal.quote?.price ?? null, signal.quote?.pipSize ?? 2)}</span>
              <span className="signal-feed-score">{signal.score}%</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      </div>
      <aside className="strategy-side-panel">
        <div className="strategy-side-kicker">SIGNAL REVIEW</div>
        <h2>{selected?.definition.label ?? 'Select a signal'}</h2>
        <div className={`strategy-side-bias bias-${selected?.bias.toLowerCase() ?? 'wait'}`}>{selected?.bias ?? 'WAIT'} <b>{selected?.score ?? 0}%</b></div>
        <p>Selected signals remain review-only. Use Analysis Tools for digit context or Manual Trader for a contract proposal review.</p>
        <button type="button" className="strategy-secondary-button" onClick={() => onNavigate('Analysis Tools')}>Open analysis <BarChart3 size={14} /></button>
        <button type="button" className="strategy-primary-button" onClick={() => onNavigate('Manual Trader')}>Review trade setup <ChevronRight size={14} /></button>
        <button type="button" className="strategy-link-button" onClick={() => setReviewState(`${selected?.definition.label ?? 'Signal'} added to review queue.`)}>Add to review queue</button>
        {reviewState && <span className="strategy-review-state" role="status">{reviewState}</span>}
      </aside>
    </section>
  );
}

function ApexBotView({ activeMarket, setActiveMarket, marketQuotes }: { activeMarket: string; setActiveMarket: (market: string) => void; marketQuotes: Record<string, MarketQuote> }) {
  const [stake, setStake] = useState('1');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('5');
  const [strategy, setStrategy] = useState('Digits momentum');
  const definition = getMarketDefinition(activeMarket);
  const quote = marketQuotes[definition.symbol];
  const ticks = quote?.ticks.slice(-120) ?? [];
  const latestTick = ticks.at(-1) ?? null;
  const firstTick = ticks[0] ?? latestTick;
  const latestDigit = latestTick === null ? '—' : formatMarketPrice(latestTick, quote?.pipSize ?? 2).replace(/\D/g, '').slice(-1);
  const momentum = firstTick !== null && latestTick !== null && latestTick !== firstTick ? latestTick > firstTick ? 'RISING' : 'FALLING' : 'FLAT';
  const evenCount = ticks.reduce((total, tick) => {
    const digit = Number(formatMarketPrice(tick, quote?.pipSize ?? 2).replace(/\D/g, '').slice(-1));
    return total + (digit % 2 === 0 ? 1 : 0);
  }, 0);
  const evenProbability = ticks.length ? (evenCount / ticks.length) * 100 : 0;
  const confidence = ticks.length ? Math.max(evenProbability, 100 - evenProbability) : 0;
  const resultLabel = strategy === 'Rise / Fall trend' ? momentum : strategy === 'Over / Under pressure' ? (latestDigit !== '—' && Number(latestDigit) > 4 ? 'OVER' : 'UNDER') : evenProbability >= 50 ? 'EVEN' : 'ODD';

  return (
    <section className="strategy-workspace apex-bot-workspace">
      <div className="strategy-workspace-main">
        <header className="strategy-workspace-header">
          <div><span className="terminal-eyebrow">APEX BOT · RESULTS</span><h1>See the latest bot result</h1><p>Configure a compact strategy and view its live result snapshot as official Deriv ticks arrive.</p></div>
          <span className="strategy-status-pill is-active"><i /> RESULTS LIVE</span>
        </header>
        <div className="apex-bot-grid">
          <section className="strategy-config-card">
            <div className="strategy-card-heading"><span className="strategy-card-kicker">BOT CONFIGURATION</span><strong>Core parameters</strong></div>
            <label><span>MARKET</span><select value={activeMarket} onChange={(event) => setActiveMarket(event.target.value)}>{MARKET_DEFINITIONS.map(({ label, name }) => <option key={label} value={label}>{name}</option>)}</select></label>
            <label><span>STRATEGY</span><select value={strategy} onChange={(event) => setStrategy(event.target.value)}><option>Digits momentum</option><option>Rise / Fall trend</option><option>Over / Under pressure</option></select></label>
            <div className="strategy-two-column">
              <label><span>STAKE</span><input inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
              <label><span>TAKE PROFIT</span><input inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} /></label>
            </div>
            <label><span>STOP LOSS</span><input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /></label>
            <div className="apex-results-callout"><span>RESULT</span><strong>{resultLabel}</strong><small>{confidence.toFixed(1)}% confidence · {ticks.length} ticks analyzed</small></div>
          </section>
          <section className="apex-bot-preview">
            <div className="strategy-card-heading"><span className="strategy-card-kicker">LIVE CONTEXT</span><strong>{definition.name}</strong></div>
            <div className="apex-price">{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)} <small>{quote?.status === 'live' ? 'LIVE' : 'LAST QUOTE'}</small></div>
            <div className="apex-mini-chart">{(quote?.ticks.slice(-28) ?? []).map((tick, index, values) => <i key={`${tick}-${index}`} style={{ height: `${20 + ((tick - Math.min(...values)) / Math.max(Math.max(...values) - Math.min(...values), .0001)) * 68}%` }} />)}</div>
            <div className="apex-stat-row"><span>Strategy<strong>{strategy}</strong></span><span>Last digit<strong>{latestDigit}</strong></span><span>Mode<strong>Results only</strong></span></div>
          </section>
        </div>
        <section className="apex-results-panel">
          <div className="strategy-card-heading"><span className="strategy-card-kicker">APEX RESULT SNAPSHOT</span><strong>What the bot sees now</strong></div>
          <div className="apex-results-grid">
            <div><span>Signal</span><strong>{resultLabel}</strong><small>Derived from the current strategy</small></div>
            <div><span>Momentum</span><strong>{momentum}</strong><small>First tick versus latest tick</small></div>
            <div><span>Even probability</span><strong>{evenProbability.toFixed(1)}%</strong><small>{evenCount} of {ticks.length || 0} recent digits</small></div>
            <div><span>Last digit</span><strong>{latestDigit}</strong><small>Latest official quote</small></div>
          </div>
        </section>
      </div>
      <aside className="strategy-side-panel">
        <div className="strategy-side-kicker">APEX RESULTS</div>
        <h2>Results are ready</h2>
        <p>Clicking Apex Bot shows the current result snapshot immediately. It does not start a review loop or purchase a contract.</p>
        <div className="strategy-check-list"><span>✓ Official tick context</span><span>✓ Live result snapshot</span><span>✓ No automatic execution</span></div>
        <button type="button" className="strategy-secondary-button" onClick={() => window.dispatchEvent(new Event('market-ai-open'))}>Open Market AI <Sparkles size={14} /></button>
      </aside>
    </section>
  );
}

function CopyTraderView({ activeMarket, marketQuotes, currency }: { activeMarket: string; marketQuotes: Record<string, MarketQuote>; currency: string }) {
  const [leader, setLeader] = useState('Atlas Momentum');
  const [userStake, setUserStake] = useState('');
  const [maxDaily, setMaxDaily] = useState('25');
  const [copyEnabled, setCopyEnabled] = useState(false);
  const [reviewState, setReviewState] = useState('');
  const definition = getMarketDefinition(activeMarket);
  const quote = marketQuotes[definition.symbol];
  const stakeAmount = Number(userStake);
  const dailyRiskAmount = Number(maxDaily);
  const limitsValid = Number.isFinite(stakeAmount) && stakeAmount > 0
    && Number.isFinite(dailyRiskAmount) && dailyRiskAmount >= stakeAmount;
  const leaders = [
    { name: 'Atlas Momentum', style: 'Trend review', winRate: '68%', risk: 'Balanced', markets: 'Volatility 75 / 100' },
    { name: 'Digit Compass', style: 'Digit review', winRate: '61%', risk: 'Measured', markets: 'Volatility 10 / 25' },
    { name: 'East Africa FX', style: 'Forex review', winRate: '57%', risk: 'Conservative', markets: 'EUR/USD · GBP/USD' },
  ];
  const selectedLeader = leaders.find((item) => item.name === leader) ?? leaders[0];

  return (
    <section className="strategy-workspace copy-trader-workspace">
      <div className="strategy-workspace-main">
        <header className="strategy-workspace-header">
          <div><span className="terminal-eyebrow">COPY TRADER · REVIEW NETWORK</span><h1>Follow a strategy with clear limits</h1><p>Set your own stake for each copied trade and a daily risk cap. The leader’s stake never determines your order size.</p></div>
          <span className={`strategy-status-pill ${copyEnabled ? 'is-active' : ''}`}><i /> {copyEnabled ? 'REVIEW COPY ON' : 'NOT CONNECTED'}</span>
        </header>
        <div className="copy-leader-grid">
          {leaders.map((item) => <button type="button" key={item.name} className={`copy-leader-card ${leader === item.name ? 'is-selected' : ''}`} onClick={() => setLeader(item.name)}><span className="copy-avatar">{item.name.slice(0, 2).toUpperCase()}</span><strong>{item.name}</strong><small>{item.style}</small><b>{item.winRate}</b><em>{item.risk} · {item.markets}</em></button>)}
        </div>
        <div className="copy-settings">
          <div><span className="strategy-card-kicker">SELECTED PROFILE</span><strong>{selectedLeader.name}</strong><small>{selectedLeader.style} · {selectedLeader.winRate} reviewed win rate</small></div>
          <label><span>YOUR STAKE PER TRADE · {currency}</span><input inputMode="decimal" placeholder="Enter your stake" value={userStake} aria-label={`Your stake per copied trade in ${currency}`} onChange={(event) => { setUserStake(event.target.value); setCopyEnabled(false); setReviewState(''); }} /></label>
          <label><span>MAX DAILY RISK · {currency}</span><input inputMode="decimal" value={maxDaily} aria-label={`Maximum daily risk in ${currency}`} onChange={(event) => { setMaxDaily(event.target.value); setCopyEnabled(false); setReviewState(''); }} /></label>
          <button type="button" className={`strategy-primary-button ${copyEnabled ? 'is-danger' : ''}`} disabled={!copyEnabled && !limitsValid} onClick={() => {
            if (copyEnabled) {
              setCopyEnabled(false);
              setReviewState('Copy review paused. No account was connected and no trades were placed.');
              return;
            }
            setCopyEnabled(true);
            setReviewState(`Review set for ${selectedLeader.name}: ${currency} ${stakeAmount.toFixed(2)} per copied trade, with a ${currency} ${dailyRiskAmount.toFixed(2)} daily cap. No trades were placed.`);
          }}>{copyEnabled ? 'Pause copy review' : 'Review copy settings'} <Copy size={14} /></button>
        </div>
      </div>
      <aside className="strategy-side-panel">
        <div className="strategy-side-kicker">CURRENT MARKET CONTEXT</div>
        <h2>{definition.label}</h2>
        <div className="apex-price">{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)} <small>{quote?.status === 'live' ? 'LIVE' : 'LAST QUOTE'}</small></div>
        <p>Each follower controls a fixed stake per copied trade. The leader’s stake and balance do not scale it. Live copying remains disabled until secure account linking is completed.</p>
        <div className="strategy-check-list"><span>✓ User-set stake per trade</span><span>✓ User-set daily cap</span><span>✓ No live copying</span></div>
        {reviewState && <span className="strategy-review-state" role="status">{reviewState}</span>}
      </aside>
    </section>
  );
}

const PublicLoadingView = memo(function PublicLoadingView({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return startPublicIntro({
      durationMs: reducedMotion ? 800 : 2400,
      onProgress: setProgress,
      onComplete,
    });
  }, [onComplete]);

  return (
    <main className="public-loading-screen">
      <div className="public-loading-art" />
      <section
        className={`public-loading-card${progress >= 100 ? ' public-loading-card-complete' : ''}`}
        aria-live="polite"
        aria-label="Opening ProTraders FX"
      >
        <div className="public-loading-logo"><BarChart3 size={22} /></div>
        <span className="public-loading-kicker">PROTRADERS FX</span>
        <h1>Trading Workspace</h1>
        <p>Preparing the public market view…</p>
        <div className="public-loading-progress" role="progressbar" aria-label="Opening workspace" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <small>Boot sequence <b>{progress}%</b></small>
      </section>
    </main>
  );
});

function PublicLandingShell({ startupError, onRetry }: {
  startupError: string | null;
  onRetry: () => void;
}) {
  const marketQuotes = usePublicMarketBoard();
  return <PublicLandingView marketQuotes={marketQuotes} startupError={startupError} onRetry={onRetry} />;
}

function PublicLandingView({ marketQuotes, startupError, onRetry }: {
  marketQuotes: Record<string, MarketQuote>;
  startupError: string | null;
  onRetry: () => void;
}) {
  const { t, language } = useLanguage();
  const { signInHref, signUpHref } = useAppAuth();
  const rates = useUsdKesRate();
  const { displayCurrency, selectCurrency, automatic: automaticCurrency } = useDisplayCurrencyPreference();
  const publicMarkets = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'VOL 100 1s', 'VOL 75 1s'];
  return (
    <main className="public-landing">
      <header className="public-landing-header">
        <a href={basePath || '/'} className="public-landing-brand"><span><BarChart3 size={18} /></span><strong>PROTRADERS <b>FX</b><small>DERIV TRADING WORKSPACE</small></strong></a>
          <div className="public-landing-actions"><LanguageSelector />
            <CurrencyConverter automatic={automaticCurrency} rates={rates.rates} source={rates.source} checkedAt={rates.checkedAt} updatedAt={rates.updatedAt}
              loading={rates.loading} stale={rates.stale} onRefresh={rates.refresh}
              displayCurrency={displayCurrency} onSelectCurrency={selectCurrency} />
            <a className="public-login" href={signInHref}>{t('Join workspace')}</a><a className="public-signup" href={signUpHref}>{t('Create account')}</a></div>
      </header>
      {startupError && <div className="public-auth-recovery" role="alert">
        <span>{startupError}</span>
        <button type="button" onClick={onRetry}>Retry account check</button>
        <a href={signInHref}>Reconnect Deriv</a>
      </div>}
      <section className="public-hero public-hero-minimal">
        <div className="public-hero-copy">
          <span className="public-hero-kicker"><i /> MARKET CONTEXT, BEFORE THE CLICK</span>
          <h1><small>protradersfx.com</small><br /><span>{t('Trade like a pro')}</span></h1>
          <p>{heroDescriptions[language]}</p>
           <div className="public-hero-actions"><a className="public-hero-primary" href={signInHref}>{t('Enter workspace')} <ArrowUpRight size={15} /></a><a className="public-hero-secondary" href={signUpHref}>{t('Create account')} <Zap size={14} /></a></div>
          <small className="public-hero-note">Your account and trade execution stay connected to Deriv.</small>
        </div>
        <div className="public-market-orbit" aria-hidden="true">
          <div className="landing-chart-caption"><span>MARKET TAPE</span><b>DERIV · PUBLIC FEED</b></div>
          <span className="orbit-line orbit-line-a" /><span className="orbit-line orbit-line-b" />
          <span className="orbit-candle candle-one" /><span className="orbit-candle candle-two" /><span className="orbit-candle candle-three" /><span className="orbit-candle candle-four" />
          <div className="orbit-core"><BarChart3 size={28} /><b>MARKET</b></div>
          <div className="landing-chart-axis"><span>CONTEXT</span><span>DECISION</span><span>RESULT</span></div>
        </div>
      </section>
      <section className="public-ticker-section" aria-label="Live Deriv market quotes">
        <div className="public-ticker-heading"><span><i /> {t('LIVE MARKET SNAPSHOT')}</span><small>Official Deriv quotes · current connection state</small></div>
        <div className="public-ticker">
          {publicMarkets.map((label) => {
            const market = getMarketDefinition(label);
            const quote = marketQuotes[market.symbol];
            const status = quote?.status ?? 'connecting';
            const hasPrice = typeof quote?.price === 'number' && Number.isFinite(quote.price);
            const statusLabel = status === 'live'
              ? 'LIVE'
              : status === 'closed'
                ? 'CLOSED'
                : status === 'error'
                  ? 'FEED ERROR'
                  : hasPrice
                    ? 'LAST QUOTE'
                    : 'CONNECTING';
            return (
              <div className="public-ticker-item" key={market.symbol}>
                <span>{label}</span>
                {hasPrice ? (
                  <strong className={`quote-${quoteTone(quote)}`}>{formatMarketPrice(quote.price, quote.pipSize ?? 2)}</strong>
                ) : status === 'connecting' ? (
                  <span className="quote-placeholder" aria-hidden="true" />
                ) : (
                  <strong className="quote-unavailable" aria-label={`${label} quote unavailable`}>—</strong>
                )}
                <small className={`quote-status-${status}`}>{statusLabel}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section className="public-process" aria-label="Workspace workflow">
        <div><span>01 / OBSERVE</span><strong>{t('Scan live context')}</strong><p>Compare market quotes and recent tick behavior from the Deriv feed.</p></div>
        <div><span>02 / CONFIGURE</span><strong>{t('Set the contract')}</strong><p>Choose a market, contract type, duration and stake before acting.</p></div>
        <div><span>03 / REVIEW</span><strong>{t('Read the settlement')}</strong><p>Inspect returned trade details, entry and exit points, and net profit/loss.</p></div>
      </section>
      <footer className="public-landing-footer">
        <span>PROTRADERS FX <b>·</b> TRADES VIA DERIV</span>
        <RiskDisclaimerNote />
        <div className="public-support-links" aria-label="ProTraders support contacts">
          <a href={SUPPORT_PHONE_LINK} aria-label={`Call ProTraders support at ${SUPPORT_PHONE_DISPLAY}`}>{t('Support')} · {SUPPORT_PHONE_DISPLAY}</a>
          <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer">WhatsApp group <ArrowUpRight size={12} /></a>
        </div>
        <a href={DERIV_REFERRAL_URL} target="_blank" rel="noopener noreferrer">Open a Deriv account <ArrowUpRight size={13} /></a>
      </footer>
    </main>
  );
}

function DashboardView({ accountMode, marketQuotes, isOwner, onNavigate }: { accountMode: 'DEMO' | 'REAL'; marketQuotes: Record<string, MarketQuote>; isOwner: boolean; onNavigate: (tool: string) => void }) {
  const { t } = useLanguage();
  const bookingEligibilityQuery = useGetLiveTradingEligibility({
    query: {
      queryKey: getGetLiveTradingEligibilityQueryKey(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  });
  const featuredMarkets = MARKET_DEFINITIONS.filter(({ family }) => family === 'volatility').slice(0, 6);
  const marketQuoteList = MARKET_DEFINITIONS.map(({ symbol }) => marketQuotes[symbol]);
  const liveMarketCount = marketQuoteList.filter((quote) => quote?.status === 'live').length;
  const quotedMarketCount = marketQuoteList.filter((quote) => quote?.price !== null && quote?.price !== undefined).length;
  const canBookLiveTrading = accountMode === 'REAL'
    && bookingEligibilityQuery.data?.eligible === true
    && !bookingEligibilityQuery.isError;
  const actions = [
    { label: 'Bulk Scanner', description: 'Scan markets and review trade signals', icon: Layers3, tool: 'Bulk Trader', accent: 'cyan' },
    { label: 'Manual Trader', description: 'Choose a contract and place trades', icon: LineChart, tool: 'Manual Trader', accent: 'violet' },
    { label: 'Analysis Tools', description: 'Review market context and digit data', icon: Search, tool: 'Analysis Tools', accent: 'blue' },
    { label: 'Free Bots', description: 'Open the free bot workspace', icon: Bot, tool: 'Free Bots', accent: 'teal' },
    { label: 'Deriv Pro Bots', description: 'Open premium rule-based bots', icon: Flame, tool: 'Deriv Pro Bots', accent: 'gold' },
    { label: 'Owner Activity', description: isOwner ? 'Monitor platform activity' : 'Owner access required', icon: ShieldCheck, tool: 'Owner Activity', accent: 'gold' },
  ];

  return (
    <section className="dashboard-view">
      <div className="dashboard-section-heading dashboard-horizontal-lane">
        <div><span className="terminal-eyebrow">YOUR TRADING DESK / DERIV</span><h2>Start with the market. Then choose your method.</h2><p>Quotes first. Contract controls and settled results stay in the same workspace.</p></div>
        <span className="dashboard-session"><i /> {accountMode} SESSION</span>
      </div>
      <div className="dashboard-action-grid dashboard-horizontal-lane" role="navigation" aria-label="Trading tools" tabIndex={0} data-testid="dashboard-tools">
        {actions.map(({ label, description, icon: Icon, tool, accent }, index) => (
          <button
            key={label}
            type="button"
            className={`dashboard-action-card accent-${accent}`}
            onClick={() => onNavigate(tool)}
            data-testid={`dashboard-tool-${tool.toLowerCase().replace(/\s+/g, '-')}`}
            title={label === 'Owner Activity' && !isOwner ? 'Owner access is required to view activity.' : `Open ${label}`}
          >
            <span className="dashboard-card-number">0{index + 1}</span>
            <span className="dashboard-action-icon"><Icon size={24} /></span>
            <strong>{t(tool)}</strong>
            <small>{description}</small>
            <ChevronRight className="dashboard-card-arrow" size={15} />
          </button>
        ))}
      </div>
      <div className="dashboard-live-heading dashboard-horizontal-lane"><span className="terminal-eyebrow">VOLATILITY MARKET BOARD</span><span>Tap a quote to open Manual Trader</span></div>
      <div className="dashboard-market-grid dashboard-horizontal-lane" role="region" aria-label="Volatility market quotes" tabIndex={0}>
        {featuredMarkets.map(({ label, name, symbol }) => {
          const quote = marketQuotes[symbol];
          return (
            <button key={symbol} type="button" className="dashboard-market-card" onClick={() => onNavigate('Manual Trader')}>
              <span><strong>{label}</strong><small>{name}</small></span>
              <b className={quote?.status === 'live' ? 'is-live' : ''}>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</b>
              <small className="dashboard-market-status"><i /> {quote?.status === 'live' ? 'LIVE' : quote?.price !== null ? 'LAST QUOTE' : 'CONNECTING'}</small>
            </button>
          );
        })}
      </div>
      <section className="dashboard-review-strip dashboard-horizontal-lane" aria-label="Trading workflow steps" tabIndex={0}>
        <span>PROTRADERS FX WORKFLOW</span>
        <div><b>01</b><strong>Read live context</strong></div>
        <div><b>02</b><strong>Make a deliberate contract choice</strong></div>
        <div><b>03</b><strong>Understand the settled result</strong></div>
      </section>
      <div className="dashboard-support-strip dashboard-horizontal-lane" role="region" aria-label="ProTraders support" data-testid="dashboard-support">
        <div><strong>{t('Support')}</strong><small>Need help with your workspace?</small></div>
        <a href={SUPPORT_PHONE_LINK} data-testid="dashboard-support-call">Call {SUPPORT_PHONE_DISPLAY}</a>
        <a href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer" data-testid="dashboard-support-whatsapp">WhatsApp support</a>
      </div>
      <div className="dashboard-context-band dashboard-horizontal-lane" role="region" aria-label="Market status and workflow metrics" tabIndex={0}>
        <div className="dashboard-context-title"><span>PUBLIC FEED STATUS</span><strong>Market context</strong><small>Official Deriv quote stream</small></div>
        <div><span>LIVE MARKETS</span><strong>{liveMarketCount}</strong></div>
        <div><span>QUOTED MARKETS</span><strong>{quotedMarketCount}</strong></div>
        <div className="dashboard-context-note"><span>WORKFLOW</span><strong>Observe <b>→</b> Configure <b>→</b> Review</strong></div>
      </div>
      {canBookLiveTrading && <section className="dashboard-live-booking dashboard-horizontal-lane" aria-labelledby="dashboard-live-booking-title" tabIndex={0} data-testid="card-live-trading-booking">
        <div className="dashboard-booking-intro">
          <span className="terminal-eyebrow">LIVE TRADING / BOOKING</span>
          <h3 id="dashboard-live-booking-title">Book a live trading session</h3>
          <p>For traders with a linked real USD Deriv account balance above $100. Demo balance does not qualify.</p>
        </div>
        <div className="dashboard-booking-fee" data-testid="text-live-trading-booking-fee">
          <strong>$5</strong>
          <span>USD BOOKING FEE</span>
        </div>
        <div
          className={`dashboard-booking-eligibility ${canBookLiveTrading ? 'is-eligible' : ''} ${bookingEligibilityQuery.isError ? 'has-error' : ''}`}
          role="status"
          data-testid="status-live-trading-eligibility"
        >
          {bookingEligibilityQuery.data?.reason ?? 'Verified real USD account above $100.'}
        </div>
        <div className="dashboard-booking-bottom">
          <p className="dashboard-booking-risk" data-testid="text-live-trading-risk-disclaimer">
            Trading is risky. You can lose some or all of your money. No profits are guaranteed.
          </p>
          <div className="dashboard-booking-actions">
            <a
              className="dashboard-booking-whatsapp"
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-whatsapp-live-trading"
            >
              Join WhatsApp booking group
            </a>
            <span className="dashboard-booking-whatsapp-number" data-testid="text-live-trading-whatsapp-number">
              WhatsApp: {SUPPORT_PHONE_DISPLAY}
            </span>
          </div>
        </div>
      </section>}
    </section>
  );
}

function AnalysisToolsView({ marketQuotes }: { marketQuotes: Record<string, MarketQuote> }) {
  const tradeContext = useContext(DcircleTradeContext);
  if (!tradeContext) throw new Error('Dcircles trading context is not available.');
  const { activeMarket, setActiveMarket, accountMode, currency, defaultSetup, tradeStatus, onTradeMarket } = tradeContext;
  const [mode, setMode] = useState<'Digit circles' | 'Normal tool'>('Digit circles');
  const [sideTab, setSideTab] = useState<'Summary' | 'Transactions' | 'Journal' | 'Results'>('Summary');
  const [ticksWindow, setTicksWindow] = useState('120');
  const [contractType, setContractType] = useState<ManualContractType>(defaultSetup.contractType);
  const [side, setSide] = useState<ManualContractSide>(defaultSetup.side);
  const [tradeStake, setTradeStake] = useState(defaultSetup.stake);
  const [durationTicks, setDurationTicks] = useState(defaultSetup.durationTicks);
  const [barrier, setBarrier] = useState(defaultSetup.barrier);
  const [pendingMarket, setPendingMarket] = useState<string | null>(null);
  const analysisMarkets = VOLATILITY_DEFINITIONS.filter(({ label }) => label.endsWith('1s')).slice(0, 6);
  const windowSize = Math.max(1, Number.parseInt(ticksWindow, 10) || 1);
  const availableSides: ManualContractSide[] = contractType === 'RISE/FALL'
    ? ['RISE', 'FALL']
    : contractType === 'OVER/UNDER'
      ? ['OVER', 'UNDER']
      : ['EVEN', 'ODD'];
  const setup: DcircleTradeSetup = { contractType, side, stake: tradeStake, durationTicks, barrier };
  const tradeSummary = `${side}${contractType === 'OVER/UNDER' ? ` ${barrier}` : ''} · ${currency} ${tradeStake || '—'} · ${durationTicks || '1'} tick${durationTicks === '1' ? '' : 's'}`;

  async function handleMarketTrade(definition: MarketDefinition) {
    const quote = marketQuotes[definition.symbol];
    if (pendingMarket || quote?.status !== 'live') return;
    setPendingMarket(definition.symbol);
    setActiveMarket(definition.label);
    try {
      await onTradeMarket(definition, setup);
    } finally {
      setPendingMarket(null);
    }
  }

  return (
    <section className="analysis-tools-view">
      <div className="analysis-tools-main">
        <div className="analysis-tools-toolbar">
          <button type="button" className={mode === 'Digit circles' ? 'is-selected' : ''} onClick={() => setMode('Digit circles')}>◌ Digit circles</button>
          <button type="button" className={mode === 'Normal tool' ? 'is-selected' : ''} onClick={() => setMode('Normal tool')}>Normal tool</button>
          <label>Sample window: <input value={ticksWindow} onChange={(event) => setTicksWindow(event.target.value.replace(/\D/g, '').slice(0, 4) || '1')} inputMode="numeric" aria-label="Number of analysis ticks" /></label>
        </div>
        <div className="analysis-trade-setup">
          <div className="analysis-trade-account"><span>ACTIVE ACCOUNT</span><strong>{accountMode} · {currency}</strong></div>
          <label className="analysis-trade-field">CONTRACT
            <select value={contractType} onChange={(event) => {
              const nextType = event.target.value as ManualContractType;
              setContractType(nextType);
              setSide(nextType === 'RISE/FALL' ? 'RISE' : nextType === 'OVER/UNDER' ? 'OVER' : 'EVEN');
            }}>
              <option value="RISE/FALL">Rise / Fall</option>
              <option value="OVER/UNDER">Over / Under</option>
              <option value="ODD/EVEN">Even / Odd</option>
            </select>
          </label>
          <div className="analysis-trade-field analysis-trade-side"><span>CHOOSE SIDE</span><div>
            {availableSides.map((tradeSide) => <button key={tradeSide} type="button" className={side === tradeSide ? 'is-selected' : ''} onClick={() => setSide(tradeSide)}>{tradeSide}</button>)}
          </div></div>
          {contractType === 'OVER/UNDER' && <label className="analysis-trade-field">BARRIER
            <input type="number" min="0" max="9" value={barrier} onChange={(event) => setBarrier(event.target.value.slice(0, 1))} inputMode="numeric" />
          </label>}
          <label className="analysis-trade-field">STAKE
            <div className="analysis-trade-input-with-unit"><input type="number" min="0.35" step="0.01" value={tradeStake} onChange={(event) => setTradeStake(event.target.value)} /><span>{currency}</span></div>
          </label>
          <label className="analysis-trade-field">DURATION
            <div className="analysis-trade-input-with-unit"><input type="number" min="1" max="365" step="1" value={durationTicks} onChange={(event) => setDurationTicks(event.target.value.slice(0, 3))} /><span>TICKS</span></div>
          </label>
          <p className="analysis-trade-instruction">Click a live market’s button below to place one {tradeSummary} trade on that market.</p>
        </div>
        <div className="analysis-tools-grid">
          {analysisMarkets.map((definition) => (
            <AnalysisMarketCard
              key={definition.symbol}
              definition={definition}
              quote={marketQuotes[definition.symbol]}
              windowSize={windowSize}
              tradeSummary={tradeSummary}
              active={activeMarket === definition.label}
              busy={Boolean(pendingMarket)}
              placing={pendingMarket === definition.symbol}
              onTrade={() => { void handleMarketTrade(definition); }}
            />
          ))}
        </div>
      </div>
      <aside className="analysis-side-panel">
        <div className="analysis-side-tabs" role="tablist">{(['Summary', 'Transactions', 'Journal', 'Results'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={sideTab === tab} className={sideTab === tab ? 'is-active' : ''} onClick={() => setSideTab(tab)}>{tab}</button>)}</div>
        <div className="analysis-side-copy">
          {sideTab === 'Summary' && <><strong>Live market analysis</strong><p>Each percentage is calculated from the latest {windowSize} available ticks for that market. Circle totals use the displayed sample.</p></>}
          {sideTab === 'Transactions' && <><strong>Trade status</strong><p>{tradeStatus || 'Settled orders and their exact result will be shown after you place a trade.'}</p></>}
          {sideTab === 'Journal' && <><strong>Journal</strong><p>Scanner and bot activity notes will appear here as results arrive.</p></>}
          {sideTab === 'Results' && <><strong>Results</strong><p>After execution, the settled contract and exact profit or loss appear in the trade receipt.</p></>}
        </div>
        {tradeStatus && <div className="analysis-trade-status" role="status">{tradeStatus}</div>}
        <button type="button" className="analysis-reset" onClick={() => {
          setMode('Digit circles');
          setSideTab('Summary');
          setTicksWindow('120');
          setContractType(defaultSetup.contractType);
          setSide(defaultSetup.side);
          setTradeStake(defaultSetup.stake);
          setDurationTicks(defaultSetup.durationTicks);
          setBarrier(defaultSetup.barrier);
        }}>Reset</button>
      </aside>
    </section>
  );
}

function AnalysisMarketCard({ definition, quote, windowSize, tradeSummary, active, busy, placing, onTrade }: {
  definition: MarketDefinition;
  quote?: MarketQuote;
  windowSize: number;
  tradeSummary: string;
  active: boolean;
  busy: boolean;
  placing: boolean;
  onTrade: () => void;
}) {
  const stats = useMemo(() => {
    const counts = Array.from({ length: 10 }, () => 0);
    const ticks = (quote?.ticks ?? []).slice(-windowSize).filter(Number.isFinite);
    const history = ticks.map((value) => {
      const formatted = formatMarketPrice(value, quote?.pipSize ?? 2);
      const digit = Number(formatted.replace(/\D/g, '').slice(-1));
      if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
      return digit;
    }).filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
    const sampleSize = history.length;
    const probabilities = counts.map((count) => sampleSize ? (count / sampleSize) * 100 : 0);
    const percentFor = (predicate: (digit: number) => boolean) => sampleSize
      ? (history.filter(predicate).length / sampleSize) * 100
      : null;
    const changes = ticks.slice(1).map((value, index) => value - ticks[index]);
    const rising = changes.filter((change) => change > 0).length;
    const falling = changes.filter((change) => change < 0).length;
    const directionalChanges = rising + falling;
    return {
      history,
      probabilities,
      sampleSize,
      latestDigit: history.at(-1) ?? null,
      even: percentFor((digit) => digit % 2 === 0),
      odd: percentFor((digit) => digit % 2 === 1),
      over: percentFor((digit) => digit > 4),
      under: percentFor((digit) => digit < 4),
      rise: directionalChanges ? (rising / directionalChanges) * 100 : null,
      fall: directionalChanges ? (falling / directionalChanges) * 100 : null,
    };
  }, [quote, windowSize]);

  return (
    <article className={`analysis-market-card ${active ? 'is-active-market' : ''}`}>
      <header>
        <span className={`analysis-market-live ${quote?.status === 'live' ? 'is-live' : ''}`}><i />{quote?.status === 'live' ? 'LIVE' : 'WAITING'}</span>
        <div><strong>{definition.name}</strong><b>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</b></div>
        <span className="analysis-last-pill">{stats.sampleSize}/{windowSize} TICKS</span>
      </header>
      <div className="analysis-digit-grid" aria-label={`${definition.name} digit distribution`}>
        {stats.probabilities.map((probability, digit) => {
          const ringColor = digit % 2 === 0 ? '#4fcea5' : '#9677ec';
          return (
            <span
              key={digit}
              className={`analysis-digit-circle digit-${digit} ${stats.latestDigit === digit ? 'is-latest' : ''}`}
              style={{ background: stats.sampleSize ? `conic-gradient(${ringColor} ${probability * 3.6}deg, rgba(133, 155, 176, .24) 0deg)` : 'rgba(133, 155, 176, .24)' }}
              aria-label={`Digit ${digit}: ${stats.sampleSize ? `${probability.toFixed(1)} percent` : 'no tick data'}`}
            >
              <span className="analysis-digit-center"><strong>{digit}</strong><small>{stats.sampleSize ? `${probability.toFixed(1)}%` : '—'}</small></span>
            </span>
          );
        })}
      </div>
      <button type="button" className="analysis-market-trade" onClick={onTrade} disabled={quote?.status !== 'live' || busy || !stats.sampleSize} aria-label={`Place ${tradeSummary} trade on ${definition.name}`}>
        <strong>{placing ? 'PLACING ORDER…' : `TRADE ${definition.label}`}</strong>
        <small>{tradeSummary}</small>
      </button>
      <div className="analysis-history">{stats.history.slice(-10).map((digit, index) => <b key={`${digit}-${index}`} className={`digit-chip digit-${digit}`}>{digit}</b>)}</div>
      <AnalysisStatBar label="Even" value={stats.even} compare="Odd" compareValue={stats.odd} leftColor="#4fcea5" rightColor="#9677ec" />
      <AnalysisStatBar label="Rise" value={stats.rise} compare="Fall" compareValue={stats.fall} leftColor="#4fcea5" rightColor="#9677ec" />
      <AnalysisStatBar label="Over 4" value={stats.over} compare="Under 4" compareValue={stats.under} leftColor="#4fcea5" rightColor="#9677ec" />
    </article>
  );
}

function AnalysisStatBar({ label, value, compare, compareValue, leftColor, rightColor }: { label: string; value: number | null; compare: string; compareValue: number | null; leftColor: string; rightColor: string }) {
  const leftWidth = value ?? 0;
  const rightWidth = compareValue ?? 0;
  return (
    <div className="analysis-stat-bar">
      <span>{label}: {value === null ? '—' : `${value.toFixed(1)}%`}</span>
      <div><i style={{ width: `${leftWidth}%`, background: leftColor }} /><i style={{ width: `${rightWidth}%`, background: rightColor }} /></div>
      <b>{compare}: {compareValue === null ? '—' : `${compareValue.toFixed(1)}%`}</b>
    </div>
  );
}

function QuickBotView({ accountMode, currency, balance, activeMarket, marketQuotes, onNavigate, onTradeSettled }: { accountMode: 'DEMO' | 'REAL'; currency: string; balance: number | null; activeMarket: string; marketQuotes: Record<string, MarketQuote>; onNavigate: (tool: string, botId?: 'diagnosis' | 'recovery') => void; onTradeSettled: () => Promise<void> }) {
  const definition = getVolatilityDefinition(getMarketDefinition(activeMarket).name);
  const quote = marketQuotes[definition.symbol];
  const [loaded, setLoaded] = useState(false);
  const [selectedBot, setSelectedBot] = useState<'diagnosis' | 'recovery'>('diagnosis');

  return (
    <section className="quick-bot-workspace">
      <div className="quick-bot-tabs" role="tablist" aria-label="Quick bots">
        <button type="button" role="tab" aria-selected={selectedBot === 'diagnosis'} className={selectedBot === 'diagnosis' ? 'is-active' : ''} onClick={() => setSelectedBot('diagnosis')}>Diagnosis Bot</button>
        <button type="button" role="tab" aria-selected={selectedBot === 'recovery'} className={selectedBot === 'recovery' ? 'is-active' : ''} onClick={() => setSelectedBot('recovery')}>Recovery Bot</button>
      </div>
      {selectedBot === 'recovery' ? <RecoveryBotView accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} marketQuotes={marketQuotes} onTradeSettled={onTradeSettled} /> : <section className="quick-bot-view">
        <div className="quick-bot-card">
          <div className="quick-bot-card-top">
            <div className="quick-bot-pin">⌑</div>
            <div><span className="quick-bot-kicker">DIAGNOSIS BOT</span><h1>Diagnosis Bot</h1></div>
            <span className="quick-bot-pill">QUICK BOT</span>
          </div>
          <p>Run a focused digit strategy on the selected volatility market with editable stake, run count, and risk limits.</p>
          <div className="quick-bot-market"><span>{definition.name}</span><strong>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</strong><small>{quote?.status === 'live' ? 'LIVE' : quote?.price !== null ? 'LAST QUOTE' : 'CONNECTING'}</small></div>
           <button type="button" className="quick-bot-load" onClick={() => { setLoaded(true); onNavigate('Free Bots', 'diagnosis'); }}>OPEN DIAGNOSIS BOT <span>⇩</span></button>
          {loaded && <p className="quick-bot-loaded" role="status">Diagnosis Bot opened in Free Bots.</p>}
        </div>
      </section>}
    </section>
  );
}

function BulkTraderView({ activeMarket, setActiveMarket, marketQuotes, accountMode, currency, onTradeSettled }: { activeMarket: string; setActiveMarket: (market: string) => void; marketQuotes: Record<string, MarketQuote>; accountMode: 'DEMO' | 'REAL'; currency: string; onTradeSettled: () => Promise<void> }) {
  const activeDefinition = getMarketDefinition(activeMarket);
  const activeQuote = marketQuotes[activeDefinition.symbol];
  const [tradeType, setTradeType] = useState<'Even/Odd' | 'Rise/Fall' | 'Over/Under'>('Even/Odd');
  const [numberOfTicks, setNumberOfTicks] = useState('120');
  const [ticks, setTicks] = useState('1');
  const [stake, setStake] = useState('0.5');
  const [martingale, setMartingale] = useState('1');
  const [bulkTrades, setBulkTrades] = useState('5');
  const [autoTrader, setAutoTrader] = useState(false);
  const [reviewState, setReviewState] = useState('');
  const [scannerState, setScannerState] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [scannerResults, setScannerResults] = useState<BulkScanResult[]>([]);
  const [scannerDigits, setScannerDigits] = useState<Array<{ digit: number; percentage: number }>>([]);
  const [scannerMessage, setScannerMessage] = useState('Scan the selected live market before trading.');
  const [selectedScannerSymbol, setSelectedScannerSymbol] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [executionState, setExecutionState] = useState<'idle' | 'executing'>('idle');
  const [bulkRunProgress, setBulkRunProgress] = useState<{
    phase: 'idle' | 'scanning' | 'placing' | 'stopping' | 'complete' | 'stopped' | 'pending' | 'error';
    current: number;
    completed: number;
    total: number;
  }>({ phase: 'idle', current: 0, completed: 0, total: 0 });
  const [bulkTakeProfit, setBulkTakeProfit] = useState('50');
  const [bulkStopLoss, setBulkStopLoss] = useState('500');
  const [bulkTransactions, setBulkTransactions] = useState<ExecutedTrade[]>([]);
  const [liveBatchTrades, setLiveBatchTrades] = useState<ExecutedTrade[]>([]);
  const [bulkTransactionTab, setBulkTransactionTab] = useState<BotTransactionTab>('Transactions');
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const stopRequestedRef = useRef(false);
  const executionLockRef = useRef(false);
  const marketQuotesRef = useRef(marketQuotes);
  useEffect(() => { marketQuotesRef.current = marketQuotes; }, [marketQuotes]);
  useEffect(() => {
    setScannerResults([]);
    setScannerDigits([]);
    setSelectedScannerSymbol('');
    setScannerState('idle');
    setScannerMessage('Market or scan window changed. Scan the live feed again.');
  }, [activeMarket, tradeType, numberOfTicks]);
  useEffect(() => () => {
    if (executionLockRef.current) stopRequestedRef.current = true;
  }, []);
  useEffect(() => {
    const handleOpenScanner = () => setScannerOpen(true);
    window.addEventListener('bulk-ai-open', handleOpenScanner);
    return () => window.removeEventListener('bulk-ai-open', handleOpenScanner);
  }, []);
  const digitHistory = useMemo(() => (activeQuote?.ticks ?? []).slice(-12).map((value) => {
    const formatted = formatMarketPrice(value, activeQuote?.pipSize ?? 2);
    return Number(formatted.replace(/\D/g, '').slice(-1));
  }), [activeQuote]);
  const latestBulkDigit = digitHistory.at(-1)?.toString() ?? '';
  const liveChart = useMemo(() => {
    const values = (activeQuote?.ticks ?? []).slice(-28);
    if (values.length < 2) return null;
    const low = Math.min(...values);
    const span = Math.max(...values) - low || 1;
    const coordinates = values.map((value, index) => ({
      x: 12 + (index / (values.length - 1)) * 456,
      y: 108 - ((value - low) / span) * 88,
    }));
    return {
      points: coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
      lastY: coordinates.at(-1)?.y ?? 64,
      count: values.length,
    };
  }, [activeQuote?.ticks]);
  const currentTickChange = activeQuote?.price !== null
    && activeQuote?.price !== undefined
    && activeQuote.previousPrice !== null
    && activeQuote.previousPrice !== undefined
    && activeQuote.previousPrice !== 0
    ? ((activeQuote.price - activeQuote.previousPrice) / activeQuote.previousPrice) * 100
    : null;
  const digitCounts = useMemo(() => {
    const counts = Array.from({ length: 10 }, () => 0);
    digitHistory.forEach((digit) => { if (Number.isFinite(digit)) counts[digit] += 1; });
    return counts.map((count) => ({ count, percentage: digitHistory.length ? (count / digitHistory.length) * 100 : null }));
  }, [digitHistory]);
  const scanMarkets = () => {
    if (scannerState === 'scanning' || executionLockRef.current) return;
    const preferredDefinition = activeDefinition;
    const scanWindow = Number.parseInt(numberOfTicks, 10);
    if (!Number.isInteger(scanWindow) || scanWindow < MIN_BULK_SCAN_TICKS || scanWindow > 999) {
      setScannerMessage(`Set the scan window to ${MIN_BULK_SCAN_TICKS}–999 ticks.`);
      setReviewState(`Set a live scan window from ${MIN_BULK_SCAN_TICKS} to 999 ticks.`);
      setScannerState('complete');
      setScannerResults([]);
      return;
    }
    if (tradeType !== 'Rise/Fall' && preferredDefinition.family !== 'volatility') {
      const message = 'Even/Odd and Over/Under scans need a Volatility market. Select one before scanning.';
      setScannerMessage(message);
      setReviewState(message);
      setScannerState('complete');
      setScannerResults([]);
      setScannerDigits([]);
      return;
    }
    setScannerState('scanning');
    setScannerOpen(true);
    setBatchResult(null);
    setScannerMessage(`Reading ${preferredDefinition.name} from the live Deriv feed…`);
    setReviewState('');
    window.setTimeout(() => {
      const analysis = analyzeBulkMarket(
        preferredDefinition,
        marketQuotesRef.current[preferredDefinition.symbol],
        tradeType,
        scanWindow,
      );
      setScannerDigits(analysis.digitDistribution);
      setScannerResults(analysis.result ? [analysis.result] : []);
      setSelectedScannerSymbol(preferredDefinition.symbol);
      setScannerState('complete');
      setScannerMessage(analysis.message);
      if (analysis.result?.hasSignal && autoTrader) {
        setReviewState(`Live scan ready · ${analysis.result.side} observed in ${analysis.result.sampleSize} ticks.`);
        void handleExecuteAiBatch(analysis.result, true);
      } else if (analysis.result && !analysis.result.hasSignal) {
        setReviewState('The scan halves disagree. Auto-run is unavailable; review the sample or choose a side manually.');
      } else {
        setReviewState(analysis.message);
      }
     }, 180);
  };
  const openScanner = () => {
    setScannerOpen(true);
    setBatchResult(null);
  };
  const selectedScannerResult = scannerResults.find((result) => result.definition.symbol === selectedScannerSymbol);
  const liveBatchProfit = totalTradeProfit(liveBatchTrades);
  const scanProgress = bulkRunProgress.total
    ? Math.min(100, (bulkRunProgress.completed / bulkRunProgress.total) * 100)
    : 0;
  const progressLabel = {
    idle: 'READY',
    scanning: 'SCANNING',
    placing: 'PLACING TRADE',
    stopping: 'STOPPING',
    complete: 'COMPLETE',
    stopped: 'STOPPED',
    pending: 'SETTLEMENT PENDING',
    error: 'STOPPED ON ERROR',
  }[bulkRunProgress.phase];
  const handleExecuteAiBatch = async (scanResult?: BulkScanResult, adaptToLatestScan = false) => {
    if (executionLockRef.current) {
      stopRequestedRef.current = true;
      setBulkRunProgress((current) => ({ ...current, phase: 'stopping' }));
      setReviewState('Stop requested · waiting for the current trade to settle…');
      return;
    }
    const executionResult = scanResult ?? selectedScannerResult;
    if (!executionResult) return;
    const amount = Number(stake);
    const duration = Number(ticks);
    const count = Number(bulkTrades);
    const scanWindow = Number.parseInt(numberOfTicks, 10);
    const martingaleMultiplier = configuredMultiplier(martingale);
    const takeProfitLimit = Number(bulkTakeProfit);
    const stopLossLimit = Number(bulkStopLoss);
    if (!Number.isInteger(scanWindow) || scanWindow < MIN_BULK_SCAN_TICKS || scanWindow > 999) {
      setReviewState(`Set a live scan window from ${MIN_BULK_SCAN_TICKS} to 999 ticks.`);
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.35 || amount > 10_000) {
      setReviewState(`Enter a stake from ${currency} 0.35 to 10,000.`);
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
      setReviewState('Enter a whole-number contract duration from 1 to 365 ticks.');
      return;
    }
    if (!Number.isInteger(count) || count < 1) {
      setReviewState('Enter a whole number of bulk trades, starting at 1.');
      return;
    }
    if (martingaleMultiplier === null) {
      setReviewState('Enter a Martingale multiplier of 1 or greater.');
      return;
    }
    if (!Number.isFinite(takeProfitLimit) || takeProfitLimit < 0 || !Number.isFinite(stopLossLimit) || stopLossLimit < 0) {
      setReviewState(`Enter valid ${currency} Take Profit and Stop Loss limits.`);
      return;
    }
    if (tradeType !== 'Rise/Fall' && executionResult.definition.family !== 'volatility') {
      setReviewState('Even/Odd and Over/Under contracts require a Volatility market.');
      return;
    }
    executionLockRef.current = true;
    stopRequestedRef.current = false;
    setExecutionState('executing');
    setBatchResult(null);
    setLiveBatchTrades([]);
    setBulkRunProgress({ phase: 'scanning', current: 1, completed: 0, total: count });
    setReviewState(`Scanning ${executionResult.definition.name} before entry 1 of ${count}…`);
    let completed = 0;
    let firstError = '';
    let cumulativeProfit = 0;
    let stopReason = '';
    let consecutiveLosses = 0;
    let totalPlaced = 0;
    const settledTrades: ExecutedTrade[] = [];
    let pendingSettlementTrade: ExecutedTrade | null = null;
    const recordTrade = (trade: ExecutedTrade) => {
      settledTrades.push(trade);
      setLiveBatchTrades((current) => [...current, trade]);
      setBulkTransactions((current) => [...current, trade]);
      setBulkTransactionTab('Transactions');
      void Promise.resolve().then(() => onTradeSettled()).catch(() => undefined);
    };
    let scannedEntries = 0;
    for (let index = 0; index < count; index += 1) {
      if (stopRequestedRef.current) {
        stopReason = 'Bot stopped by user.';
        break;
      }
      setBulkRunProgress({ phase: 'scanning', current: index + 1, completed, total: count });
      setReviewState(`Scanning ${executionResult.definition.name} before entry ${index + 1}/${count}…`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      if (stopRequestedRef.current) {
        stopReason = 'Bot stopped by user.';
        break;
      }
      const analysis = analyzeBulkMarket(
        executionResult.definition,
        marketQuotesRef.current[executionResult.definition.symbol],
        tradeType,
        scanWindow,
      );
      setScannerDigits(analysis.digitDistribution);
      setScannerResults(analysis.result ? [analysis.result] : []);
      setSelectedScannerSymbol(executionResult.definition.symbol);
      setScannerState('complete');
      setScannerMessage(analysis.message);
      scannedEntries += 1;
      if (!analysis.result) {
        firstError = analysis.message;
        setBulkRunProgress({ phase: 'error', current: index + 1, completed, total: count });
        break;
      }
      if (adaptToLatestScan && !analysis.result.hasSignal) {
        stopReason = `No clear recent majority; stopped before entry ${index + 1}.`;
        setReviewState(`${analysis.message} No automatic entry was placed.`);
        break;
      }
      const entrySignal: BulkScanResult = adaptToLatestScan
        ? analysis.result
        : {
            ...analysis.result,
            side: executionResult.side,
            contractType: executionResult.contractType,
            barrier: executionResult.barrier,
            rationale: `${analysis.result.rationale} Trader-selected side: ${executionResult.side}.`,
          };
      setBulkRunProgress({ phase: 'placing', current: index + 1, completed, total: count });
      setReviewState(`Entry ${index + 1}/${count} · scanned ${analysis.sampleSize} live ticks · ${adaptToLatestScan ? `signal ${entrySignal.side}` : `selected ${entrySignal.side}`} · placing and waiting for settlement…`);
      try {
        const tradeAmount = nextMartingaleStake(amount, martingaleMultiplier, consecutiveLosses);
        if (!Number.isFinite(tradeAmount) || tradeAmount < 0.35 || tradeAmount > 10_000) {
          throw new Error(`Martingale stake ${tradeAmount.toFixed(2)} is outside the supported ${currency} 0.35–10,000 range.`);
        }
        const rawTrade = await executeDerivTrade<ExecutedTrade>({
          symbol: entrySignal.definition.symbol,
          contractType: entrySignal.contractType,
          amount: tradeAmount,
          duration,
          durationUnit: 't',
          currency,
          barrier: entrySignal.barrier,
          mode: accountMode === 'REAL' ? 'real' : 'demo',
        });
        let settledTrade: ExecutedTrade = {
          ...normalizeExecutedTrade(rawTrade),
          marketName: entrySignal.definition.name,
          mode: accountMode,
        };
        if (!settledTrade.settlementPending && !settledTrade.orderStatusUnknown && resolvedTradeProfit(settledTrade) === null) {
          settledTrade = { ...settledTrade, settlementPending: true };
        }
        if (settledTrade.settlementPending || settledTrade.orderStatusUnknown) {
          pendingSettlementTrade = settledTrade;
          if (!settledTrade.orderStatusUnknown) totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
          recordTrade(settledTrade);
          setBulkRunProgress({ phase: 'pending', current: index + 1, completed, total: count });
          break;
        }
        const exactProfit = resolvedTradeProfit(settledTrade);
        if (exactProfit === null) {
          pendingSettlementTrade = { ...settledTrade, settlementPending: true };
          recordTrade(pendingSettlementTrade);
          setBulkRunProgress({ phase: 'pending', current: index + 1, completed, total: count });
          break;
        }
        completed += 1;
        cumulativeProfit += exactProfit;
        totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
        consecutiveLosses = exactProfit < 0 ? consecutiveLosses + 1 : 0;
        recordTrade(settledTrade);
        setBulkRunProgress({ phase: 'scanning', current: index + 2, completed, total: count });
        setReviewState(`Entry ${index + 1}/${count} settled · ${formatSignedProfit(exactProfit)} ${settledTrade.currency ?? currency} · scanning next entry…`);
        if (takeProfitLimit > 0 && cumulativeProfit >= takeProfitLimit) {
          stopReason = `Take Profit reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
        if (stopLossLimit > 0 && cumulativeProfit <= -stopLossLimit) {
          stopReason = `Stop Loss reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
      } catch (error) {
        firstError = error instanceof Error ? error.message : 'Live trade request failed.';
        break;
      }
    }
    setExecutionState('idle');
    executionLockRef.current = false;
    const progressPhase = pendingSettlementTrade ? 'pending' : firstError ? 'error' : stopReason ? 'stopped' : 'complete';
    setBulkRunProgress({ phase: progressPhase, current: Math.min(count, scannedEntries), completed, total: count });
    const batchProfit = cumulativeProfit;
    if (completed > 0 || pendingSettlementTrade) setBatchResult({
      profit: batchProfit,
      amount: totalPlaced,
      trades: completed + (pendingSettlementTrade ? 1 : 0),
      currency,
      settlementPending: Boolean(pendingSettlementTrade),
      orderStatusUnknown: Boolean(pendingSettlementTrade?.orderStatusUnknown),
      tradeResults: settledTrades,
    });
    if (pendingSettlementTrade) {
      setReviewState(`${unresolvedTradeMessage(pendingSettlementTrade)} The batch stopped to prevent another order.`);
    } else if (firstError) {
      setReviewState(`${completed}/${count} trades settled before stopping: ${firstError}`);
    } else if (stopReason) {
      setReviewState(`${completed}/${count} trades settled · ${stopReason} · ${formatSignedProfit(batchProfit)} ${currency}`);
    } else {
      setReviewState(`${completed}/${count} trades settled · ${formatSignedProfit(batchProfit)} ${currency}`);
    }
  };
  const leftChoice = tradeType === 'Even/Odd' ? 'Even' : tradeType === 'Rise/Fall' ? 'Rise' : 'Over';
  const rightChoice = tradeType === 'Even/Odd' ? 'Odd' : tradeType === 'Rise/Fall' ? 'Fall' : 'Under';
  const executeBulkChoice = (choice: 'left' | 'right') => {
    const side = choice === 'left' ? leftChoice : rightChoice;
    if (tradeType !== 'Rise/Fall' && activeDefinition.family !== 'volatility') {
      setReviewState('Even/Odd and Over/Under contracts require a Volatility market. Select one before placing the batch.');
      return;
    }
    if (!activeQuote) {
      setReviewState('Waiting for the selected market quote before placing the batch.');
      return;
    }
    const contractType: BulkScanResult['contractType'] = tradeType === 'Rise/Fall'
      ? side === 'Rise' ? 'CALL' : 'PUT'
      : tradeType === 'Over/Under'
        ? side === 'Over' ? 'DIGITOVER' : 'DIGITUNDER'
        : side === 'Even' ? 'DIGITEVEN' : 'DIGITODD';
    const result: BulkScanResult = {
      definition: activeDefinition,
      quote: activeQuote,
      side,
      contractType,
      observedShare: 0,
      recentObservedShare: 0,
      windowAgreement: false,
      hasSignal: false,
      sampleSize: digitHistory.length,
      rationale: `Trader-selected ${side} batch.`,
      barrier: tradeType === 'Over/Under' ? 4 : undefined,
    };
    void handleExecuteAiBatch(result, false);
  };
  function openBulkHistoryDetail() {
    if (!bulkTransactions.length) return;
    const profit = totalTradeProfit(bulkTransactions);
    if (profit === null) return;
    setBatchResult({
      profit,
      amount: bulkTransactions.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0),
      trades: bulkTransactions.length,
      currency,
      tradeResults: bulkTransactions,
    });
  }

  return (
    <section className="bulk-trader-view ptx-bulk" aria-label="Bulk Trader">
      <div className="ptx-shell">
        <header className="ptx-topbar">
          <div className="ptx-brand">
            <span className="ptx-brand-mark"><BarChart3 size={16} aria-hidden="true" /></span>
            <span className="ptx-brand-word">protradersfx.com</span>
          </div>
          <div className="ptx-session"><i className={activeQuote?.status === 'live' ? 'is-live' : ''} /> DERIV WORKSPACE <span>/</span> BULK TRADER</div>
          <span className="ptx-account-tag">{accountMode} · {currency}</span>
        </header>
        <div className="ptx-ticker" role="region" aria-label="Live Deriv market quotes">
          {MARKET_DEFINITIONS.slice(0, 9).map(({ name, symbol }) => {
            const quote = marketQuotes[symbol];
            const quoteDotClass = quote?.status === 'live' ? 'is-live' : quote?.status === 'error' ? 'is-error' : '';
            return <div className="ptx-ticker-item" key={symbol} aria-label={`${name}: ${quote?.status === 'live' ? 'live' : quote?.price !== null && quote?.price !== undefined ? 'last quote' : 'connecting'}, ${formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}`}>
              <i className={`ptx-ticker-dot ${quoteDotClass}`} />
              <b>{name.replace('Volatility ', 'VOL ').replace(' Index', '')}</b>
              <em>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</em>
            </div>;
          })}
        </div>
        <section className="ptx-heading">
          <div>
            <div className="ptx-eyebrow"><span>TRADING WORKSPACE</span><span>/</span><span>LIVE MARKET · BATCH EXECUTION</span></div>
            <h1>Bulk Trader</h1>
            <p>Review live market context, choose one side, and follow each entry through settlement.</p>
          </div>
          <div className="ptx-heading-actions">
            <span className="ptx-connection"><i className={activeQuote?.status === 'live' ? 'is-live' : ''} />{activeQuote?.status === 'live' ? 'DERIV FEED LIVE' : activeQuote?.price !== null && activeQuote?.price !== undefined ? 'LAST QUOTE' : activeQuote?.status === 'error' ? 'FEED ERROR' : 'CONNECTING'}</span>
            <span className="ptx-account-tag">{accountMode} ACCOUNT</span>
          </div>
        </section>
        <form className="ptx-workspace" onSubmit={(event) => event.preventDefault()}>
          <div className="ptx-left">
            <section className="ptx-card ptx-market-card" aria-label="Market context and digit scan">
              <div className="ptx-card-head">
                <div className="ptx-card-title"><span className="ptx-step">01</span> Market context</div>
                <span className="ptx-card-meta">OFFICIAL DERIV QUOTES</span>
              </div>
              <div className="ptx-market-overview">
                <div className="ptx-market-info">
                  <label><span>MARKET</span><select disabled={executionState === 'executing' || scannerState === 'scanning'} value={activeMarket} onChange={(event) => setActiveMarket(event.target.value)} data-testid="bulk-market">{MARKET_DEFINITIONS.map(({ label, name }) => <option key={label} value={label}>{name}</option>)}</select></label>
                  <div className="ptx-quote-label">{activeQuote?.status === 'live' ? 'LIVE QUOTE' : activeQuote?.price !== null && activeQuote?.price !== undefined ? 'LAST QUOTE' : 'WAITING FOR QUOTE'}</div>
                  <div className="ptx-quote">
                    {formatMarketPrice(activeQuote?.price ?? null, activeQuote?.pipSize ?? 2)}
                    {currentTickChange !== null && <span className={`ptx-quote-change ${currentTickChange < 0 ? 'is-negative' : ''}`}>{currentTickChange >= 0 ? '+' : ''}{currentTickChange.toFixed(2)}%</span>}
                  </div>
                  <div className="ptx-quote-foot">{activeDefinition.name} · {activeQuote?.status === 'live' ? 'streaming' : activeQuote?.status ?? 'connecting'}</div>
                </div>
                <div className="ptx-market-chart">
                  <div className="ptx-chart-top"><strong>Market trace</strong><span>{liveChart ? `LAST ${liveChart.count} TICKS` : 'LIVE TICKS'}</span></div>
                  {liveChart ? <svg className="ptx-chart-svg" viewBox="0 0 480 128" preserveAspectRatio="none" role="img" aria-label={`Live price trace for ${activeDefinition.name}`}>
                    <g className="ptx-chart-grid"><line x1="0" y1="20" x2="480" y2="20" /><line x1="0" y1="64" x2="480" y2="64" /><line x1="0" y1="108" x2="480" y2="108" /></g>
                    <polyline className="ptx-chart-line" points={liveChart.points} />
                    <circle className="ptx-chart-dot" cx="468" cy={liveChart.lastY} r="4" />
                  </svg> : <div className="ptx-chart-empty">{activeQuote?.status === 'live' ? 'Waiting for enough live ticks to draw the market trace.' : 'Live market trace will appear when Deriv quotes connect.'}</div>}
                  <span className="ptx-chart-axis">{liveChart?.count ?? 0} recent ticks</span>
                </div>
              </div>
              <div className="ptx-signal-row">
                <div className="ptx-trade-type"><label><span>TRADE TYPE</span><select disabled={executionState === 'executing' || scannerState === 'scanning'} value={tradeType} onChange={(event) => setTradeType(event.target.value as typeof tradeType)} data-testid="bulk-trade-type"><option>Even/Odd</option><option>Rise/Fall</option><option>Over/Under</option></select></label></div>
                <div className="ptx-scan-window">
                  <label className="ptx-field"><span>SCAN WINDOW <small>MIN {MIN_BULK_SCAN_TICKS}</small></span><input className="ptx-input" inputMode="numeric" min={MIN_BULK_SCAN_TICKS} max="999" disabled={executionState === 'executing' || scannerState === 'scanning'} value={numberOfTicks} onChange={(event) => setNumberOfTicks(event.target.value.replace(/\D/g, '').slice(0, 3))} data-testid="bulk-scan-window" /></label>
                  <button type="button" className="ptx-button" onClick={openScanner} disabled={scannerState === 'scanning' || executionState === 'executing'} data-testid="bulk-open-scanner"><Sparkles size={13} aria-hidden="true" /> {scannerState === 'scanning' ? 'SCANNING…' : 'OPEN SCANNER'}</button>
                </div>
              </div>
              <div className="ptx-digit-section">
                <div className="ptx-digit-heading"><span>LIVE DIGIT DISTRIBUTION</span><b>{digitHistory.length} RECENT TICKS</b></div>
                <div className="ptx-digit-bars" aria-label="Live tick digit distribution">
                  {digitCounts.map(({ percentage }, digit) => {
                    const highestShare = digitCounts.reduce((highest, item) => item.percentage !== null ? Math.max(highest, item.percentage) : highest, 0);
                    const leading = percentage !== null && percentage > 0 && percentage === highestShare;
                    return <div key={digit} className={`ptx-digit ${leading ? 'is-leading' : ''}`} style={{ '--bar': `${Math.max(0, percentage ?? 0)}%` } as React.CSSProperties}><strong>{digit}</strong><span>{percentage === null ? '—' : `${percentage.toFixed(1)}%`}</span></div>;
                  })}
                </div>
                <div className="ptx-recent"><span>RECENT DIGITS</span>{digitHistory.length ? digitHistory.slice(-12).map((digit, index) => <b key={`${digit}-${index}`} aria-label={`Digit ${digit}`}>{digit}</b>) : <small>Waiting for live tick history</small>}</div>
              </div>
            </section>
            <section className="ptx-card" aria-label="Bulk contract parameters">
              <div className="ptx-card-head"><div className="ptx-card-title"><span className="ptx-step">02</span> Contract parameters</div><span className="ptx-card-meta">PER ENTRY</span></div>
              <div className="ptx-contract-grid">
                <label className="ptx-field"><span>CONTRACT DURATION <small>TICKS</small></span><input className="ptx-input" inputMode="numeric" disabled={executionState === 'executing'} value={ticks} onChange={(event) => setTicks(event.target.value.replace(/\D/g, '').slice(0, 3) || '1')} /></label>
                <label className="ptx-field"><span>STAKE <small>{currency}</small></span><input className="ptx-input" inputMode="decimal" disabled={executionState === 'executing'} value={stake} onChange={(event) => setStake(event.target.value)} /></label>
                <label className="ptx-field"><span>MARTINGALE <small>MULTIPLIER</small></span><input className="ptx-input" inputMode="decimal" disabled={executionState === 'executing'} value={martingale} onChange={(event) => setMartingale(event.target.value)} /></label>
                <label className="ptx-field"><span>BULK ENTRIES <small>COUNT</small></span><input className="ptx-input" inputMode="numeric" disabled={executionState === 'executing'} value={bulkTrades} onChange={(event) => setBulkTrades(event.target.value)} /></label>
                <label className="ptx-field"><span>TAKE PROFIT <small>{currency}</small></span><input className="ptx-input" inputMode="decimal" disabled={executionState === 'executing'} value={bulkTakeProfit} onChange={(event) => setBulkTakeProfit(event.target.value)} /></label>
                <label className="ptx-field"><span>STOP LOSS <small>{currency}</small></span><input className="ptx-input" inputMode="decimal" disabled={executionState === 'executing'} value={bulkStopLoss} onChange={(event) => setBulkStopLoss(event.target.value)} /></label>
              </div>
              <p className="ptx-risk-note"><span aria-hidden="true">!</span><span>Sequential entries. Stops on error, unsettled trade, Take Profit, Stop Loss, or your Stop command.</span></p>
            </section>
            <section className="ptx-card" aria-label="Choose a trade side">
              <div className="ptx-card-head"><div className="ptx-card-title"><span className="ptx-step">03</span> Choose a side</div><span className="ptx-card-meta">{bulkTrades || '0'} ENTRIES · SAME SIDE</span></div>
              <div className="ptx-actions">
                <button type="button" className={`ptx-action ${/under|odd|fall/i.test(leftChoice) ? 'alt' : ''}`} onClick={() => executeBulkChoice('left')} disabled={executionState === 'executing' || scannerState === 'scanning'} data-testid="bulk-execute-left">
                  <span className="ptx-action-title">{tradeType === 'Even/Odd' ? <CircleDollarSign size={14} /> : /rise|over/i.test(leftChoice) ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{leftChoice}</span>
                  <strong>{currency} {stake || '0.00'}</strong>
                  <small>PLACE {bulkTrades || '0'} TRADE{bulkTrades === '1' ? '' : 'S'}</small>
                </button>
                <button type="button" className={`ptx-action ${/under|odd|fall/i.test(rightChoice) ? 'alt' : ''}`} onClick={() => executeBulkChoice('right')} disabled={executionState === 'executing' || scannerState === 'scanning'} data-testid="bulk-execute-right">
                  <span className="ptx-action-title">{tradeType === 'Even/Odd' ? <CircleDollarSign size={14} /> : /rise|over/i.test(rightChoice) ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{rightChoice}</span>
                  <strong>{currency} {stake || '0.00'}</strong>
                  <small>PLACE {bulkTrades || '0'} TRADE{bulkTrades === '1' ? '' : 'S'}</small>
                </button>
              </div>
              <div className="ptx-action-foot">
                <button type="button" className="ptx-toggle-wrap" onClick={() => setAutoTrader(!autoTrader)} disabled={executionState === 'executing' || scannerState === 'scanning'} data-testid="bulk-auto-mode" aria-checked={autoTrader} role="switch"><span className="ptx-toggle" aria-hidden="true" />Auto-execute {autoTrader ? 'on' : 'off'}</button>
                {executionState === 'executing' && <button type="button" className="ptx-button" onClick={() => void handleExecuteAiBatch()} data-testid="bulk-stop-run">STOP AFTER CURRENT</button>}
                <span className="ptx-local-label">LIVE DERIV ORDERS</span>
                {reviewState && <span className="ptx-action-status" role="status" data-testid="bulk-review-status">{reviewState}</span>}
              </div>
            </section>
          </div>
          <aside className="ptx-right">
            <section className="ptx-card ptx-monitor" aria-live="polite" data-testid="bulk-live-monitor">
              <div className="ptx-monitor-top">
                <div className="ptx-monitor-title">
                  <div><span>04 / EXECUTION MONITOR</span><strong>{scannerMessage}</strong></div>
                  <b className="ptx-status-chip">{executionState === 'executing' ? progressLabel : scannerState === 'scanning' ? 'SCANNING' : progressLabel}</b>
                </div>
                {bulkRunProgress.total > 0 && <div className="ptx-progress" role="progressbar" aria-valuemin={0} aria-valuemax={bulkRunProgress.total} aria-valuenow={bulkRunProgress.completed} aria-label={`${bulkRunProgress.completed} of ${bulkRunProgress.total} trades settled`}><span style={{ width: `${scanProgress}%` }} /></div>}
                <div className="ptx-metrics">
                  <div className="ptx-metric"><span>ENTRY</span><strong>{bulkRunProgress.total ? `${bulkRunProgress.current}/${bulkRunProgress.total}` : '—'}</strong></div>
                  <div className="ptx-metric"><span>SETTLED</span><strong>{bulkRunProgress.total ? `${bulkRunProgress.completed}/${bulkRunProgress.total}` : '0'}</strong></div>
                  <div className="ptx-metric"><span>BATCH NET P/L</span><strong className={liveBatchProfit === null ? '' : liveBatchProfit < 0 ? 'bad' : 'good'}>{liveBatchTrades.length ? liveBatchProfit === null ? 'PENDING' : `${formatSignedProfit(liveBatchProfit)} ${currency}` : '—'}</strong></div>
                </div>
              </div>
              {selectedScannerResult && <div className="ptx-scan-reading">
                <div><span>{selectedScannerResult.windowAgreement ? 'WINDOWS AGREE' : 'WINDOWS DIFFER'}</span><small>Observed sample · not a forecast</small></div>
                <strong>{selectedScannerResult.side}</strong>
                <b>{selectedScannerResult.recentObservedShare.toFixed(1)}%</b>
                <small>{selectedScannerResult.sampleSize} live ticks · {selectedScannerResult.rationale}</small>
              </div>}
              <div className="ptx-results">
                <div className="ptx-results-head"><span>THIS BATCH · LATEST FIRST</span><b>{liveBatchTrades.length} {liveBatchTrades.length === 1 ? 'ENTRY' : 'ENTRIES'}</b></div>
                {liveBatchTrades.length > 0 ? liveBatchTrades.slice(-5).reverse().map((trade, index) => {
                  const tradeProfit = resolvedTradeProfit(trade);
                  const tradeNumber = liveBatchTrades.length - index;
                  return <div className="ptx-result-row" key={`${trade.contractId ?? 'pending'}-${tradeNumber}`} data-testid={`bulk-live-entry-${tradeNumber}`}>
                    <span><b>#{tradeNumber} · {tradeContractLabel(trade)}</b><small>E {formatTradePoint(trade.entrySpot)} · X {formatTradePoint(trade.exitSpot)}</small><TradeMoneyDetails trade={trade} fallbackCurrency={currency} /></span>
                    <strong className={trade.orderStatusUnknown || trade.settlementPending ? 'is-pending' : tradeProfit !== null && tradeProfit < 0 ? 'is-loss' : ''}>{trade.orderStatusUnknown ? 'STATUS UNKNOWN' : trade.settlementPending ? 'PENDING' : `${formatSignedProfit(tradeProfit)} ${trade.currency ?? currency}`}</strong>
                  </div>;
                }) : <p className="ptx-empty">{executionState === 'executing' ? 'Scanning live ticks before entry one.' : 'Trade entries and settled P/L will appear here as the batch runs.'}</p>}
              </div>
            </section>
            <div className="ptx-disclaimer"><span aria-hidden="true">!</span><div>Digit readings describe the selected tick sample; they are not a forecast or win probability. Trading can lead to losses.</div></div>
          </aside>
        </form>
        <BotTransactionPanel
          trades={bulkTransactions}
          currency={currency}
          running={executionState === 'executing'}
          activeTab={bulkTransactionTab}
          onTabChange={setBulkTransactionTab}
          onViewDetail={openBulkHistoryDetail}
          historyLabel="CURRENT SESSION"
          sectionLabel="Bulk trade history"
          runningLabel="Batch is executing sequentially"
          emptyMessage="Settled Bulk Trader trades will appear here."
        />
      </div>
      {scannerOpen && (
        <div className="ptx-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScannerOpen(false); }}>
          <section className="ptx-modal" role="dialog" aria-modal="true" aria-labelledby="ai-scanner-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="ptx-modal-bar"><span>PROTRADERS FX / DERIV LIVE SCAN</span><button className="ptx-close" type="button" onClick={() => setScannerOpen(false)} aria-label="Close market scanner"><X size={16} /></button></div>
            <div className="ptx-modal-body">
              <span className="ptx-modal-kicker">MARKET REVIEW · LIVE TICK SAMPLE</span>
              <h2 id="ai-scanner-title">Market scan</h2>
              <p className="ptx-modal-intro">Review the selected market and batch settings. Tick patterns are observations, not contract win odds.</p>
              <div className="ptx-modal-grid">
                <label><span>{tradeType === 'Rise/Fall' ? 'MARKET' : 'VOLATILITY MARKET'}</span><select disabled={executionState === 'executing'} value={activeMarket} onChange={(event) => setActiveMarket(event.target.value)}>{MARKET_DEFINITIONS.map(({ label, name, family }) => <option key={label} value={label} disabled={tradeType !== 'Rise/Fall' && family !== 'volatility'}>{name}</option>)}</select></label>
                <label><span>STAKE · {currency}</span><input inputMode="decimal" disabled={executionState === 'executing'} value={stake} onChange={(event) => setStake(event.target.value)} /></label>
                <label><span>MARTINGALE ×</span><input inputMode="decimal" disabled={executionState === 'executing'} value={martingale} onChange={(event) => setMartingale(event.target.value)} /></label>
                <label><span>BULK ENTRIES</span><input inputMode="numeric" disabled={executionState === 'executing'} value={bulkTrades} onChange={(event) => setBulkTrades(event.target.value)} /></label>
                <label><span>TAKE PROFIT · {currency}</span><input inputMode="decimal" disabled={executionState === 'executing'} value={bulkTakeProfit} onChange={(event) => setBulkTakeProfit(event.target.value)} /></label>
                <label><span>STOP LOSS · {currency}</span><input inputMode="decimal" disabled={executionState === 'executing'} value={bulkStopLoss} onChange={(event) => setBulkStopLoss(event.target.value)} /></label>
              </div>
              <div className="ptx-scanner-market"><span>{activeQuote?.status === 'live' ? 'LIVE MARKET' : 'MARKET STATUS'}</span><b>{scannerState === 'complete' && selectedScannerResult ? selectedScannerResult.definition.name : activeDefinition.name} · {activeQuote?.status ?? 'connecting'}</b></div>
              <div className="ptx-modal-status">
                <div><span>{scannerState === 'complete' ? selectedScannerResult?.windowAgreement ? 'WINDOWS AGREE' : 'MIXED WINDOW REVIEW' : scannerState === 'scanning' ? 'SCANNING' : 'READY TO SCAN'}</span><strong>{scannerMessage}</strong></div>
                <Sparkles size={20} aria-hidden="true" />
              </div>
              {scannerState === 'complete' && selectedScannerResult && <div className="ptx-best"><span>OBSERVED SAMPLE · NOT WIN ODDS</span><b>{selectedScannerResult.side}</b><em>{selectedScannerResult.observedShare.toFixed(1)}% full · {selectedScannerResult.recentObservedShare.toFixed(1)}% recent · {selectedScannerResult.sampleSize} ticks</em><small>{selectedScannerResult.rationale}</small></div>}
              {scannerState === 'complete' && <div className="ptx-modal-digits" aria-label="Digit scan results">{scannerDigits.map(({ digit, percentage }) => <div key={digit} className={latestBulkDigit === String(digit) ? 'is-latest' : ''}><strong>{digit}</strong><span>{selectedScannerResult ? `${percentage.toFixed(1)}%` : '—'}</span></div>)}</div>}
              {liveBatchTrades.length > 0 && <div className="ptx-results">
                <div className="ptx-results-head"><span>ACTIVE BATCH · LATEST FIRST</span><b>{liveBatchTrades.length} ENTRIES</b></div>
                {liveBatchTrades.slice(-5).reverse().map((trade, index) => {
                  const tradeProfit = resolvedTradeProfit(trade);
                  const tradeNumber = liveBatchTrades.length - index;
                  return <div className="ptx-result-row" key={`scanner-${trade.contractId ?? 'pending'}-${tradeNumber}`}>
                    <span><b>#{tradeNumber} · {tradeContractLabel(trade)}</b><small>E {formatTradePoint(trade.entrySpot)} · X {formatTradePoint(trade.exitSpot)}</small><TradeMoneyDetails trade={trade} fallbackCurrency={currency} /></span>
                    <strong className={trade.orderStatusUnknown || trade.settlementPending ? 'is-pending' : tradeProfit !== null && tradeProfit < 0 ? 'is-loss' : ''}>{trade.orderStatusUnknown ? 'STATUS UNKNOWN' : trade.settlementPending ? 'PENDING' : `${formatSignedProfit(tradeProfit)} ${trade.currency ?? currency}`}</strong>
                  </div>;
                })}
              </div>}
              <TradeFigureStrip trades={bulkTransactions} currency={currency} />
              {bulkTransactions.length > 0 && <div className="ptx-review-status" aria-label="Bulk transaction count">{bulkTransactions.length} settled or pending transactions recorded in this session.</div>}
              {reviewState && <div className="ptx-review-status" role="status">{reviewState}</div>}
              <div className="ptx-modal-action">
                <button type="button" className={`ptx-button primary ${executionState === 'executing' ? 'is-stop' : ''}`} disabled={scannerState === 'scanning' && executionState !== 'executing'} onClick={(event) => { event.preventDefault(); if (executionState === 'executing') void handleExecuteAiBatch(); else if (scannerState === 'complete' && !autoTrader && selectedScannerResult?.hasSignal) void handleExecuteAiBatch(selectedScannerResult, true); else scanMarkets(); }} data-testid="bulk-scan-or-stop">{scannerState === 'scanning' ? 'SCANNING…' : executionState === 'executing' ? 'STOP AFTER CURRENT TRADE' : scannerState === 'complete' && !autoTrader && selectedScannerResult?.hasSignal ? 'RUN BOT' : scannerState === 'complete' ? 'SCAN AGAIN' : 'SCAN MARKET'}</button>
              </div>
            </div>
          </section>
        </div>
      )}
      <TradeResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </section>
  );
}

function RecoveryBotView({ accountMode, currency, balance, activeMarket, marketQuotes, onTradeSettled }: { accountMode: 'DEMO' | 'REAL'; currency: string; balance: number | null; activeMarket: string; marketQuotes: Record<string, MarketQuote>; onTradeSettled: () => Promise<void> }) {
  const { displayCurrency, rate } = useCurrencyDisplay();
  const [running, setRunning] = useState(false);
  const [proposalState, setProposalState] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle');
  const [proposalMessage, setProposalMessage] = useState('');
  const [summaryTab, setSummaryTab] = useState<'Summary' | 'Transactions' | 'Journal' | 'Results'>('Summary');
  const [lastTrade, setLastTrade] = useState<ExecutedTrade | null>(null);
  const [transactions, setTransactions] = useState<ExecutedTrade[]>([]);
  const [journalEntries, setJournalEntries] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [selectedBlock, setSelectedBlock] = useState('Trade parameters');
  const [stake, setStake] = useState('10');
  const [runCount, setRunCount] = useState('1');
  const [numberOfTicks, setNumberOfTicks] = useState('1');
  const [martingale, setMartingale] = useState('2');
  const [takeProfit, setTakeProfit] = useState('50');
  const [stopLoss, setStopLoss] = useState('500');
  const [consecutiveLosses, setConsecutiveLosses] = useState('5');
  const [recoveryMarket, setRecoveryMarket] = useState(() => getVolatilityDefinition(getMarketDefinition(activeMarket).name).name);
  const selectedDefinition = getVolatilityDefinition(recoveryMarket);
  const selectedQuote = marketQuotes[selectedDefinition.symbol];
  const stopRequestedRef = useRef(false);
  const recoveryExecutionLockRef = useRef(false);
  useEffect(() => () => { stopRequestedRef.current = true; }, []);

  useEffect(() => {
    setRecoveryMarket(getVolatilityDefinition(getMarketDefinition(activeMarket).name).name);
  }, [activeMarket]);

  const handleRun = async () => {
    if (recoveryExecutionLockRef.current) {
      stopRequestedRef.current = true;
      setProposalMessage('Stopping after the current trade settles…');
      return;
    }
    const amount = Number(stake);
    const durationTicks = Math.max(1, Math.floor(Number(numberOfTicks) || 1));
    const martingaleMultiplier = configuredMultiplier(martingale);
    const takeProfitLimit = Number(takeProfit);
    const stopLossLimit = Number(stopLoss);
    const configuredConsecutiveLosses = finiteNumber(consecutiveLosses);
    if (!Number.isFinite(amount) || amount < 0.35) {
      setProposalState('error');
      setProposalMessage(`Enter a stake of at least ${currency} 0.35.`);
      return;
    }
    if (martingaleMultiplier === null) {
      setProposalState('error');
      setProposalMessage('Enter a Martingale multiplier of 1 or greater.');
      return;
    }
    if (configuredConsecutiveLosses === null || configuredConsecutiveLosses < 1 || !Number.isInteger(configuredConsecutiveLosses)) {
      setProposalState('error');
      setProposalMessage('Enter a whole-number consecutive-loss limit of 1 or greater.');
      return;
    }
    if (!Number.isFinite(takeProfitLimit) || takeProfitLimit < 0 || !Number.isFinite(stopLossLimit) || stopLossLimit < 0) {
      setProposalState('error');
      setProposalMessage(`Enter valid ${currency} Take Profit and Stop Loss limits.`);
      return;
    }
    const consecutiveLossLimit = configuredConsecutiveLosses;
    const requestedRuns = Math.max(1, Math.floor(Number(runCount) || 1));
    stopRequestedRef.current = false;
    recoveryExecutionLockRef.current = true;
    setRunning(true);
    setBatchResult(null);
    setProposalState('requesting');
    setProposalMessage(`Running ${requestedRuns} OVER 7 trade${requestedRuns === 1 ? '' : 's'} on ${selectedDefinition.name}…`);
    let completed = 0;
    let failed = 0;
    let cumulativeProfit = 0;
    let stopReason = '';
    let lossStreak = 0;
    let totalPlaced = 0;
    const settledTrades: ExecutedTrade[] = [];
    let pendingSettlementTrade: ExecutedTrade | null = null;
    for (let runIndex = 0; runIndex < requestedRuns; runIndex += 1) {
      if (stopRequestedRef.current) {
        stopReason = 'Bot stopped by user.';
        break;
      }
      try {
        const tradeAmount = nextMartingaleStake(amount, martingaleMultiplier, lossStreak);
        const rawTrade = await executeDerivTrade<ExecutedTrade>({
          symbol: selectedDefinition.symbol,
          contractType: 'DIGITOVER',
          amount: tradeAmount,
          duration: durationTicks,
          durationUnit: 't',
          currency,
          barrier: 7,
          mode: accountMode === 'REAL' ? 'real' : 'demo',
        });
        const settledTrade: ExecutedTrade = {
          ...normalizeExecutedTrade(rawTrade),
          marketName: selectedDefinition.name,
          mode: accountMode,
        };
        if (settledTrade.settlementPending || settledTrade.orderStatusUnknown) {
          pendingSettlementTrade = settledTrade;
          totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
          settledTrades.push(settledTrade);
          setLastTrade(settledTrade);
          setTransactions((current) => [...current, settledTrade]);
          await onTradeSettled();
          setSummaryTab('Transactions');
          setJournalEntries((current) => [...current, `Run ${runIndex + 1}/${requestedRuns} · ${tradeContractLabel(settledTrade)} · ${selectedDefinition.name} · entry ${formatTradePoint(settledTrade.entrySpot)} → exit ${formatTradePoint(settledTrade.exitSpot)} · stake ${formatTradePoint(settledTrade.stake ?? settledTrade.buyPrice)} ${settledTrade.currency ?? currency} · net P/L pending settlement`]);
          break;
        }
        const exactProfit = resolvedTradeProfit(settledTrade);
        if (exactProfit === null) throw new Error('Deriv did not return an exact settled net profit/loss.');
        completed += 1;
        cumulativeProfit += exactProfit;
        totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
        lossStreak = exactProfit < 0 ? lossStreak + 1 : 0;
        settledTrades.push(settledTrade);
        setLastTrade(settledTrade);
        setTransactions((current) => [...current, settledTrade]);
        await onTradeSettled();
        setSummaryTab('Transactions');
        setJournalEntries((current) => [...current, `Run ${runIndex + 1}/${requestedRuns} · ${tradeContractLabel(settledTrade)} · ${selectedDefinition.name} · entry ${formatTradePoint(settledTrade.entrySpot)} → exit ${formatTradePoint(settledTrade.exitSpot)} · stake ${formatTradePoint(settledTrade.stake ?? settledTrade.buyPrice)} ${settledTrade.currency ?? currency} · net P/L ${formatSignedProfit(resolvedTradeProfit(settledTrade))} ${settledTrade.currency ?? currency}`]);
        if (takeProfitLimit > 0 && cumulativeProfit >= takeProfitLimit) {
          stopReason = `Take Profit reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
        if (stopLossLimit > 0 && cumulativeProfit <= -stopLossLimit) {
          stopReason = `Stop Loss reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
        if (lossStreak >= consecutiveLossLimit) {
          stopReason = `Consecutive loss limit reached at ${lossStreak}.`;
          break;
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unable to execute the Deriv contract.';
        setJournalEntries((current) => [...current, `Run ${runIndex + 1}/${requestedRuns} failed · ${message}`]);
        stopReason = `Execution stopped: ${message}`;
        break;
      }
    }
    recoveryExecutionLockRef.current = false;
    setRunning(false);
    stopRequestedRef.current = false;
    const batchProfit = cumulativeProfit;
    if (completed > 0 || pendingSettlementTrade) setBatchResult({
      profit: batchProfit,
      amount: totalPlaced,
      trades: completed + (pendingSettlementTrade ? 1 : 0),
      currency,
      settlementPending: Boolean(pendingSettlementTrade),
      orderStatusUnknown: Boolean(pendingSettlementTrade?.orderStatusUnknown),
      tradeResults: settledTrades,
    });
    setProposalState(failed ? 'error' : 'ready');
    setProposalMessage(pendingSettlementTrade
      ? `${unresolvedTradeMessage(pendingSettlementTrade)} The bot stopped to prevent another order.`
      : failed ? `${completed}/${requestedRuns} runs completed before execution stopped.` : completed > 0 ? `${completed}/${requestedRuns} settled · ${formatSignedProfit(batchProfit)}` : stopReason || `${completed}/${requestedRuns} runs completed.`);
  };
  const resultCurrency = transactions.at(-1)?.currency ?? currency;
   const resultStake = transactions.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0);
  const resultProfit = totalTradeProfit(transactions);
  const resultRuns = transactions.length;
  const resultLost = transactions.filter((trade) => trade.result === 'lost').length;
  const resultWon = transactions.filter((trade) => trade.result === 'won').length;

  return (
    <section className="recovery-builder">
      <div className="recovery-topbar">
        <div className="recovery-logo">E</div>
        <button type="button">Risk Disclaimer</button>
        <button type="button" className="cashier-button">Cashier</button>
        <button type="button" className="telegram-button">Join Telegram</button>
         <a className="whatsapp-button" href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" aria-label="Join the ProTraders WhatsApp support group">WhatsApp Group</a>
        <span className="recovery-spacer" />
        <span className="recovery-live-quote"><i /> {selectedDefinition.name} {formatMarketPrice(selectedQuote?.price ?? null, selectedQuote?.pipSize ?? 2)}</span>
        <span className="recovery-currency">{currencyLabel(displayCurrency)}⌄</span>
        <strong className="recovery-balance">◉ {balance === null ? '—' : formatMoneyForDisplay(balance, currency, displayCurrency, rate)}</strong>
        <span className="recovery-demo">{accountMode}</span>
        <button type="button" className="transfer-button">Transfer</button>
      </div>
      <div className="recovery-nav">
        {['▦ Dashboard', '◉ Best Bots', '♙ Bot Builder', '⌁ AI Analysis', '⌁ Analysis', '⟳ Auto Trades', '⌁ Trading View'].map((item) => (
          <button key={item} type="button" className={item.includes('Bot Builder') ? 'is-active' : ''} onClick={() => setSelectedBlock(item.includes('Bot Builder') ? 'Trade parameters' : selectedBlock)}>{item}</button>
        ))}
        <button type="button" className={`recovery-run-top ${running ? 'is-stop' : ''}`} onClick={handleRun}>{running ? '■ Stop Bot' : '▶ Run Bot'}</button>
        <span className={`recovery-running-status ${proposalState === 'error' ? 'is-error' : proposalState === 'ready' ? 'is-ready' : ''}`}>{proposalMessage || (running ? 'Bot is running' : 'Bot is not running')}</span>
      </div>
      <div className="recovery-tools">
        <button type="button" className="quick-strategy">Quick strategy</button>
        <div className="recovery-tool-icons"><button type="button">⟳</button><button type="button">▱</button><button type="button">⚑</button><button type="button">⌁</button><button type="button">⌗</button><button type="button">↶</button><button type="button">↷</button><button type="button">⌕</button></div>
      </div>
      <div className="recovery-content">
        <aside className="recovery-sidebar">
          <h3>▦ &nbsp; Blocks menu <span>⌃</span></h3>
          <input placeholder="⌕  Search" aria-label="Search blocks" />
          {['Trade parameters', 'Purchase conditions', 'Sell conditions (optional)', 'Restart trading conditions', 'Analysis', 'Utility'].map((block) => (
            <button key={block} type="button" className={selectedBlock === block ? 'is-selected' : ''} onClick={() => setSelectedBlock(block)}>{block}<span>{['Analysis', 'Utility'].includes(block) ? '⌄' : ''}</span></button>
          ))}
        </aside>
        <div className="recovery-canvas">
          <div className="recovery-canvas-title"><span>1. Trade parameters</span><div className="recovery-canvas-actions"><button type="button" onClick={() => setSelectedBlock('Restart trading conditions')}>4. Restart trading conditions</button><button type="button" className={`recovery-run-canvas ${running ? 'is-stop' : ''}`} onClick={handleRun}>{running ? '■ Stop Bot' : '▶ Run Bot'}</button></div></div>
          <div className="recovery-block">
            <div className="recovery-field-line"><span>Market:</span><VertexSelect value="Derived" /><b>›</b><VertexSelect value="Continuous Indices" /><b>›</b><VertexSelect value={recoveryMarket} options={VOLATILITY_DEFINITIONS.map(({ name }) => name)} onChange={setRecoveryMarket} /></div>
            <div className="recovery-field-line"><span>Trade Type:</span><VertexSelect value="Digits" /><b>›</b><VertexSelect value="Over/Under" /></div>
            <div className="recovery-field-line"><span>Contract Type:</span><VertexSelect value="Both" /></div>
            <div className="recovery-field-line"><span>Default Candle Interval:</span><VertexSelect value="1 minute" /></div>
            <label className="recovery-check"><input type="checkbox" /> Restart buy/sell on error (disable for better performance)</label>
            <label className="recovery-check"><input type="checkbox" defaultChecked /> Restart last trade on error (bot ignores the unsuccessful trade)</label>
          </div>
          <div className="recovery-block recovery-rule-block">
            <strong>Run once at start:</strong>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Numbers Under" /><span>to</span><VertexInput value="7" /></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Stake" /><span>to</span><VertexInput value={stake} onChange={setStake} /></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Martingale" /><span>to</span><VertexInput value={martingale} onChange={setMartingale} /><small>×</small></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Take Profit" /><span>to</span><VertexInput value={takeProfit} onChange={setTakeProfit} /></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Stop Loss" /><span>to</span><VertexInput value={stopLoss} onChange={setStopLoss} /></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Consecutive Losses" /><span>to</span><VertexInput value={consecutiveLosses} onChange={setConsecutiveLosses} /></div>
            <div className="recovery-set-row"><span>set</span><VertexSelect value="Runs" /><span>to</span><VertexInput value={runCount} onChange={setRunCount} /></div>
             <div className="recovery-set-row"><span>set</span><VertexSelect value="Number of ticks" /><span>to</span><VertexInput value={numberOfTicks} onChange={(value) => setNumberOfTicks(value.replace(/\D/g, '').slice(0, 3) || '1')} /></div>
          </div>
          <div className="recovery-execution-card">
            <div><strong>{selectedDefinition.name}</strong><span>{stake || '0.00'} {currency} stake · {numberOfTicks || '1'} tick{numberOfTicks === '1' ? '' : 's'} · {runCount || '0'} run{runCount === '1' ? '' : 's'}</span></div>
            <button type="button" className={`recovery-execute-button ${running ? 'is-stop' : ''}`} onClick={handleRun}>{running ? '■ Stop Bot' : '▶ Run Bot'}</button>
          </div>
          <div className="recovery-trash">▰</div>
        </div>
        <aside className="recovery-summary">
          <div className="recovery-summary-tabs" role="tablist">
            {(['Summary', 'Transactions', 'Journal', 'Results'] as const).map((tab) => <button key={tab} className={summaryTab === tab ? 'is-active' : ''} type="button" role="tab" aria-selected={summaryTab === tab} onClick={() => setSummaryTab(tab)}>{tab}</button>)}
          </div>
          {summaryTab === 'Summary' && <>
            <div className="recovery-empty"><p>When you’re ready to trade, hit <strong>Run Bot</strong>.<br />You’ll be able to track your bot’s<br />performance here.</p></div>
          </>}
          {summaryTab === 'Transactions' && <div className="recovery-transactions">
             <div className="recovery-transaction-head"><span>TRANSACTION</span><span>ENTRY</span><span>EXIT</span><span>NET P/L</span></div>
            {transactions.length ? transactions.slice().reverse().map((trade, index) => <div className="recovery-transaction-row" key={`${trade.contractId ?? 'run'}-${index}`}>
               <span className="recovery-transaction-type"><i className={resolvedTradeProfit(trade) !== null && resolvedTradeProfit(trade)! < 0 ? 'is-loss' : 'is-win'} /><strong>#{transactions.length - index} · {tradeContractLabel(trade)}</strong></span>
               <span className="recovery-spots"><span><i className="spot-entry" />{formatTradePoint(trade.entrySpot)}</span></span>
               <span className="recovery-spots"><span><i className="spot-exit" />{formatTradePoint(trade.exitSpot)}</span></span>
              <span className="recovery-buy-pnl"><span>Stake {formatMoneyForDisplay(trade.stake ?? trade.buyPrice, trade.currency ?? resultCurrency, displayCurrency, rate)}</span><em className={resolvedTradeProfit(trade) !== null && resolvedTradeProfit(trade)! < 0 ? 'is-loss' : 'is-win'}>{formatSignedMoneyForDisplay(resolvedTradeProfit(trade), trade.currency ?? resultCurrency, displayCurrency, rate)}</em></span>
            </div>) : <div className="recovery-transaction-empty">No bot transactions yet.</div>}
            <a className="recovery-whats-this" href="#recovery-transactions-help">What's this?</a>
          </div>}
          {summaryTab === 'Journal' && <div className="recovery-tab-content"><strong>Journal</strong>{journalEntries.length ? journalEntries.slice(-5).map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>) : <p>Your bot activity journal will appear here after you run the bot.</p>}</div>}
           {summaryTab === 'Results' && <div className="recovery-tab-content"><strong>Results</strong><div className="recovery-figure-results"><b className={resultProfit !== null && resultProfit < 0 ? 'is-loss' : 'is-win'}>{formatSignedMoneyForDisplay(resultProfit, resultCurrency, displayCurrency, rate)}</b><span>{tradeContractSummary(transactions)}</span><span>{resultRuns}</span><span>{resultWon}</span><span>{resultLost}</span></div>{lastTrade && <div className="recovery-entry-exit-card"><span><small>LAST ENTRY</small><b>{formatTradePoint(lastTrade.entrySpot)}</b></span><span><small>LAST EXIT</small><b>{formatTradePoint(lastTrade.exitSpot)}</b></span></div>}</div>}
          {summaryTab !== 'Journal' && <div className="recovery-metrics">
            {[
              ['Total stake', formatMoneyForDisplay(resultStake, resultCurrency, displayCurrency, rate)],
              ['Contract', tradeContractSummary(transactions)],
              ['No. of runs', String(resultRuns)],
              ['Contracts lost', String(resultLost)],
              ['Contracts won', String(resultWon)],
              ['Total net profit/loss', formatSignedMoneyForDisplay(resultProfit, resultCurrency, displayCurrency, rate)],
            ].map(([label, value]) => <div key={label}><strong>{label}</strong><span className={label === 'Total net profit/loss' && resultProfit !== null && resultProfit < 0 ? 'is-loss' : label === 'Total net profit/loss' ? 'is-win' : ''}>{value}</span></div>)}
          </div>}
           <button type="button" className="recovery-reset" disabled={running} onClick={() => { if (recoveryExecutionLockRef.current) return; stopRequestedRef.current = true; setRunning(false); setProposalState('idle'); setProposalMessage(''); setLastTrade(null); setTransactions([]); setJournalEntries([]); setSummaryTab('Summary'); setStake('10'); setRunCount('1'); setNumberOfTicks('1'); setMartingale('2'); setTakeProfit('50'); setStopLoss('500'); setConsecutiveLosses('5'); }}>Reset</button>
        </aside>
       </div>
       <TradeFigureStrip trades={transactions} currency={resultCurrency} />
       <div className="recovery-disclaimer">▲ Risk Disclaimer <span>Live contract execution is enabled; confirm each run before purchase.</span><span>{accountMode} · Live execution</span></div>
      <TradeResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </section>
  );
}

type FreeBotDefinition = {
  id: 'diagnosis' | 'recovery' | 'scanner1' | 'scanner2' | 'scanner3' | 'scanner4' | 'scanner5' | 'margic';
  name: string;
  eyebrow: string;
  description: string;
  contractType: DerivContractType;
  barrier?: number;
  accent: string;
};

const FREE_BOT_DEFINITIONS: FreeBotDefinition[] = [
  { id: 'recovery', name: 'Recovery Bot', eyebrow: 'RECOVERY STRATEGY', description: 'Runs sequential recovery trades with editable stake, runs, Take Profit, and Stop Loss.', contractType: 'DIGITOVER', barrier: 7, accent: 'violet' },
  { id: 'diagnosis', name: 'Diagnosis Bot', eyebrow: 'DIGIT PRESSURE', description: 'Reads recent volatility digits and trades an over-7 signal with controlled runs.', contractType: 'DIGITOVER', barrier: 7, accent: 'cyan' },
  { id: 'scanner1', name: 'Scanner 1', eyebrow: 'OVER 2 · BULK PATTERN', description: 'Waits for two digits at or below 2 followed by a digit above 2, then places Over 2 trades.', contractType: 'DIGITOVER', barrier: 2, accent: 'amber' },
  { id: 'scanner2', name: 'Scanner 2', eyebrow: 'OVER 2 · MARKET SCANNER', description: 'Scans volatility markets for 0, 1, and 2 staying below the 10.3% threshold before an Over 2 entry.', contractType: 'DIGITOVER', barrier: 2, accent: 'navy' },
  { id: 'scanner3', name: 'Scanner 3', eyebrow: 'OVER 1 · RECOVERY', description: 'Trades Over 1 with a 2× recovery sequence on Volatility 25 (1s).', contractType: 'DIGITOVER', barrier: 1, accent: 'violet' },
  { id: 'scanner4', name: 'Scanner 4', eyebrow: 'OVER 1 · ENTRY SIGNAL', description: 'Waits for last digit 4, then trades Over 1 on Volatility 100 R.', contractType: 'DIGITOVER', barrier: 1, accent: 'cyan' },
  { id: 'scanner5', name: 'Scanner 5', eyebrow: 'UNDER RECOVERY · SEQUENCE', description: 'Starts Under 9, then Under 8, recovering through Under 6 and Under 5 after losses.', contractType: 'DIGITUNDER', barrier: 9, accent: 'amber' },
  { id: 'margic', name: 'Margic Bot', eyebrow: 'EVEN / ODD · SIGNAL', description: 'Reads the live digit balance and opens an Even or Odd strategy with configurable signal and risk controls.', contractType: 'DIGITEVEN', accent: 'cyan' },
];

function FreeBotsView({ accountMode, currency, balance, activeMarket, marketQuotes, onTradeSettled, initialBotId }: { accountMode: 'DEMO' | 'REAL'; currency: string; balance: number | null; activeMarket: string; marketQuotes: Record<string, MarketQuote>; onTradeSettled: () => Promise<void>; initialBotId?: 'diagnosis' | 'recovery' | 'scanner1' | 'scanner2' | 'scanner3' | 'scanner4' | 'scanner5' | null }) {
  const [selectedBotId, setSelectedBotId] = useState<'diagnosis' | 'recovery' | 'scanner1' | 'scanner2' | 'scanner3' | 'scanner4' | 'scanner5' | 'margic' | null>(initialBotId ?? null);
  const [botRunning, setBotRunning] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(true);
  const [initialAnalysis, setInitialAnalysis] = useState(true);
  const [recoveryAnalysis, setRecoveryAnalysis] = useState(true);
  const [margicContractType, setMargicContractType] = useState<'DIGITEVEN' | 'DIGITODD'>('DIGITEVEN');
  const [margicSignalMode, setMargicSignalMode] = useState<'auto' | 'even' | 'odd'>('auto');
  const [margicSignalWindow, setMargicSignalWindow] = useState('25');
  const [margicSignalThreshold, setMargicSignalThreshold] = useState('55');
  const [botMarket, setBotMarket] = useState(() => getVolatilityDefinition(getMarketDefinition(activeMarket).name).name);
  const [botStake, setBotStake] = useState('1');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('30');
  const [runCount, setRunCount] = useState('5');
  const [numberOfTicks, setNumberOfTicks] = useState('1');
  const [martingale, setMartingale] = useState('2');
  const [maxLosses, setMaxLosses] = useState('4');
  const [botTransactions, setBotTransactions] = useState<ExecutedTrade[]>([]);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [botStatus, setBotStatus] = useState('');
  const [transactionTab, setTransactionTab] = useState<BotTransactionTab>('Transactions');
  const stopRequestedRef = useRef(false);
  const freeBotExecutionLockRef = useRef(false);
  useEffect(() => () => { stopRequestedRef.current = true; }, [selectedBotId]);
  const selectedBot = FREE_BOT_DEFINITIONS.find((bot) => bot.id === selectedBotId) ?? FREE_BOT_DEFINITIONS[0];
  const selectedDefinition = getVolatilityDefinition(botMarket);
  const scannerOneDefinition = getVolatilityDefinition('Volatility 25 (1s) Index');
  const scannerFourDefinition = getVolatilityDefinition('Volatility 100 R Index');
  const strategyDefinition = selectedBotId === 'scanner1' || selectedBotId === 'scanner3' || selectedBotId === 'scanner5'
    ? scannerOneDefinition
    : selectedBotId === 'scanner4'
      ? scannerFourDefinition
      : selectedDefinition;
  const selectedQuote = marketQuotes[strategyDefinition.symbol];
  const scannerLookback = 1000;
  const scannerMaxPercentage = 10.3;
  const scannerOneDigits = useMemo(() => getQuoteDigits(selectedQuote, 3), [selectedQuote]);
  const scannerOneQualifies = scannerOneDigits.length === 3
    && scannerOneDigits[0] <= 2
    && scannerOneDigits[1] <= 2
    && scannerOneDigits[2] > 2;
  const scannerTwoResults = useMemo(
    () => VOLATILITY_DEFINITIONS
      .map((definition) => getOverTwoScannerResult(definition, marketQuotes[definition.symbol], scannerLookback, scannerMaxPercentage))
      .sort((left, right) => left.score - right.score),
    [marketQuotes],
  );
  const scannerTwoCandidate = scannerTwoResults.find((result) => result.qualifies);
  const scannerFourEntryDigit = 4;
  const scannerFourEntryReady = getQuoteDigits(selectedQuote, 1).at(-1) === scannerFourEntryDigit;
  const scannerFiveDigits = useMemo(() => getQuoteDigits(selectedQuote, 3), [selectedQuote]);
  const scannerFiveQualifies = scannerFiveDigits.length === 3 && scannerFiveDigits.every((digit) => digit > 0);
  const { evenShare, signalContractType } = useMemo(() => {
    const windowSize = Math.max(1, Math.floor(Number(margicSignalWindow) || 25));
    const threshold = Math.min(100, Math.max(0, Number(margicSignalThreshold) || 55));
    const recentDigits = (selectedQuote?.ticks ?? []).slice(-windowSize).map((tick) => {
      const formatted = formatMarketPrice(tick, selectedQuote?.pipSize ?? 2);
      return Number(formatted.replace(/\D/g, '').slice(-1));
    }).filter((digit) => Number.isFinite(digit));
    const evenPercentage = recentDigits.length ? (recentDigits.filter((digit) => digit % 2 === 0).length / recentDigits.length) * 100 : null;
    const autoContractType = evenPercentage !== null && evenPercentage >= threshold ? 'DIGITEVEN' : 'DIGITODD';
    return {
      evenShare: evenPercentage,
      signalContractType: margicSignalMode === 'even' ? 'DIGITEVEN' : margicSignalMode === 'odd' ? 'DIGITODD' : autoContractType,
    };
  }, [margicSignalMode, margicSignalThreshold, margicSignalWindow, selectedQuote]);

  useEffect(() => {
    if (selectedBotId === 'scanner1') {
      setBotMarket(getVolatilityDefinition('Volatility 25 (1s) Index').name);
      setBotStake('18');
      setMartingale('2');
      setNumberOfTicks('1');
      setRunCount('4');
      setTakeProfit('40');
      setStopLoss('0');
      setMaxLosses('4');
    } else if (selectedBotId === 'scanner2') {
      setBotStake('18');
      setMartingale('2');
      setNumberOfTicks('1');
      setRunCount('1');
      setTakeProfit('40');
      setStopLoss('0');
      setMaxLosses('4');
    } else if (selectedBotId === 'scanner3') {
      setBotMarket(getVolatilityDefinition('Volatility 25 (1s) Index').name);
      setBotStake('10');
      setMartingale('2');
      setNumberOfTicks('1');
      setRunCount('5');
      setTakeProfit('100');
      setStopLoss('0');
      setMaxLosses('5');
    } else if (selectedBotId === 'scanner4') {
      setBotMarket(getVolatilityDefinition('Volatility 100 R Index').name);
      setBotStake('10');
      setMartingale('2');
      setNumberOfTicks('1');
      setRunCount('5');
      setTakeProfit('50');
      setStopLoss('0');
      setMaxLosses('5');
    } else if (selectedBotId === 'scanner5') {
      setBotMarket(getVolatilityDefinition('Volatility 25 (1s) Index').name);
      setBotStake('10');
      setMartingale('2');
      setNumberOfTicks('1');
      setRunCount('5');
      setTakeProfit('100');
      setStopLoss('0');
      setMaxLosses('5');
    } else {
      setBotMarket(getVolatilityDefinition(getMarketDefinition(activeMarket).name).name);
    }
  }, [activeMarket, selectedBotId]);

  const resetBot = () => {
    if (freeBotExecutionLockRef.current) {
      stopRequestedRef.current = true;
      setBotStatus('Stopping after the current trade settles. Reset after it finishes.');
      return;
    }
    stopRequestedRef.current = true;
    setBotRunning(false);
    setRecoveryMode(true);
    setInitialAnalysis(true);
    setRecoveryAnalysis(true);
    setMargicContractType('DIGITEVEN');
    setMargicSignalMode('auto');
    setMargicSignalWindow('25');
    setMargicSignalThreshold('55');
    setBotMarket(
      selectedBotId === 'scanner1' || selectedBotId === 'scanner3' || selectedBotId === 'scanner5'
        ? getVolatilityDefinition('Volatility 25 (1s) Index').name
        : selectedBotId === 'scanner4'
          ? getVolatilityDefinition('Volatility 100 R Index').name
          : getVolatilityDefinition(DEFAULT_MARKET_LABEL).name,
    );
    setBotStake('1');
    setTakeProfit('10');
    setStopLoss('30');
    setRunCount(selectedBotId === 'scanner1' ? '4' : selectedBotId === 'scanner2' ? '1' : '5');
    setNumberOfTicks('1');
    setMartingale('2');
    setMaxLosses('4');
    setBotTransactions([]);
    setBotStatus('');
  };

  const revealTransactions = () => {
    setTransactionTab('Transactions');
    window.requestAnimationFrame(() => {
      document.getElementById('free-bot-transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const runDiagnosisBot = async () => {
    if (freeBotExecutionLockRef.current) {
      stopRequestedRef.current = true;
      setBotStatus('Stopping after the current trade settles…');
      revealTransactions();
      return;
    }
    const amount = Number(botStake);
    const durationTicks = Math.max(1, Math.floor(Number(numberOfTicks) || 1));
    const requestedRuns = Math.max(1, Math.floor(Number(runCount) || 1));
    const martingaleMultiplier = recoveryMode ? configuredMultiplier(martingale) : 1;
    const takeProfitLimit = Number(takeProfit);
    const stopLossLimit = Number(stopLoss);
    const maxLossesLimit = Math.max(1, Math.floor(Number(maxLosses) || 1));
    const proposedContractType: unknown = selectedBotId === 'margic'
      ? (margicSignalMode === 'auto' ? signalContractType : margicContractType)
      : selectedBot.contractType;
    if (!isDerivContractType(proposedContractType)) {
      setBotStatus(`Unsupported contract type ${formatDerivContractType(proposedContractType)}. No trades were sent.`);
      return;
    }
    const executionContractType = proposedContractType;
    const baseExecutionBarrier = selectedBotId === 'margic' ? undefined : selectedBot.barrier;
    const executionDefinition = selectedBotId === 'scanner2'
      ? scannerTwoCandidate?.definition
      : selectedBotId === 'scanner1' || selectedBotId === 'scanner3' || selectedBotId === 'scanner5'
        ? scannerOneDefinition
        : selectedBotId === 'scanner4'
          ? scannerFourDefinition
          : selectedDefinition;
    if (selectedBotId === 'scanner1' && !scannerOneQualifies) {
      setBotStatus(scannerOneDigits.length < 3 ? 'Waiting for three live digits…' : `Waiting for the Over 2 pattern · ${scannerOneDigits.join(' · ')}`);
      return;
    }
    if (selectedBotId === 'scanner2' && !executionDefinition) {
      setBotStatus(`No market currently has digits 0, 1, and 2 below ${scannerMaxPercentage.toFixed(1)}% over ${scannerLookback} ticks.`);
      return;
    }
    if (selectedBotId === 'scanner4' && !scannerFourEntryReady) {
      setBotStatus(`Waiting for entry point · last digit ${scannerFourEntryDigit}.`);
      return;
    }
    if (selectedBotId === 'scanner5' && !scannerFiveQualifies) {
      setBotStatus(scannerFiveDigits.length < 3 ? 'Waiting for three live digits…' : `Waiting for three digits above 0 · ${scannerFiveDigits.join(' · ')}`);
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.35) {
      setBotStatus(`Enter a stake of at least ${currency} 0.35.`);
      return;
    }
    if (martingaleMultiplier === null) {
      setBotStatus('Enter a Martingale multiplier of 1 or greater.');
      return;
    }
    if (!Number.isFinite(takeProfitLimit) || takeProfitLimit < 0 || !Number.isFinite(stopLossLimit) || stopLossLimit < 0) {
      setBotStatus(`Enter valid ${currency} Take Profit and Stop Loss limits.`);
      return;
    }
    stopRequestedRef.current = false;
    freeBotExecutionLockRef.current = true;
    setBotRunning(true);
    setBatchResult(null);
    revealTransactions();
    const signalLabel = selectedBotId === 'margic' ? ` · entry ${executionContractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}${evenShare === null ? '' : ` ${evenShare.toFixed(1)}% even`}` : '';
    const executionMarketName = executionDefinition?.label ?? selectedDefinition.label;
    setBotStatus(`Executing ${requestedRuns} ${selectedBot.name} · ${formatDerivContractType(executionContractType, selectedBotId === 'scanner5' ? 9 : baseExecutionBarrier)} on ${executionMarketName}${signalLabel}…`);
    let cumulativeProfit = 0;
    let completed = 0;
    let failed = 0;
    let stopReason = '';
    let lossStreak = 0;
    let totalPlaced = 0;
    let scannerFiveBarrier = 9;
    const settledTrades: ExecutedTrade[] = [];
    let pendingSettlementTrade: ExecutedTrade | null = null;
    for (let runIndex = 0; runIndex < requestedRuns; runIndex += 1) {
      if (stopRequestedRef.current) {
        stopReason = 'Bot stopped by user.';
        break;
      }
      try {
        const tradeAmount = nextMartingaleStake(amount, martingaleMultiplier, lossStreak);
        const executionBarrier = selectedBotId === 'scanner5' ? scannerFiveBarrier : baseExecutionBarrier;
        const rawTrade = await executeDerivTrade<ExecutedTrade>({
          symbol: executionDefinition?.symbol ?? selectedDefinition.symbol,
          contractType: executionContractType,
          amount: tradeAmount,
          duration: durationTicks,
          durationUnit: 't',
          currency,
          barrier: executionBarrier,
          mode: accountMode === 'REAL' ? 'real' : 'demo',
        });
        const settledTrade: ExecutedTrade = {
          ...normalizeExecutedTrade(rawTrade),
          marketName: executionDefinition?.name ?? selectedDefinition.name,
          mode: accountMode,
        };
        if (settledTrade.settlementPending || settledTrade.orderStatusUnknown) {
          pendingSettlementTrade = settledTrade;
          totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
          settledTrades.push(settledTrade);
          setBotTransactions((current) => [...current, settledTrade]);
          await onTradeSettled();
          break;
        }
        const exactProfit = resolvedTradeProfit(settledTrade);
        if (exactProfit === null) throw new Error('Deriv did not return an exact settled net profit/loss.');
        completed += 1;
        cumulativeProfit += exactProfit;
        totalPlaced += settledTrade.stake ?? settledTrade.buyPrice ?? tradeAmount;
        lossStreak = exactProfit < 0 ? lossStreak + 1 : 0;
        if (selectedBotId === 'scanner5') {
          scannerFiveBarrier = exactProfit >= 0 ? 8 : scannerFiveBarrier === 9 || scannerFiveBarrier === 8 ? 6 : 5;
        }
        settledTrades.push(settledTrade);
        setBotTransactions((current) => [...current, settledTrade]);
        await onTradeSettled();
        setBotStatus(`${completed}/${requestedRuns} settled · ${cumulativeProfit.toFixed(2)} ${settledTrade.currency ?? currency}`);
        if (takeProfitLimit > 0 && cumulativeProfit >= takeProfitLimit) {
          stopReason = `Take Profit reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
        if (stopLossLimit > 0 && cumulativeProfit <= -stopLossLimit) {
          stopReason = `Stop Loss reached at ${cumulativeProfit.toFixed(2)} ${currency}.`;
          break;
        }
        if (lossStreak >= maxLossesLimit) {
          stopReason = `Maximum consecutive losses reached (${maxLossesLimit}).`;
          break;
        }
      } catch (error) {
        failed += 1;
        stopReason = error instanceof Error ? error.message : `${selectedBot.name} trade failed.`;
        break;
      }
    }
    freeBotExecutionLockRef.current = false;
    setBotRunning(false);
    stopRequestedRef.current = false;
    if (completed > 0 || pendingSettlementTrade) setBatchResult({
      profit: cumulativeProfit,
      amount: totalPlaced,
      trades: completed + (pendingSettlementTrade ? 1 : 0),
      currency,
      settlementPending: Boolean(pendingSettlementTrade),
      orderStatusUnknown: Boolean(pendingSettlementTrade?.orderStatusUnknown),
      tradeResults: settledTrades,
    });
    setBotStatus(pendingSettlementTrade
      ? `${unresolvedTradeMessage(pendingSettlementTrade)} The bot stopped to prevent another order.`
      : failed ? `${completed}/${requestedRuns} settled · ${stopReason}` : completed > 0 ? formatSignedProfit(cumulativeProfit) : stopReason || `${completed}/${requestedRuns} runs completed.`);
  };

  if (!selectedBotId) {
    return (
      <section className="free-bot-library">
        <header className="free-bot-library-header">
          <div><span className="free-bot-eyebrow">FREE BOT WORKSPACE</span><h1>Choose a bot to start</h1><p>Each bot opens in its own trading workspace with editable market, stake, runs, and risk limits.</p></div>
          <span className="free-bot-account-badge">{accountMode} · {currency}</span>
        </header>
        <div className="free-bot-grid">
          {FREE_BOT_DEFINITIONS.map((bot, index) => (
            <button type="button" className={`free-bot-card accent-${bot.accent}`} key={bot.id} onClick={() => setSelectedBotId(bot.id)}>
              <span className="free-bot-card-index">0{index + 1}</span>
              <span className="free-bot-card-icon">{bot.id === 'recovery' ? '↻' : bot.id === 'margic' ? '⌁' : '✦'}</span>
              <span className="free-bot-card-eyebrow">{bot.eyebrow}</span>
              <strong>{bot.name}</strong>
              <p>{bot.description}</p>
              <span className="free-bot-card-footer">OPEN BOT <ChevronRight size={14} /></span>
            </button>
          ))}
        </div>
        <div className="free-bot-library-note"><ShieldCheck size={15} /><span>Live execution is available after Deriv sign-in. Every bot runs sequentially and stops after settlement when you request a stop.</span></div>
      </section>
    );
  }

  if (selectedBotId === 'recovery') {
    return (
      <section className="free-bot-independent">
        <button type="button" className="free-bot-back-button" onClick={() => setSelectedBotId(null)}>← ALL FREE BOTS</button>
        <div className="free-bot-independent-heading"><span>FREE BOT WORKSPACE</span><strong>Recovery Bot only</strong><small>Diagnosis Bot is closed while Recovery Bot is open.</small></div>
        <RecoveryBotView key="free-recovery-bot" accountMode={accountMode} currency={currency} balance={balance} activeMarket={activeMarket} marketQuotes={marketQuotes} onTradeSettled={onTradeSettled} />
      </section>
    );
  }

  if (selectedBotId === 'margic') return (
    <section className="margic-workspace">
      <div className="margic-topbar">
        <div className="margic-brand"><span className="margic-brand-mark">M</span><div><strong>margic bot</strong><small>DERIV SIGNAL WORKSPACE</small></div></div>
        <div className="margic-topbar-actions">
          <span className="margic-account-chip">{accountMode} · {currency}</span>
          <button type="button" onClick={resetBot}>Reset</button>
          <button type="button" onClick={() => setSelectedBotId(null)}>All bots</button>
        </div>
      </div>
      <div className="margic-nav"><span className="is-active">Strategy</span><span>Signal board</span><span>Transactions</span><span>Risk controls</span><b>{selectedDefinition.name} · {formatMarketPrice(selectedQuote?.price ?? null, selectedQuote?.pipSize ?? 2)}</b></div>
      <div className="margic-grid">
        <aside className="margic-sidebar">
          <div className="margic-sidebar-heading"><span>LIVE MARKETS</span><small>DERIV FEED</small></div>
          {VOLATILITY_DEFINITIONS.slice(0, 6).map((market) => {
            const quote = marketQuotes[market.symbol];
            return <button type="button" key={market.name} className={market.name === botMarket ? 'is-active' : ''} onClick={() => setBotMarket(market.name)}><span>{market.label}</span><b>{formatMarketPrice(quote?.price ?? null, quote?.pipSize ?? 2)}</b></button>;
          })}
          <div className="margic-sidebar-note"><ShieldCheck size={13} /><span>Official Deriv quotes only. No order is placed until Run Bot is pressed.</span></div>
        </aside>
        <main className="margic-canvas">
          <header className="margic-canvas-heading"><div><span>STRATEGY BUILDER · 03</span><h1>margic bot</h1><p>Choose a live digit signal, configure the purchase, and review every settled result.</p></div><div className="margic-live-status"><i /> LIVE <strong>{quoteLastDigit(selectedQuote)}</strong></div></header>
          <div className="margic-signal-grid">
            <section className="margic-panel margic-signal-panel">
              <header><span>01</span><strong>INITIAL PURCHASE</strong><small>Signal gate</small></header>
              <div className="margic-panel-body">
                <label><span>ENTRY MODE</span><select value={margicSignalMode} onChange={(event) => setMargicSignalMode(event.target.value as 'auto' | 'even' | 'odd')}><option value="auto">Auto signal</option><option value="even">Even only</option><option value="odd">Odd only</option></select></label>
                <label><span>LAST DIGITS</span><input inputMode="numeric" value={margicSignalWindow} onChange={(event) => setMargicSignalWindow(event.target.value.replace(/\D/g, '').slice(0, 3) || '1')} /></label>
                <label><span>EVEN THRESHOLD %</span><input inputMode="decimal" value={margicSignalThreshold} onChange={(event) => setMargicSignalThreshold(event.target.value)} /></label>
                <div className="margic-signal-readout"><span>LIVE READOUT</span><strong>{evenShare === null ? 'Waiting for ticks' : `${evenShare.toFixed(1)}% EVEN · ${(100 - evenShare).toFixed(1)}% ODD`}</strong><small>{margicSignalMode === 'auto' ? `Auto purchase: ${signalContractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}` : `Fixed purchase: ${margicContractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}`}</small></div>
              </div>
            </section>
            <section className="margic-panel">
              <header><span>02</span><strong>TRADE PARAMETERS</strong><small>Deriv contract</small></header>
              <div className="margic-panel-body">
                <label><span>MARKET</span><select value={botMarket} onChange={(event) => setBotMarket(event.target.value)}>{VOLATILITY_DEFINITIONS.map(({ name }) => <option key={name}>{name}</option>)}</select></label>
                <label><span>CONTRACT TYPE</span><select value={margicContractType} onChange={(event) => setMargicContractType(event.target.value as 'DIGITEVEN' | 'DIGITODD')}><option value="DIGITEVEN">Even</option><option value="DIGITODD">Odd</option></select></label>
                <label><span>TICK DURATION</span><input inputMode="numeric" value={numberOfTicks} onChange={(event) => setNumberOfTicks(event.target.value.replace(/\D/g, '').slice(0, 3) || '1')} /></label>
                <div className="margic-contract-note"><span>CONTRACT</span><strong>{margicSignalMode === 'auto' ? (signalContractType === 'DIGITEVEN' ? 'EVEN' : 'ODD') : margicContractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}</strong><small>Settles before the next run</small></div>
              </div>
            </section>
          </div>
          <section className="margic-panel margic-risk-panel">
            <header><span>03</span><strong>BOT PARAMETERS</strong><small>Configured limits are honored</small></header>
            <div className="margic-parameter-grid">
              <label><span>STAKE</span><input inputMode="decimal" value={botStake} onChange={(event) => setBotStake(event.target.value)} /><small>{currency}</small></label>
              <label><span>RUNS</span><input inputMode="numeric" value={runCount} onChange={(event) => setRunCount(event.target.value)} /><small>MAX REQUESTED</small></label>
              <label><span>MARTINGALE ×</span><input inputMode="decimal" value={martingale} onChange={(event) => setMartingale(event.target.value)} /><small>{recoveryMode ? 'ENABLED' : 'OFF'}</small></label>
              <label><span>TAKE PROFIT</span><input inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} /><small>{currency}</small></label>
              <label><span>STOP LOSS</span><input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /><small>{currency}</small></label>
              <label className="margic-toggle-field"><span>RECOVERY MODE</span><VertexToggle checked={recoveryMode} onChange={() => setRecoveryMode(!recoveryMode)} /><small>{recoveryMode ? 'NEXT STAKE AFTER LOSS' : 'FLAT STAKE'}</small></label>
            </div>
          </section>
           <BotTransactionPanel
             trades={botTransactions}
             currency={currency}
             running={botRunning}
             activeTab={transactionTab}
             onTabChange={setTransactionTab}
             onViewDetail={() => {
               if (!botTransactions.length) return;
               setBatchResult({
                 profit: totalTradeProfit(botTransactions) ?? 0,
                 amount: botTransactions.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0),
                 trades: botTransactions.length,
                 currency,
                 tradeResults: botTransactions,
               });
             }}
           />
        </main>
      </div>
      <div className="margic-bottom-bar"><span><i /> {selectedBot.name.toUpperCase()} · {accountMode}</span><strong>{botStatus || (botRunning ? 'Settling current contract…' : 'Ready for review')}</strong><button type="button" className={botRunning ? 'is-stop' : ''} onClick={runDiagnosisBot}>{botRunning ? '■ Stop Bot' : '▶ Run Bot'}</button></div>
      <TradeFigureStrip trades={botTransactions} currency={currency} />
      <TradeResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </section>
  );

   if (selectedBotId === 'diagnosis' || selectedBotId === 'scanner1' || selectedBotId === 'scanner2' || selectedBotId === 'scanner3' || selectedBotId === 'scanner4' || selectedBotId === 'scanner5') return (
    <section className="vertex-builder">
      <div className="vertex-toolbar">
        <div className="vertex-actions">
          <button type="button" onClick={() => setSelectedBotId(null)}>← <span>All free bots</span></button>
          <button type="button">⇩ <span>Download bot</span></button>
          <button type="button">▱ <span>Load bot</span></button>
          <button type="button" onClick={resetBot}>↻ <span>Reset bot</span></button>
          <button type="button" onClick={resetBot}>⌗ <span>Reset layout</span></button>
        </div>
        <strong className="diagnosis-bot-name">{selectedBot.name.toUpperCase()}</strong>
          <div className="vertex-market-chip">{selectedBotId === 'scanner2' ? scannerTwoCandidate?.definition.name ?? 'Scanning all markets' : strategyDefinition.name}<strong>{selectedBotId === 'scanner2' ? formatMarketPrice(scannerTwoCandidate?.quote?.price ?? null, scannerTwoCandidate?.quote?.pipSize ?? 2) : formatMarketPrice(selectedQuote?.price ?? null, selectedQuote?.pipSize ?? 2)}</strong></div>
      </div>

      <div className="vertex-builder-grid">
        <div className="vertex-column">
          <VertexPanel title="TRADE PARAMETERS">
            <div className="vertex-form-row"><span>Market:</span><VertexSelect value="synthetic_index" /><b>›</b><VertexSelect value="random_index" /><b>›</b><VertexSelect value={botMarket} options={VOLATILITY_DEFINITIONS.map(({ name }) => name)} onChange={setBotMarket} /></div>
            <div className="vertex-form-row"><span>Trade type:</span><VertexSelect value="Digits" /><b>›</b><VertexSelect value="Over/Under" /></div>
            <div className="vertex-form-row"><span>Contract type:</span><VertexSelect value={selectedBot.contractType === 'CALL' ? 'Rise' : selectedBot.contractType === 'DIGITEVEN' ? 'Even' : selectedBot.contractType === 'DIGITUNDER' ? 'Under' : 'Over'} /></div>
            <div className="vertex-form-row"><span>Recovery Mode:</span><VertexToggle checked={recoveryMode} onChange={() => setRecoveryMode(!recoveryMode)} /></div>
          </VertexPanel>

           <VertexPanel title={selectedBotId === 'diagnosis' ? 'INITIAL PURCHASE' : 'SCANNER RULE'} accent>
             {selectedBotId === 'scanner1' ? (
               <>
                 <div className="vertex-panel-toolbar"><span>Scanner 1 · Over 2 pattern</span><span className="scanner-signal-pill">{scannerOneQualifies ? 'READY' : 'WAITING'}</span></div>
                 <VertexRule>
                   <div><b>IF</b><span>the last <VertexInput value="3" /> digits are at or below 2, at or below 2, then above 2</span></div>
                   <div><span>Purchase <VertexSelect value="Over" /> Prediction: <VertexInput value="2" /></span></div>
                   <div className="vertex-rule-result">LIVE DIGITS <em>{scannerOneDigits.length ? scannerOneDigits.join(' · ') : '—'}</em></div>
                 </VertexRule>
                 <p className="scanner-rule-note">Uses 4 trades per signal, 2× recovery, and resets after a win.</p>
               </>
              ) : selectedBotId === 'scanner2' ? (
               <>
                 <div className="vertex-panel-toolbar"><span>Bot 42 · 13-market scan</span><span className="scanner-signal-pill">{scannerTwoCandidate ? 'MARKET READY' : 'SCANNING'}</span></div>
                 <VertexRule>
                   <div><b>IF</b><span>digits 0, 1, and 2 are each below <VertexInput value={scannerMaxPercentage.toFixed(1)} />% across <VertexInput value={String(scannerLookback)} /> ticks</span></div>
                   <div><span>Purchase <VertexSelect value="Over" /> Prediction: <VertexInput value="2" /></span></div>
                   <div className="vertex-rule-result">BEST MARKET <em>{scannerTwoCandidate?.definition.label ?? 'Waiting for 1,000 ticks'}</em></div>
                 </VertexRule>
                 <p className="scanner-rule-note">The scanner chooses the qualifying market with the lowest highest share among digits 0, 1, and 2.</p>
                </>
              ) : selectedBotId === 'scanner3' ? (
                <>
                  <div className="vertex-panel-toolbar"><span>Scanner 3 · Over 1 recovery</span><span className="scanner-signal-pill">READY</span></div>
                  <VertexRule>
                    <div><b>IF</b><span>start the recovery sequence on Volatility 25 (1s)</span></div>
                    <div><span>Purchase <VertexSelect value="Over" /> Prediction: <VertexInput value="1" /></span></div>
                    <div className="vertex-rule-result">ENTRY <em>OVER 1</em></div>
                  </VertexRule>
                  <p className="scanner-rule-note">Uses a 10 stake, 2× recovery, 100 Take Profit, and 5 maximum consecutive losses.</p>
                </>
              ) : selectedBotId === 'scanner4' ? (
                <>
                  <div className="vertex-panel-toolbar"><span>Scanner 4 · Over 1 entry signal</span><span className="scanner-signal-pill">{scannerFourEntryReady ? 'READY' : 'WAITING'}</span></div>
                  <VertexRule>
                    <div><b>IF</b><span>the last digit equals <VertexInput value={String(scannerFourEntryDigit)} /></span></div>
                    <div><span>Purchase <VertexSelect value="Over" /> Prediction: <VertexInput value="1" /></span></div>
                    <div className="vertex-rule-result">LIVE LAST DIGIT <em>{getQuoteDigits(selectedQuote, 1).at(-1) ?? '—'}</em></div>
                  </VertexRule>
                  <p className="scanner-rule-note">The entry gate runs on Volatility 100 R.</p>
                </>
              ) : selectedBotId === 'scanner5' ? (
                <>
                  <div className="vertex-panel-toolbar"><span>Scanner 5 · Under recovery</span><span className="scanner-signal-pill">{scannerFiveQualifies ? 'READY' : 'WAITING'}</span></div>
                  <VertexRule>
                    <div><b>IF</b><span>the last three digits are all above 0</span></div>
                    <div><span>Purchase <VertexSelect value="Under" /> Prediction: <VertexInput value="9 → 8 → 6 → 5" /></span></div>
                    <div className="vertex-rule-result">LIVE DIGITS <em>{scannerFiveDigits.length ? scannerFiveDigits.join(' · ') : '—'}</em></div>
                  </VertexRule>
                  <p className="scanner-rule-note">Starts Under 9, advances to Under 8 after a win, and recovers through Under 6 then Under 5 after losses.</p>
               </>
             ) : (
               <>
                 <div className="vertex-panel-toolbar"><span>Signal Check</span><VertexSelect value="After Every" /><VertexInput value="3" /> <span>trades</span></div>
                 <VertexRule>
                   <div><b>IF</b><span>the last <VertexInput value="1" /> digits are <VertexSelect value="less or equal to" /> digit <VertexInput value="2" /> then</span><span className="vertex-trash">▥</span></div>
                   <div><span>Purchase <VertexSelect value="Over" /> Prediction: <VertexInput value="2" /></span></div>
                   <div className="vertex-rule-result">Last 1 pattern <em>1</em></div>
                 </VertexRule>
                 <VertexRule muted>
                   <div><b>ELSE IF</b><span>the last <VertexInput value="1" /> digits are <VertexSelect value="greater or equal to" /> digit <VertexInput value="7" /> then</span><span className="vertex-trash">▥</span></div>
                   <div><span>Purchase <VertexSelect value="Under" /> Prediction: <VertexInput value="7" /></span></div>
                 </VertexRule>
               </>
             )}
           </VertexPanel>
        </div>

        <div className="vertex-column">
          <VertexPanel title="BOT PARAMETERS">
            <div className="vertex-form-row"><span>Stake:</span><VertexInput value={botStake} onChange={setBotStake} /><small>USD</small></div>
            <div className="vertex-form-row"><span>Take profit:</span><VertexInput value={takeProfit} onChange={setTakeProfit} /><small>USD</small></div>
            <div className="vertex-form-row"><span>Stop loss:</span><VertexInput value={stopLoss} onChange={setStopLoss} /><small>USD</small></div>
            <div className="vertex-form-row"><span>Runs:</span><VertexInput value={runCount} onChange={setRunCount} /></div>
            <div className="vertex-form-row"><span>Martingale:</span><VertexToggle checked={recoveryMode} onChange={() => setRecoveryMode(!recoveryMode)} /><VertexInput value={martingale} onChange={setMartingale} /><small>×</small></div>
             <div className="vertex-form-row"><span>Max consecutive losses:</span><VertexInput value={maxLosses} onChange={setMaxLosses} /></div>
            <div className="vertex-form-row"><span>Number of ticks:</span><VertexSelect value="Ticks" /><VertexInput value={numberOfTicks} onChange={(value) => setNumberOfTicks(value.replace(/\D/g, '').slice(0, 3) || '1')} /></div>
          </VertexPanel>

          <VertexPanel title="RECOVERY PURCHASE" accent>
            <div className="vertex-panel-toolbar"><span>Signal Check</span><VertexSelect value="On First Entry Only" /></div>
            <VertexRule>
              <div><b>IF</b><span><VertexSelect value="Even" /> % of last <VertexInput value="25" /> digits is <VertexSelect value="≥" /> <VertexInput value="55" /> %</span><span className="vertex-trash">▥</span></div>
              <div><span>THEN Purchase <VertexSelect value="Even" /></span></div>
              <div className="vertex-probability">Even: 48.0% <span>Odd: 52.0%</span></div>
            </VertexRule>
            <VertexRule muted>
              <div><b>ELSE IF</b><span><VertexSelect value="Odd" /> % of last <VertexInput value="25" /> digits is <VertexSelect value="≥" /> <VertexInput value="55" /> %</span><span className="vertex-trash">▥</span></div>
            </VertexRule>
          </VertexPanel>
        </div>
      </div>

       <BotTransactionPanel
         trades={botTransactions}
         currency={currency}
         running={botRunning}
         activeTab={transactionTab}
         onTabChange={setTransactionTab}
         onViewDetail={() => {
           if (!botTransactions.length) return;
           setBatchResult({
             profit: totalTradeProfit(botTransactions) ?? 0,
             amount: botTransactions.reduce((total, trade) => total + (trade.stake ?? trade.buyPrice ?? 0), 0),
             trades: botTransactions.length,
             currency,
             tradeResults: botTransactions,
           });
         }}
       />
      <TradeFigureStrip trades={botTransactions} currency={currency} />

      <div className="vertex-bottom-bar">
         <span className="vertex-bot-label">{selectedBot.name.toUpperCase()}</span>
        <button type="button" className={`vertex-run ${botRunning ? 'is-running' : ''}`} onClick={runDiagnosisBot}>{botRunning ? '■  Stop Bot' : '▶  Run Bot'}</button>
         <span className="vertex-run-status">{botStatus || (botRunning ? `${selectedBot.name} is executing` : `${selectedBot.name} is ready`)}</span>
        <span className="vertex-time">{accountMode} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} GMT</span>
      </div>
      <TradeResultDialog result={batchResult} onClose={() => setBatchResult(null)} />
    </section>
  );

  return null;
}

function VertexPanel({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <section className={`vertex-panel ${accent ? 'has-accent' : ''}`}>
      <header><span>⋮</span><span>☷</span><strong>{title}</strong></header>
      <div className="vertex-panel-content">{children}</div>
    </section>
  );
}

function VertexInput({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  return <input className="vertex-input" value={onChange ? value : localValue} onChange={(event) => { setLocalValue(event.target.value); onChange?.(event.target.value); }} aria-label="Bot parameter" />;
}

function VertexSelect({ value, options, onChange }: { value: string; options?: string[]; onChange?: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  const currentValue = onChange ? value : localValue;
  return <select className="vertex-select" value={currentValue} onChange={(event) => { setLocalValue(event.target.value); onChange?.(event.target.value); }} aria-label={`Bot option ${currentValue}`}>{(options ?? [value]).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function VertexToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" className={`vertex-toggle ${checked ? 'is-on' : ''}`} onClick={onChange} aria-pressed={checked}><span /></button>;
}

function VertexRule({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <div className={`vertex-rule ${muted ? 'is-muted' : ''}`}>{children}</div>;
}

function Router() {
  const SignInPage = () => <LegacyAuthPage mode="login" />;
  const SignUpPage = () => <LegacyAuthPage mode="signup" />;
  const [location] = useLocation();
  const legacyPath = ['/analysis', '/ai-scanner', '/analysis-tools'].includes(location);

  useEffect(() => {
    if (legacyPath) window.location.replace(basePath || '/');
  }, [legacyPath]);

  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      {legacyPath ? null : <Switch>
        <Route path="/" component={Home} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/account" component={Account} />
        <Route component={NotFound} />
      </Switch>}
    </RoutedErrorBoundary>
  );
}

function LegacyAuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { signInHref, signUpHref } = useAppAuth();
  const isSignup = mode === 'signup';
  return (
    <AuthPage>
      <div className="border hairline bg-[#101d1e] p-8 text-[#e6e3d7]">
        <p className="font-mono-brand text-[10px] uppercase tracking-[.2em] text-[#d9a64c]">Deriv connection</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-.05em]">{isSignup ? 'Create your trading desk.' : 'Welcome back.'}</h1>
        <p className="mt-4 text-sm leading-6 text-[#9da9a0]">
          {isSignup ? 'Connect a Deriv account to unlock the ProTraders FX terminal.' : 'Continue with Deriv to return to your ProTraders FX workspace.'}
        </p>
        <a href={isSignup ? signUpHref : signInHref} className="mt-8 inline-flex bg-[#d9a64c] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#0d1617]">
          {isSignup ? 'Continue to Deriv' : 'Log in with Deriv'}
        </a>
        <p className="mt-5 text-xs text-[#718077]">
          {isSignup ? 'Already connected?' : 'New to ProTraders FX?'}{' '}
          <a className="text-[#d9a64c]" href={isSignup ? signInHref : signUpHref}>{isSignup ? 'Log in' : 'Create an account'}</a>
        </p>
      </div>
    </AuthPage>
  );
}

function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page-shell">
      <div className="auth-page-content">
        <div className="w-full max-w-[460px]">{children}</div>
      </div>
      <footer className="auth-page-footer"><RiskDisclaimerNote /></footer>
    </div>
  );
}

function Account() {
  const { user, signOut } = useAppAuth();

  return (
    <AuthPage>
      <div className="border hairline bg-[#101d1e] p-8 text-[#e6e3d7]">
        <p className="font-mono-brand text-[10px] uppercase tracking-[.2em] text-[#d9a64c]">Member account</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-[-.05em]">Welcome back.</h1>
        <p className="mt-4 text-sm leading-6 text-[#9da9a0]">
           Connected as {user?.email ?? user?.label ?? 'Deriv trader'}.
        </p>
        <div className="mt-8 flex gap-3">
          <a href={basePath || '/'} className="bg-[#d9a64c] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#0d1617]">Back to desk</a>
           <button type="button" onClick={() => void signOut()} className="border hairline px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#d9a64c]">Log out</button>
        </div>
      </div>
    </AuthPage>
  );
}

function LegacyRoutes() {
  const [introComplete, setIntroComplete] = useState(false);
  const completeIntro = useCallback(() => setIntroComplete(true), []);
  if (!introComplete) return <PublicLoadingView onComplete={completeIntro} />;
  return (
    <LegacyAuthProvider>
      <Router />
    </LegacyAuthProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <LegacyRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
