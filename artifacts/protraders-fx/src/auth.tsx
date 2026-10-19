import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAccountRefresher } from './lib/account-refresh';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const authReturnPath = `${basePath || ''}/?view=dashboard`;

export type AccountMode = 'demo' | 'real';

export type AppAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: { label: string; email?: string } | null;
  activeMode: AccountMode;
  balance: number | null;
  balanceError: string | null;
  currency: string;
  bootProgress: number;
  startupError: string | null;
  signInHref: string;
  signUpHref: string;
  retrySession: () => void;
  refreshAccount: () => Promise<void>;
  switchMode: (mode: AccountMode) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AppAuthState | null>(null);

export function useAppAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAppAuth must be used inside an auth provider');
  return value;
}

function derivAuthHref(action: 'login' | 'signup') {
  const path = `${basePath || ''}/api/deriv/${action}`;
  return `${path}?returnTo=${encodeURIComponent(authReturnPath)}`;
}

type LegacyAccountResponse = {
  authenticated?: boolean;
  mode?: AccountMode;
  balance?: number;
  currency?: string;
  loginid?: string;
};

export function LegacyAuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [activeMode, setActiveMode] = useState<AccountMode>('demo');
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [user, setUser] = useState<AppAuthState['user']>(null);
  const [bootProgress, setBootProgress] = useState(0);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  const switchingAccount = useRef(false);
  const activeModeRef = useRef(activeMode);
  activeModeRef.current = activeMode;
  const accountRefresher = useRef<ReturnType<typeof createAccountRefresher<LegacyAccountResponse>> | null>(null);
  if (!accountRefresher.current) accountRefresher.current = createAccountRefresher(async (mode) => {
    const response = await fetch(`${basePath || ''}/api/account?mode=${mode}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 401) {
        setIsSignedIn(false);
        setUser(null);
        setBalance(null);
      }
      throw new Error(`Balance refresh returned ${response.status}.`);
    }
    const payload = await response.json() as LegacyAccountResponse;
    if (!payload.authenticated) throw new Error('Reconnect your Deriv account to update the balance.');
    if (payload.mode && payload.mode !== mode) throw new Error('Deriv returned a different account mode.');
    if (typeof payload.balance !== 'number' || !Number.isFinite(payload.balance)) {
      throw new Error('Deriv balance is temporarily unavailable.');
    }
    return payload;
  }, (payload, mode) => {
    setIsSignedIn(true);
    setActiveMode(payload.mode ?? mode);
    setBalance(payload.balance ?? null);
    setBalanceError(null);
    setCurrency(payload.currency ?? 'USD');
    setUser(payload.loginid ? { label: payload.loginid } : { label: 'Deriv trader' });
  });
  const loadAccount = async (mode: AccountMode) => {
    if (switchingAccount.current || mode !== activeModeRef.current) return;
    try {
      await accountRefresher.current!.refresh(mode);
    } catch (error) {
      // Retain the last verified balance, but never present refresh failures as current.
      if (!switchingAccount.current && mode === activeModeRef.current) {
        setBalanceError(error instanceof Error ? error.message : 'Balance update unavailable.');
      }
    }
  };

  useEffect(() => {
    if (!isSignedIn) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'hidden') await loadAccount(activeMode);
      if (!stopped) timer = window.setTimeout(tick, 3_000);
    };
    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden') void loadAccount(activeMode);
    };
    void tick();
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      accountRefresher.current?.invalidate();
    };
  }, [isSignedIn, activeMode]);

  useEffect(() => {
    let cancelled = false;
    let completed = false;
    let releaseTimer: number | undefined;
    const startedAt = Date.now();
    setStartupError(null);
    setBootProgress(4);
    const progressTimer = window.setInterval(() => {
      if (cancelled || completed) return;
      const elapsed = Date.now() - startedAt;
      setBootProgress(Math.min(94, 4 + Math.floor((elapsed / 8_000) * 90)));
    }, 100);
    const releaseLoading = async (error?: string) => {
      if (cancelled || completed) return;
      completed = true;
      setStartupError(error ?? null);
      setBootProgress(100);
      await new Promise<void>((resolve) => {
        releaseTimer = window.setTimeout(resolve, 180);
      });
      if (!cancelled) setIsLoaded(true);
    };
    const startupDeadline = window.setTimeout(() => {
      void releaseLoading('Deriv account check is taking too long. Retry the check or reconnect your Deriv account.');
    }, 8_000);

    const bootstrap = async () => {
      try {
        const response = await fetch(`${basePath || ''}/api/session`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Deriv session check returned ${response.status}.`);
        const payload = await response.json() as { authenticated?: boolean; activeMode?: AccountMode };
        if (cancelled) return;
        if (payload.authenticated) {
          const mode = payload.activeMode === 'real' ? 'real' : 'demo';
          setIsSignedIn(true);
          setStartupError(null);
          setActiveMode(mode);
          void releaseLoading();
          void loadAccount(mode).catch(() => undefined);
        } else {
          setIsSignedIn(false);
          setUser(null);
          setBalance(null);
          await releaseLoading();
        }
      } catch {
        if (!cancelled) {
          setIsSignedIn(false);
          setUser(null);
          await releaseLoading('Deriv account check could not be completed. Retry the check or reconnect your Deriv account.');
        }
      } finally {
        window.clearTimeout(startupDeadline);
        window.clearInterval(progressTimer);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
      window.clearTimeout(startupDeadline);
      window.clearTimeout(releaseTimer);
      window.clearInterval(progressTimer);
    };
  }, [bootstrapAttempt]);

  const value = useMemo<AppAuthState>(() => ({
    isLoaded,
    isSignedIn,
    user,
    activeMode,
    balance,
    balanceError,
    currency,
    bootProgress,
    startupError,
    signInHref: derivAuthHref('login'),
    signUpHref: derivAuthHref('signup'),
    retrySession: () => {
      setStartupError(null);
      setIsLoaded(false);
      setBootProgress(0);
      setBootstrapAttempt((attempt) => attempt + 1);
    },
    refreshAccount: async () => {
      await loadAccount(activeMode);
    },
    switchMode: async (mode) => {
      if (switchingAccount.current) throw new Error('An account switch is already in progress.');
      switchingAccount.current = true;
      accountRefresher.current?.invalidate();
      try {
      // Drain the older GET before the session-changing POST, so its cookie cannot
      // switch the server back to the previous account after this switch completes.
      await accountRefresher.current?.idle();
      const response = await fetch(`${basePath || ''}/api/account/switch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mode }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json() as LegacyAccountResponse & { error?: string; message?: string };
      if (!response.ok || !payload.authenticated) {
        throw new Error(payload.message ?? payload.error ?? `Unable to switch to ${mode} mode.`);
      }
      setActiveMode(payload.mode ?? mode);
      setBalance(typeof payload.balance === 'number' ? payload.balance : null);
      setBalanceError(typeof payload.balance === 'number' ? null : 'Deriv balance is temporarily unavailable.');
      setCurrency(payload.currency ?? 'USD');
      if (payload.loginid) setUser({ label: payload.loginid });
      } finally {
        switchingAccount.current = false;
      }
    },
    signOut: async () => {
      await fetch(`${basePath || ''}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      window.location.assign(basePath || '/');
    },
  }), [activeMode, balance, balanceError, bootProgress, currency, isLoaded, isSignedIn, startupError, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}