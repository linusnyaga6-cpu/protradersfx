// Local Vite-only fixture entry, not imported by the application or production build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TradeResultDialog, BotTransactionPanel, TradeFigureStrip, type BatchResult, type ExecutedTrade } from '../App';
import { CurrencyDisplayContext } from '../lib/display-currency';
import '../index.css';
import '../reference-redesign.css';
import '../footer-layout.css';
import '../bulk-trader-theme.css';
import '../workspace-navigation.css';
import '../scrolling.css';
import '../traderscheme-refresh.css';
import '../profit-loss.css';

const cases: Record<string, ExecutedTrade[]> = {
  win: [{ buyPrice: 10, stake: 1, payout: 18, profit: 999, status: 'won', result: 'won' }],
  loss: [{ buyPrice: 10, payout: 0, profit: 999, status: 'lost', result: 'lost' }],
  flat: [{ buyPrice: 10, payout: 10, status: 'sold' }],
  pending: [{ buyPrice: 10, payout: 18, profit: 8, status: 'open', result: 'pending' }],
  unknown: [{ orderStatusUnknown: true, settlementPending: true, profit: 999 }],
  martingale: [
    { buyPrice: 1, stake: 1, payout: 0, result: 'lost' },
    { buyPrice: 2, stake: 1, payout: 0, result: 'lost' },
    { buyPrice: 4, stake: 1, payout: 7.6, result: 'won' },
  ],
  mixed: [
    { buyPrice: 10, payout: 18, result: 'won' },
    { buyPrice: 10, payout: 19, profit: 9, result: 'lost' },
    { buyPrice: 10, payout: 10, status: 'sold' },
  ],
};

function ResultsSmoke() {
  const [scenario, setScenario] = useState('mixed');
  const [tab, setTab] = useState<'Summary' | 'Transactions' | 'Journal'>('Transactions');
  const [dialog, setDialog] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'KES'>('USD');
  const trades = cases[scenario].map((trade, index) => ({
    contractId: trade.orderStatusUnknown ? undefined : `fixture-${index}`,
    contractType: index % 2 ? 'DIGITUNDER' : 'DIGITOVER', barrier: 5,
    marketName: 'Volatility 100 (1s) Index', mode: 'DEMO', currency: 'USD',
    entrySpot: 1234.56, exitSpot: 1234.58, ...trade,
  }));
  // Intentionally stale aggregate: the real dialog must derive figures from rows.
  const result: BatchResult = { profit: 999, amount: 999, currency: 'USD', trades: trades.length, tradeResults: trades };
  return <CurrencyDisplayContext.Provider value={{ displayCurrency: currency, rate: { USD: 1, KES: 130 }, toggleDisplayCurrency() {} }}>
    <main style={{ maxWidth: 1100, margin: '20px auto', padding: 12 }}>
      <h1>Results smoke test — fixtures, no orders</h1>
      <label>Scenario <select aria-label="Scenario" value={scenario} onChange={event => setScenario(event.target.value)}>{Object.keys(cases).map(key => <option key={key}>{key}</option>)}</select></label>
      <button onClick={() => setCurrency(currency === 'USD' ? 'KES' : 'USD')}>Currency: {currency}</button>
      <div className="bulk-trader-view ptx-bulk"><BotTransactionPanel trades={trades} currency="USD" running={false} activeTab={tab} onTabChange={setTab} onViewDetail={() => setDialog(true)} /></div>
      <TradeFigureStrip trades={trades} currency="USD" />
      {dialog && <TradeResultDialog key={scenario} result={result} onClose={() => setDialog(false)} />}
    </main>
  </CurrencyDisplayContext.Provider>;
}

if (import.meta.env.DEV) {
  const root = createRoot(document.getElementById('root')!);
  root.render(<ResultsSmoke />);
  // Dispose the fixture root before Vite recreates this development-only entry.
  import.meta.hot?.dispose(() => root.unmount());
}
