import { useEffect, useState } from "react";

const RATE_URL = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
const RATE_CACHE_KEY = "protraders-fx:currency-rates-v2";
const ONE_HOUR = 60 * 60 * 1000;

export type UsdKesRateSnapshot = {
  rate: number;
  rates: Record<string, number>;
  source: string;
  updatedAt: string;
  nextUpdateAt: number;
};

type RateWindow = Window & {
  __ptUsdKesRateRequest?: Promise<UsdKesRateSnapshot>;
};

type RatePayload = {
  result?: unknown;
  base_code?: unknown;
  rates?: Record<string, unknown>;
  time_last_update_utc?: unknown;
  time_next_update_unix?: unknown;
  usd?: Record<string, unknown>;
  date?: unknown;
};

function isSnapshot(value: unknown): value is UsdKesRateSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<UsdKesRateSnapshot>;
  return typeof item.rate === "number"
    && Number.isFinite(item.rate)
    && item.rate > 0
    && !!item.rates
    && typeof item.rates === "object"
    && Object.entries(item.rates).every(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0)
    && item.rates.USD === 1
    && item.rates.KES === item.rate
    && typeof item.source === "string"
    && typeof item.updatedAt === "string"
    && Number.isFinite(Date.parse(item.updatedAt))
    && Date.now() - Date.parse(item.updatedAt) < 7 * 24 * ONE_HOUR
    && Date.parse(item.updatedAt) <= Date.now() + 5 * 60 * 1000
    && typeof item.nextUpdateAt === "number"
    && Number.isFinite(item.nextUpdateAt);
}

function readCachedRate(): UsdKesRateSnapshot | null {
  try {
    const serialized = window.localStorage.getItem(RATE_CACHE_KEY);
    if (serialized && serialized.length < 20000) {
      const parsed: unknown = JSON.parse(serialized);
      if (isSnapshot(parsed)) return parsed;
    }
    // Preserve a previously verified KSh estimate while fetching the complete table.
    const legacy = JSON.parse(window.localStorage.getItem("protraders-fx:usd-kes-rate-v1") ?? "null");
    const migrated = legacy && {
      ...legacy, rates: { USD: 1, KES: legacy.rate }, source: "Saved KSh estimate", nextUpdateAt: 0,
    };
    return isSnapshot(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

async function requestRate(): Promise<UsdKesRateSnapshot> {
  const rateWindow = window as RateWindow;
  if (rateWindow.__ptUsdKesRateRequest) return rateWindow.__ptUsdKesRateRequest;

  const request = (async () => {
    for (const [url, source] of [[RATE_URL, "ExchangeRate-API"], [FALLBACK_URL, "Currency API"]]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" }, signal: controller.signal, credentials: "omit",
        });
        if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status})`);
        const payload = await response.json() as RatePayload;
        const primary = source === "ExchangeRate-API";
        if (primary && (payload.result !== "success" || payload.base_code !== "USD")) throw new Error("Invalid rate base");
        const values = primary ? payload.rates : payload.usd;
        if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Invalid rate table");
        const rates: Record<string, number> = {};
        for (const [key, value] of Object.entries(values)) {
          const code = key.toUpperCase();
          if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) rates[code] = value;
        }
        rates.USD = 1;
        const updatedAt = primary ? payload.time_last_update_utc : payload.date;
        if (typeof updatedAt !== "string") throw new Error("Missing rate date");
        const next = primary && typeof payload.time_next_update_unix === "number"
          ? payload.time_next_update_unix * 1000 : Date.parse(updatedAt) + 24 * ONE_HOUR;
        const snapshot = { rate: rates.KES, rates, source, updatedAt, nextUpdateAt: next };
        if (!isSnapshot(snapshot)) throw new Error("Invalid exchange-rate response");
        try {
          window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(snapshot));
        } catch { /* Live quotes remain usable when storage is disabled. */ }
        return snapshot;
      } catch {
        // Try the independent fallback before reporting unavailable.
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("Exchange-rate providers are unavailable");
  })();

  rateWindow.__ptUsdKesRateRequest = request;
  try {
    return await request;
  } finally {
    if (rateWindow.__ptUsdKesRateRequest === request) {
      delete rateWindow.__ptUsdKesRateRequest;
    }
  }
}

export function useUsdKesRate() {
  const [snapshot, setSnapshot] = useState<UsdKesRateSnapshot | null>(() => readCachedRate());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    let current = readCachedRate();
    if (current) setSnapshot(current);

    const scheduleRefresh = (nextUpdateAt?: number) => {
      if (!active) return;
      const delay = nextUpdateAt && nextUpdateAt > Date.now()
        ? nextUpdateAt - Date.now()
        : ONE_HOUR;
      refreshTimer = window.setTimeout(refresh, delay);
    };

    const refresh = async () => {
      if (active) setLoading(true);
      try {
        current = await requestRate();
        if (active) {
          setSnapshot(current);
          setFailed(false);
          setCheckedAt(new Date().toISOString());
        }
        scheduleRefresh(current.nextUpdateAt);
      } catch {
        if (active) setFailed(true);
        // Retry transient failures promptly; retain a dated estimate, never invent a rate.
        if (active) refreshTimer = window.setTimeout(refresh, 30_000);
      } finally {
        if (active) setLoading(false);
      }
    };

    const retryOnline = () => { setRevision((value) => value + 1); };
    window.addEventListener("online", retryOnline);
    if (revision === 0 && current && current.nextUpdateAt > Date.now()) {
      scheduleRefresh(current.nextUpdateAt);
    } else {
      void refresh();
    }

    return () => {
      active = false;
      window.removeEventListener("online", retryOnline);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [revision]);

  return {
    rate: snapshot?.rate ?? null,
    rates: snapshot?.rates ?? null,
    source: snapshot?.source ?? null,
    checkedAt,
    updatedAt: snapshot?.updatedAt ?? null,
    loading,
    stale: snapshot !== null && (failed || snapshot.nextUpdateAt <= Date.now()),
    refresh: () => setRevision((value) => value + 1),
  };
}
