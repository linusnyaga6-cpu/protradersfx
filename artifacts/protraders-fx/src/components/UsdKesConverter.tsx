import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Calculator, X } from "lucide-react";
import {
  convertUsdKesAmount,
  type UsdKesDirection,
} from "../lib/currency-converter";
import type { DisplayCurrency } from "../lib/display-currency";

function formatKes(value: number) {
  return `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUsd(value: number) {
  return `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function UsdKesConverter({
  rate,
  updatedAt,
  displayCurrency,
  onToggleDisplayCurrency,
  loading,
  stale,
  onRefresh,
}: {
  rate: number | null;
  updatedAt: string | null;
  displayCurrency: DisplayCurrency;
  onToggleDisplayCurrency: () => void;
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [direction, setDirection] = useState<UsdKesDirection>("USD_TO_KES");
  const converted = convertUsdKesAmount(amount, rate, direction);
  const inputCurrency = direction === "USD_TO_KES" ? "USD" : "KSh";
  const outputCurrency = direction === "USD_TO_KES" ? "KSh" : "USD";
  const nextDisplayCurrency = displayCurrency === "USD" ? "KES" : "USD";

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="currency-converter-control">
      <button
        type="button"
        className="currency-converter-trigger"
        aria-label={`Display balances and results in ${nextDisplayCurrency === "KES" ? "KSh" : "USD"}`}
        aria-pressed={displayCurrency === "KES"}
        disabled={rate === null}
        data-testid="usd-kes-converter-button"
        onClick={() => {
          onToggleDisplayCurrency();
          setDirection(nextDisplayCurrency === "KES" ? "USD_TO_KES" : "KES_TO_USD");
        }}
        title={`Switch displayed amounts to ${nextDisplayCurrency === "KES" ? "KSh" : "USD"}. Deriv still settles in the account currency.`}
      >
        <ArrowLeftRight size={15} aria-hidden="true" />
        <span>{displayCurrency === "KES" ? "KSh" : "USD"}</span>
      </button>
      <button
        type="button"
        className="currency-converter-open"
        aria-label="Open USD and KSh calculator"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="usd-kes-converter"
        onClick={() => setOpen((current) => !current)}
        title="Open USD/KSh calculator"
      >
        <Calculator size={13} aria-hidden="true" />
      </button>
      {open && createPortal(
        <section
          id="usd-kes-converter"
          className="currency-converter-popover"
          role="dialog"
          aria-label="USD and KSh converter"
          data-testid="usd-kes-converter-popover"
        >
          <header>
            <div>
              <strong>USD ⇄ KSh</strong>
              <small>Daily reference-rate estimate</small>
            </div>
            <button
              type="button"
              className="currency-converter-close"
              onClick={() => setOpen(false)}
              aria-label="Close currency converter"
            >
              <X size={16} />
            </button>
          </header>
          <label className="currency-converter-amount">
            <span>Amount in {inputCurrency}</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label={`Amount in ${inputCurrency}`}
              data-testid="currency-converter-amount"
            />
          </label>
          <button
            type="button"
            className="currency-converter-swap"
            onClick={() => setDirection((current) => current === "USD_TO_KES" ? "KES_TO_USD" : "USD_TO_KES")}
            aria-label={`Swap to ${outputCurrency} to ${inputCurrency}`}
            data-testid="currency-converter-swap"
          >
            <ArrowLeftRight size={13} />
            {inputCurrency} → {outputCurrency}
          </button>
          <div className="currency-converter-output" aria-live="polite" data-testid="currency-converter-result">
            <small>ESTIMATED AMOUNT IN {outputCurrency}</small>
            <strong>
              {converted === null
                ? "—"
                : direction === "USD_TO_KES"
                  ? formatKes(converted)
                  : formatUsd(converted)}
            </strong>
          </div>
          <p className={`currency-converter-rate ${rate === null ? "is-unavailable" : ""}`} role="status">
            {loading ? "Loading USD/KSh reference rate…" : rate === null
              ? "USD/KSh estimate unavailable. Check your connection and try again."
              : direction === "USD_TO_KES"
                ? `Rate: 1 USD ≈ ${formatKes(rate)}${updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleDateString()}` : ""}`
                : `Rate: 1 KSh ≈ ${formatUsd(1 / rate)}${updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleDateString()}` : ""}`}
          </p>
          {stale && <small role="status">Saved estimate — the latest rate is not available yet.</small>}
          <button type="button" className="currency-converter-swap" disabled={loading} onClick={onRefresh}>
            {loading ? "Refreshing…" : rate === null ? "Retry exchange rate" : "Refresh exchange rate"}
          </button>
          <small className="currency-converter-disclaimer">
            Estimate only. This does not exchange funds or change your Deriv balance or trade currency.
          </small>
          <a
            className="currency-converter-attribution"
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rates by ExchangeRate-API
          </a>
        </section>, document.body
      )}
    </div>
  );
}
