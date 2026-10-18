import { useEffect, useState } from "react";

const RATE_URL = "https://open.er-api.com/v6/latest/USD";
const RATE_CACHE_KEY = "protraders-fx:usd-kes-rate-v1";
const ONE_HOUR = 60 * 60 * 1000;

export type UsdKesRateSnapshot = {
  rate: number;
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
};

function isSnapshot(value: unknown): value is UsdKesRateSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<UsdKesRateSnapshot>;
  return typeof item.rate === "number"
    && Number.isFinite(item.rate)
    && item.rate > 0
    && typeof item.updatedAt === "string"
    && Number.isFinite(Date.parse(item.updatedAt))
    && typeof item.nextUpdateAt === "number"
    && Number.isFinite(item.nextUpdateAt);
}

function readCachedRate(): UsdKesRateSnapshot | null {
  try {
    const serialized = window.localStorage.getItem(RATE_CACHE_KEY);
    if (!serialized || serialized.length > 1000) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function requestRate(): Promise<UsdKesRateSnapshot> {
  const rateWindow = window as RateWindow;
  if (rateWindow.__ptUsdKesRateRequest) return rateWindow.__ptUsdKesRateRequest;

  const request = (async () => {
    const response = await fetch(RATE_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`USD/KSh rate request failed (${response.status})`);
    const payload = await response.json() as RatePayload;
    const rate = payload.rates?.KES;
    const updatedAt = payload.time_last_update_utc;
    const nextUpdateUnix = payload.time_next_update_unix;
    if (
      payload.result !== "success"
      || payload.base_code !== "USD"
      || typeof rate !== "number"
      || !Number.isFinite(rate)
      || rate <= 0
      || typeof updatedAt !== "string"
      || !Number.isFinite(Date.parse(updatedAt))
      || typeof nextUpdateUnix !== "number"
      || !Number.isFinite(nextUpdateUnix)
    ) {
      throw new Error("USD/KSh rate response was invalid");
    }

    const snapshot: UsdKesRateSnapshot = {
      rate,
      updatedAt,
      nextUpdateAt: nextUpdateUnix * 1000,
    };
    try {
      window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // The live rate remains usable if browser storage is unavailable.
    }
    return snapshot;
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
    updatedAt: snapshot?.updatedAt ?? null,
    loading,
    stale: snapshot !== null && (failed || snapshot.nextUpdateAt <= Date.now()),
    refresh: () => setRevision((value) => value + 1),
  };
}
