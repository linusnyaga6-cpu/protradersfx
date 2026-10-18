import { useEffect, useState } from "react";
import { countryCurrencies, isDisplayCurrency, type DisplayCurrency } from "../lib/currencies";
import { useLanguage } from "../lib/language-context";

const KEY = "protradersfx:display-currency";
function savedCurrency(): DisplayCurrency | null {
  try {
    const value = localStorage.getItem(KEY);
    return isDisplayCurrency(value) ? value : value === "KSH" ? "KES" : null;
  } catch { return null; }
}
export function useDisplayCurrencyPreference() {
  const { country } = useLanguage();
  const [displayCurrency, setCurrency] = useState<DisplayCurrency>(() => savedCurrency() ?? countryCurrencies[country] ?? "USD");
  const [automatic, setAutomatic] = useState(() => savedCurrency() === null);
  useEffect(() => {
    if (automatic) setCurrency(countryCurrencies[country] ?? "USD");
  }, [country, automatic]);
  const selectCurrency = (value: DisplayCurrency | "auto") => {
    setAutomatic(value === "auto");
    setCurrency(value === "auto" ? countryCurrencies[country] ?? "USD" : value);
    try { localStorage.setItem(KEY, value); } catch { /* Keep usable in private browsing. */ }
  };
  return { displayCurrency, selectCurrency, automatic };
}
