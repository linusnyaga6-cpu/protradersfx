import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe2, X } from "lucide-react";
import { countries, isLanguage, languageNames } from "../lib/languages";
import { useLanguage } from "../lib/language-context";
import "./language-selector.css";

export default function LanguageSelector() {
  const { language, automatic, country, manualCountry, detection, chooseLanguage, chooseCountry } = useLanguage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); trigger.current?.focus(); };
  }, [open]);
  const displayNames = new Intl.DisplayNames([language], { type: "region" });
  const countryName = (code: string) => displayNames.of(code) ?? code;
  const options = [...new Set([...countries, ...(country ? [country] : [])])].sort((a, b) => countryName(a).localeCompare(countryName(b), language));
  return <>
    <button ref={trigger} className="language-trigger" type="button" aria-label="Language and country / Lugha na nchi"
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-testid="language-selector-button">
      <Globe2 size={16} aria-hidden="true" /><span>{language.toUpperCase()}</span>
    </button>
    {open && createPortal(
      <dialog ref={dialog} className="language-dialog" aria-labelledby="language-dialog-title"
        onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
        <section className="language-dialog-content">
          <header><h2 id="language-dialog-title"><Globe2 size={19} /> Language / Country</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close language settings"><X size={19} /></button></header>
          <label htmlFor="site-language">Language · {languageNames[language]}</label>
          <select id="site-language" value={automatic ? "auto" : language} onChange={event => {
            const value = event.target.value;
            if (value === "auto" || isLanguage(value)) chooseLanguage(value);
          }}>
            <option value="auto">Automatic / Suggested language</option>
            {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <p role="status" data-testid="language-status">{automatic ? "Automatically suggested" : "Your saved choice"}: {languageNames[language]}</p>
          <label htmlFor="site-country">Country / region preference</label>
          <select id="site-country" value={manualCountry ? country : ""} onChange={event => chooseCountry(event.target.value)}>
            <option value="">Automatic{country ? ` · ${countryName(country)}` : ""}</option>
            {options.map(code => <option value={code} key={code}>{countryName(code)}</option>)}
          </select>
          <small role="status">{manualCountry ? "Manually selected" : detection === "detecting" ? "Estimating country…" :
            detection === "network" ? "Approximate network country (VPNs may affect this)" : "Browser region only; network estimate unavailable"}</small>
          <p className="language-coverage">Available in 18 languages for the landing-page introduction and shared tool navigation. Trading forms, detailed help and provider errors remain in English.</p>
          <p className="language-eligibility">Country selection is a display preference, not proof of residence or trading permission. Deriv determines available accounts and products using your verified residence. This setting cannot bypass restrictions.</p>
          <a href="https://deriv.com/terms-and-conditions" target="_blank" rel="noopener noreferrer">Check Deriv’s official terms and eligibility</a>
          <small className="language-privacy">Country detection uses country.is, which receives your network IP to return an approximate country. No GPS permission is requested. Only the country code and your display preferences are saved here.</small>
          <button type="button" className="language-done" onClick={() => setOpen(false)}>Done</button>
        </section>
      </dialog>, document.body
    )}
  </>;
}
