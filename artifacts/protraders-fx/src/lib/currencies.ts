export const currencyNames = {
  USD: "US dollar", KES: "Kenyan shilling (KSh)", ZAR: "South African rand",
  NGN: "Nigerian naira", GHS: "Ghanaian cedi", EGP: "Egyptian pound",
  BWP: "Botswana pula", BRL: "Brazilian real", COP: "Colombian peso",
  MXN: "Mexican peso", CLP: "Chilean peso", CRC: "Costa Rican colón",
  ARS: "Argentine peso", INR: "Indian rupee", IDR: "Indonesian rupiah",
  PKR: "Pakistani rupee", PHP: "Philippine peso", THB: "Thai baht",
  NZD: "New Zealand dollar", GBP: "British pound", EUR: "Euro",
} as const;
export type DisplayCurrency = keyof typeof currencyNames;
export type CurrencyRates = Readonly<Record<string, number>>;
// Numeric legacy input remains supported for existing USD/KES consumers.
export type RateInput = CurrencyRates | number | null;
export const countryCurrencies: Record<string, DisplayCurrency> = {
  KE:"KES", ZA:"ZAR", NG:"NGN", GH:"GHS", EG:"EGP", BW:"BWP",
  BR:"BRL", CO:"COP", MX:"MXN", CL:"CLP", CR:"CRC", AR:"ARS",
  IN:"INR", ID:"IDR", PK:"PKR", PH:"PHP", TH:"THB", NZ:"NZD",
  GB:"GBP", DE:"EUR", FR:"EUR", IT:"EUR", ES:"EUR", HR:"EUR",
};
export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === "string" && Object.hasOwn(currencyNames, value);
}
export function currencyLabel(code: string) { return code === "KES" ? "KSh" : code; }
export function normalizeCurrency(code: string) {
  const value = code.trim().toUpperCase();
  return value === "KSH" ? "KES" : value;
}
export function rateFor(code: string, rates: RateInput): number | null {
  const normalized = normalizeCurrency(code);
  if (normalized === "USD") return 1;
  const value = typeof rates === "number" ? normalized === "KES" ? rates : null : rates?.[normalized];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
export function convertCurrency(amount: number, from: string, to: string, rates: RateInput): number | null {
  if (!Number.isFinite(amount)) return null;
  if (normalizeCurrency(from) === normalizeCurrency(to)) return amount;
  const source = rateFor(from, rates);
  const target = rateFor(to, rates);
  if (source === null || target === null) return null;
  const converted = amount / source * target;
  return Number.isFinite(converted) ? converted : null;
}
