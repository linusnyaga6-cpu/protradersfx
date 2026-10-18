import { createContext, useContext } from "react";
import { convertCurrency, currencyLabel, normalizeCurrency, type DisplayCurrency, type RateInput } from "./currencies.ts";

export type { DisplayCurrency } from "./currencies";

export type CurrencyDisplayState = {
  displayCurrency: DisplayCurrency;
  rate: RateInput;
  toggleDisplayCurrency: () => void;
};

export const CurrencyDisplayContext = createContext<CurrencyDisplayState>({
  displayCurrency: "USD",
  rate: null,
  toggleDisplayCurrency: () => undefined,
});

export function useCurrencyDisplay() {
  return useContext(CurrencyDisplayContext);
}

function finiteAmount(value: number | string | null | undefined) {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(amount) ? amount : null;
}

export function convertForDisplay(
  amount: number | string | null | undefined,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rate: RateInput,
) {
  const parsed = finiteAmount(amount);
  if (parsed === null) return null;

  const source = normalizeCurrency(sourceCurrency);
  const converted = convertCurrency(parsed, source, displayCurrency, rate);
  // Never label an unconverted source amount as the selected currency.
  return converted === null
    ? { amount: parsed, currency: currencyLabel(source) || "—" }
    : { amount: converted, currency: currencyLabel(displayCurrency) };
}

export function formatMoneyForDisplay(
  amount: number | string | null | undefined,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rate: RateInput,
) {
  const converted = convertForDisplay(amount, sourceCurrency, displayCurrency, rate);
  if (!converted) return "—";
  const locale = converted.currency === "KSh" ? "en-KE" : "en-US";
  const formatted = converted.amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${converted.currency} ${formatted}`;
}

export function formatSignedMoneyForDisplay(
  amount: number | string | null | undefined,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rate: RateInput,
) {
  const parsed = finiteAmount(amount);
  if (parsed === null) return "—";
  if (parsed === 0) return "FLAT";
  const sign = parsed > 0 ? "+" : "-";
  return `${sign}${formatMoneyForDisplay(Math.abs(parsed), sourceCurrency, displayCurrency, rate)}`;
}
