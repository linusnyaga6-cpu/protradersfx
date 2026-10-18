import assert from "node:assert/strict";
import test from "node:test";
import { arabCountries, countryLanguages, countries, detectBrowserLanguage, heroDescriptions, isLanguage, languageNames, translate, translationKeys, translations } from "./languages.ts";

test("all eighteen languages have every shared label and a landing introduction", () => {
  assert.equal(Object.keys(languageNames).length, 18);
  for (const language of Object.keys(languageNames)) {
    assert.equal(translations[language].length, translationKeys.length, language);
    assert.ok(translations[language].every(text => typeof text === "string" && text.length > 0));
    assert.ok(heroDescriptions[language].length > 25);
  }
});
test("detects regional browser locales in preference order, including Filipino alias", () => {
  assert.equal(detectBrowserLanguage(["sw-KE", "en-US"]), "sw");
  assert.equal(detectBrowserLanguage(["pt-BR", "es-CO"]), "pt");
  assert.equal(detectBrowserLanguage(["tl-PH"]), "fil");
  assert.equal(detectBrowserLanguage(["ur-PK"]), "ur");
  assert.equal(detectBrowserLanguage(["xx-XX", "de-DE"]), "de");
  assert.equal(detectBrowserLanguage(["xx-XX"]), null);
});
test("country suggestions cover the user's regions without claiming eligibility", () => {
  assert.equal(countries.length, 45);
  for (const country of countries) assert.ok(isLanguage(countryLanguages[country]));
});
test("all 22 Arab League countries are selectable once and default to Arabic", () => {
  const expected = ["DZ","BH","KM","DJ","EG","IQ","JO","KW","LB","LY","MR","MA","OM","PS","QA","SA","SO","SD","SY","TN","AE","YE"];
  assert.deepEqual([...arabCountries].sort(), expected.sort());
  assert.equal(new Set(countries).size, countries.length);
  for (const code of expected) {
    assert.ok(countries.includes(code), code);
    assert.equal(countryLanguages[code], "ar", code);
    assert.ok(new Intl.DisplayNames(["ar"], { type: "region" }).of(code));
  }
});
test("only presentation text is translated, never contract codes or unknown errors", () => {
  assert.equal(translate("sw", "Dashboard"), "Dashibodi");
  assert.equal(translate("es", "Create account"), "Crear cuenta");
  assert.equal(translate("ar", "Manual Trader"), "التداول اليدوي");
  assert.equal(translate("sw", "DIGITOVER"), "DIGITOVER");
  assert.equal(translate("sw", "InvalidContractProposal"), "InvalidContractProposal");
  for (const invalid of ["constructor", "toString", "__proto__", "xx", null]) assert.equal(isLanguage(invalid), false);
});
