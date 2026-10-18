import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Calculator, X } from "lucide-react";
import {
  convertCurrency, countryCurrencies, currencyLabel, currencyNames, isDisplayCurrency, rateFor,
  type CurrencyRates, type DisplayCurrency,
} from "../lib/currencies";
import { useLanguage } from "../lib/language-context";

export default function CurrencyConverter({
  rates, updatedAt, source, checkedAt, displayCurrency, onSelectCurrency, automatic, loading, stale, onRefresh,
}: {
  rates: CurrencyRates | null;
  updatedAt: string | null;
  source: string | null;
  checkedAt: string | null;
  displayCurrency: DisplayCurrency;
  onSelectCurrency: (value: DisplayCurrency | "auto") => void;
  automatic: boolean;
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
}) {
  const { country } = useLanguage();
  const countryCurrency = countryCurrencies[country] ?? "USD";
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState<DisplayCurrency>("USD");
  const [to, setTo] = useState<DisplayCurrency>("KES");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const parsed = amount.trim() === "" ? NaN : Number(amount);
  const converted = parsed >= 0 ? convertCurrency(parsed, from, to, rates) : null;
  const unitRate = convertCurrency(1, from, to, rates);
  const selectedRate = rateFor(displayCurrency, rates);
  const options = Object.entries(currencyNames).map(([code, name]) =>
    <option key={code} value={code}>{code === "KES" ? "KSh (KES)" : code} — {name}</option>);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); trigger.current?.focus(); };
  }, [open]);
  return <div className="currency-converter-control">
    <label className="currency-display-label">
      <ArrowLeftRight size={14} aria-hidden="true" />
      <select className="currency-display-select" aria-label="Display currency for balances and trade results"
        data-testid="display-currency-select" value={automatic ? "auto" : displayCurrency}
        onChange={event => {
          if (event.target.value === "auto" || isDisplayCurrency(event.target.value)) onSelectCurrency(event.target.value);
        }}>
        <option value="auto">Auto · {currencyLabel(countryCurrency)} (country)</option>
        {options}
      </select>
    </label>
    <button ref={trigger} type="button" className="currency-converter-open" aria-label="Open currency converter"
      aria-haspopup="dialog" aria-expanded={open} data-testid="currency-converter-button"
      onClick={() => { setTo(displayCurrency === "USD" ? "KES" : displayCurrency); setOpen(true); }}
      title={selectedRate === null ? "Rate unavailable — open converter to retry" : `Display: ${currencyLabel(displayCurrency)}. Open calculator`}>
      <Calculator size={15} aria-hidden="true" />
    </button>
    {open && createPortal(
      <dialog ref={dialog} className="currency-converter-popover" aria-label="Currency converter" dir="ltr"
        data-testid="currency-converter-popover" onCancel={() => setOpen(false)}
        onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
        <div className="currency-converter-content">
          <header>
            <div><strong>Currency converter</strong><small>21 currencies · daily reference estimates</small></div>
            <button type="button" className="currency-converter-close" onClick={() => setOpen(false)} aria-label="Close currency converter"><X size={16} /></button>
          </header>
          <label className="currency-converter-amount"><span>From</span>
            <select value={from} aria-label="Convert from currency" onChange={event => { if (isDisplayCurrency(event.target.value)) setFrom(event.target.value); }}>{options}</select>
          </label>
          <label className="currency-converter-amount"><span>Amount in {currencyLabel(from)}</span>
            <input type="number" min="0" step="any" inputMode="decimal" value={amount}
              onChange={event => setAmount(event.target.value)} aria-label={`Amount in ${from}`}
              data-testid="currency-converter-amount" />
          </label>
          <button type="button" className="currency-converter-swap" onClick={() => { setFrom(to); setTo(from); }}
            aria-label="Swap conversion currencies" data-testid="currency-converter-swap">
            <ArrowLeftRight size={13} /> {currencyLabel(from)} ⇄ {currencyLabel(to)}
          </button>
          <label className="currency-converter-amount"><span>To</span>
            <select value={to} aria-label="Convert to currency" onChange={event => { if (isDisplayCurrency(event.target.value)) setTo(event.target.value); }}>{options}</select>
          </label>
          <div className="currency-converter-output" aria-live="polite" data-testid="currency-converter-result">
            <small>ESTIMATED AMOUNT IN {currencyLabel(to)}</small>
            <strong>{converted === null ? "—" : `${currencyLabel(to)} ${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong>
          </div>
          <p className={`currency-converter-rate ${unitRate === null ? "is-unavailable" : ""}`} role="status">
            {loading ? "Loading exchange rates…" : unitRate === null
              ? "Rate unavailable for this pair. Retry below. No estimated value will be invented."
              : `1 ${currencyLabel(from)} ≈ ${unitRate.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${currencyLabel(to)}`}
          </p>
          {updatedAt && <small>Updated {new Date(updatedAt).toLocaleDateString()} · {source}</small>}
          {checkedAt && !loading && <small role="status" data-testid="currency-refresh-confirmation">
            Last successful refresh: {new Date(checkedAt).toLocaleTimeString()}
          </small>}
          {stale && <small role="status">Saved estimate — the latest rates are not available yet.</small>}
          <button type="button" className="currency-converter-swap" onClick={() => onSelectCurrency(to)}>
            Display balances and results in {currencyLabel(to)}
          </button>
          <button type="button" className="currency-converter-swap" onClick={() => onSelectCurrency("auto")}>
            Use country currency automatically
          </button>
          <button type="button" className="currency-converter-swap" disabled={loading} onClick={onRefresh}>
            {loading ? "Refreshing…" : unitRate === null ? "Retry exchange rates" : "Refresh exchange rates"}
          </button>
          <small className="currency-converter-disclaimer">
            Display estimate only. Deriv account balances, order stakes and settlement remain in the account’s actual currency.
            If a quote is missing, account and result amounts keep their original currency label.
          </small>
          <a className="currency-converter-attribution"
            href={source === "Currency API" ? "https://github.com/fawazahmed0/exchange-api" : "https://www.exchangerate-api.com"}
            target="_blank" rel="noopener noreferrer">Rate provider: {source ?? "ExchangeRate-API / Currency API"}</a>
        </div>
      </dialog>, document.body
    )}
  </div>;
}
