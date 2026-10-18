import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { countryLanguages, detectBrowserLanguage, isLanguage, translate, type Language } from "./languages";

const STORAGE_KEY = "protradersfx:language-preferences";
type Preferences = { language: Language; automatic: boolean; country: string; manualCountry: boolean };
function browserCountry() {
  try { return new Intl.Locale(navigator.language).region ?? ""; } catch { return ""; }
}
function suggestedLanguage(country: string, preferCountry = false) {
  if (preferCountry && countryLanguages[country]) return countryLanguages[country];
  return detectBrowserLanguage(navigator.languages ?? [navigator.language]) ?? countryLanguages[country] ?? "en";
}
function readPreferences(): Preferences {
  const defaults: Preferences = { language: suggestedLanguage(browserCountry()), automatic: true, country: browserCountry(), manualCountry: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || !isLanguage(saved.language)) return defaults;
    const country = typeof saved.country === "string" && /^[A-Z]{2}$/.test(saved.country) ? saved.country : defaults.country;
    return {
      language: saved.automatic === false ? saved.language : suggestedLanguage(country, saved.manualCountry === true),
      automatic: saved.automatic !== false, country, manualCountry: saved.manualCountry === true,
    };
  } catch { return defaults; }
}
const LanguageContext = createContext<{
  language: Language;
  automatic: boolean;
  country: string;
  manualCountry: boolean;
  detection: "detecting" | "network" | "browser";
  chooseLanguage: (language: Language | "auto") => void;
  chooseCountry: (country: string) => void;
  t: (key: string) => string;
}>({
  language: "en", automatic: true, country: "", manualCountry: false, detection: "browser",
  chooseLanguage: () => {}, chooseCountry: () => {}, t: key => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [detectedCountry, setDetectedCountry] = useState(browserCountry);
  const [detection, setDetection] = useState<"detecting" | "network" | "browser">("detecting");
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Private browsing can disable storage. */ }
    document.documentElement.lang = preferences.language;
    document.documentElement.dir = ["ar", "ur"].includes(preferences.language) ? "rtl" : "ltr";
  }, [preferences]);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    // Country-only IP estimate. Never request GPS, send credentials, or infer trading eligibility.
    void fetch("https://api.country.is/", { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async response => {
        if (!response.ok) throw Error("Country detection unavailable");
        const data: unknown = await response.json();
        const country = (data as { country?: unknown } | null)?.country;
        if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) throw Error("Invalid country estimate");
        if (!active) return;
        setDetectedCountry(country);
        setDetection("network");
        setPreferences(current => current.manualCountry ? current : {
          ...current, country,
          language: current.automatic ? suggestedLanguage(country) : current.language,
        });
      })
      .catch(() => { if (active) setDetection("browser"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);
  return <LanguageContext.Provider value={{
    ...preferences, detection,
    chooseLanguage: language => setPreferences(current => ({
      ...current, automatic: language === "auto",
      language: language === "auto" ? suggestedLanguage(current.country, current.manualCountry) : language,
    })),
    chooseCountry: country => setPreferences(current => ({
      ...current, country: country || detectedCountry, manualCountry: Boolean(country),
      language: current.automatic
        ? country ? countryLanguages[country] ?? "en" : suggestedLanguage(detectedCountry)
        : current.language,
    })),
    t: key => translate(preferences.language, key),
  }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
