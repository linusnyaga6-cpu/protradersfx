import type { Request, Response } from "express";
import { DerivSessionError, readSession, type Session } from "../routes/auth";

const OPTIONS_API_BASE = "https://api.derivws.com/trading/v1/options";
const PROPOSAL_TIMEOUT_MS = 12_000;

export type DerivAccount = {
  account_id: string;
  account_type: "demo" | "real";
  balance: number;
  currency: string;
  status: "active" | "inactive";
};

export type DerivContractType =
  | "CALL"
  | "PUT"
  | "DIGITOVER"
  | "DIGITUNDER"
  | "DIGITEVEN"
  | "DIGITODD";

export class DerivApiError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "DerivApiError";
  }
}

type DerivMessage = {
  msg_type?: string;
  error?: { code?: string; message?: string };
  proposal?: {
    id?: string;
    ask_price?: number | string;
    payout?: number | string;
    spot?: number | string;
    longcode?: string;
    display_value?: number | string;
    currency?: string;
  };
  buy?: {
    contract_id?: string | number;
    transaction_id?: string | number;
    buy_price?: number | string;
  };
  proposal_open_contract?: {
    contract_id?: string | number;
    is_sold?: number;
    status?: string;
    profit?: number | string;
    payout?: number | string;
    buy_price?: number | string;
    entry_spot?: number | string;
    exit_spot?: number | string;
    entry_tick?: number | string;
    exit_tick?: number | string;
    currency?: string;
  };
};

type DerivExecutionResult = {
  proposal: NonNullable<DerivMessage["proposal"]>;
  buy: NonNullable<DerivMessage["buy"]>;
  contract: NonNullable<DerivMessage["proposal_open_contract"]>;
  settlementPending: boolean;
  settlementError: string | null;
  orderStatusUnknown: boolean;
};

function finiteNumber(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

export async function getAuthenticatedDerivSession(req: Request, res: Response) {
  try {
    const session = await readSession(req, res);
    if (!session) {
      throw new DerivApiError("Connect your Deriv account to continue.", 401);
    }
    return session;
  } catch (error) {
    if (error instanceof DerivApiError) throw error;
    if (error instanceof DerivSessionError) {
      throw new DerivApiError(error.message, error.statusCode);
    }
    throw error;
  }
}

export async function readOptionsAccounts(session: Session): Promise<DerivAccount[]> {
  const response = await fetch(`${OPTIONS_API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: unknown; errors?: Array<{ message?: string }> }
    | null;

  if (!response.ok) {
    const statusCode = response.status === 401 || response.status === 403 ? 401 : 502;
    throw new DerivApiError(
      payload?.errors?.[0]?.message ?? "Unable to verify your Deriv accounts.",
      statusCode,
    );
  }

  if (!Array.isArray(payload?.data)) {
    throw new DerivApiError("Deriv returned an invalid account list.");
  }

  return payload.data.filter((account): account is DerivAccount => {
    if (typeof account !== "object" || account === null) return false;
    const item = account as Partial<DerivAccount>;
    return (
      typeof item.account_id === "string" &&
      (item.account_type === "demo" || item.account_type === "real") &&
      typeof item.currency === "string" &&
      typeof item.balance === "number" &&
      Number.isFinite(item.balance) &&
      (item.status === "active" || item.status === "inactive")
    );
  });
}

export async function getDerivAccountsForRequest(req: Request, res: Response) {
  const session = await getAuthenticatedDerivSession(req, res);
  const accounts = await readOptionsAccounts(session);
  const activeAccounts = accounts.filter((account) => account.status === "active");
  return { session, accounts: activeAccounts };
}

export async function getDerivAccountContext(req: Request, res: Response) {
  const { session, accounts } = await getDerivAccountsForRequest(req, res);
  const selectedAccount = accounts.find(
    (account) => account.account_type === session.activeMode,
  );

  if (!selectedAccount) {
    throw new DerivApiError(
      `No active ${session.activeMode} Options account is available for this Deriv login.`,
      409,
    );
  }

  return { session, accounts, selectedAccount };
}

export async function getAccountOtpUrl(session: Session, accountId: string) {
  const response = await fetch(
    `${OPTIONS_API_BASE}/accounts/${encodeURIComponent(accountId)}/otp`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { data?: { url?: unknown }; errors?: Array<{ message?: string }> }
    | null;

  if (!response.ok) {
    const statusCode = response.status === 401 || response.status === 403 ? 401 : 502;
    throw new DerivApiError(
      payload?.errors?.[0]?.message ?? "Deriv could not authorize this account for trading.",
      statusCode,
    );
  }

  const rawUrl = payload?.data?.url;
  if (typeof rawUrl !== "string") {
    throw new DerivApiError("Deriv did not return an account trading connection.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DerivApiError("Deriv returned an invalid account trading connection.");
  }

  if (url.protocol !== "wss:" || url.hostname !== "api.derivws.com") {
    throw new DerivApiError("Deriv returned an unsupported account trading connection.");
  }

  return rawUrl;
}

export function isValidDerivSymbol(value: unknown): value is string {
  return typeof value === "string" && /^(1HZ\d+V|R_\d+|frx[A-Z]{6})$/.test(value);
}

export function isDerivDigitContractType(
  value: unknown,
): value is "DIGITOVER" | "DIGITUNDER" | "DIGITEVEN" | "DIGITODD" {
  return (
    value === "DIGITOVER" ||
    value === "DIGITUNDER" ||
    value === "DIGITEVEN" ||
    value === "DIGITODD"
  );
}

export function isDerivVolatilitySymbol(value: unknown): value is string {
  return typeof value === "string" && /^(1HZ\d+V|R_\d+)$/.test(value);
}

export function isValidDerivContractType(value: unknown): value is DerivContractType {
  return (
    value === "CALL" ||
    value === "PUT" ||
    value === "DIGITOVER" ||
    value === "DIGITUNDER" ||
    value === "DIGITEVEN" ||
    value === "DIGITODD"
  );
}

export function getDerivBarrierError(contractType: DerivContractType, barrier: unknown) {
  const valid =
    contractType === "DIGITOVER"
      ? Number.isInteger(barrier) && (barrier as number) >= 0 && (barrier as number) <= 8
      : contractType === "DIGITUNDER"
        ? Number.isInteger(barrier) && (barrier as number) >= 1 && (barrier as number) <= 9
        : true;
  if (valid) return null;
  return contractType === "DIGITOVER"
    ? "Over barrier must be a whole digit from 0 to 8."
    : "Under barrier must be a whole digit from 1 to 9.";
}

export function numberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function executionTimeoutMs(duration: number, durationUnit: string) {
  const durationMultiplier =
    durationUnit === "m" ? 60_000 : durationUnit === "s" ? 1_000 : 2_000;
  return Math.max(30_000, duration * durationMultiplier + 20_000);
}

function requestOptionsSocket<T>(input: {
  socketUrl: string;
  timeoutMs: number;
  onOpen: (send: (payload: object) => void) => void;
  onMessage: (message: DerivMessage, send: (payload: object) => void) => T | undefined;
  onFailure?: (message: string) => T | undefined;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(input.socketUrl);
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // Deriv may already have closed the socket.
      }
      callback();
    };
    const fail = (message: string) => {
      const recovered = input.onFailure?.(message);
      if (recovered !== undefined) {
        finish(() => resolve(recovered));
        return;
      }
      finish(() => reject(new DerivApiError(message)));
    };

    timeout = setTimeout(
      () => fail("Deriv did not return a settled trade before the connection timed out."),
      input.timeoutMs,
    );
    socket.addEventListener("error", () => fail("Deriv trading connection failed."));
    socket.addEventListener("close", () => {
      if (!settled) fail("Deriv closed the trading connection before it completed.");
    });
    socket.addEventListener("open", () => {
      try {
        input.onOpen((payload) => socket.send(JSON.stringify(payload)));
      } catch (error) {
        fail(error instanceof Error ? error.message : "Unable to send the Deriv request.");
      }
    });
    socket.addEventListener("message", (event) => {
      let message: DerivMessage;
      try {
        message = JSON.parse(String(event.data)) as DerivMessage;
      } catch {
        fail("Deriv returned an unreadable trading response.");
        return;
      }
      if (message.error) {
        const detail = message.error.message ?? "Deriv rejected the trading request.";
        fail(message.error.code ? `${message.error.code}: ${detail}` : detail);
        return;
      }
      const send = (payload: object) => socket.send(JSON.stringify(payload));
      try {
        const result = input.onMessage(message, send);
        if (result !== undefined) finish(() => resolve(result));
      } catch (error) {
        fail(error instanceof Error ? error.message : "Deriv rejected the trading request.");
      }
    });
  });
}

export async function requestDerivProposal(input: {
  session: Session;
  account: DerivAccount;
  symbol: string;
  contractType: DerivContractType;
  amount: number;
  duration: number;
  durationUnit: string;
  barrier?: number;
}) {
  const barrierError = getDerivBarrierError(input.contractType, input.barrier);
  if (barrierError) throw new DerivApiError(barrierError, 400);
  const socketUrl = await getAccountOtpUrl(input.session, input.account.account_id);
  return requestOptionsSocket({
    socketUrl,
    timeoutMs: PROPOSAL_TIMEOUT_MS,
    onOpen(send) {
      send({
        proposal: 1,
        amount: input.amount,
        basis: "stake",
        contract_type: input.contractType,
        currency: input.account.currency,
        duration: input.duration,
        duration_unit: input.durationUnit,
        underlying_symbol: input.symbol,
        ...(input.barrier === undefined ? {} : { barrier: String(input.barrier) }),
      });
    },
    onMessage(message, send) {
      if (message.msg_type !== "proposal" || !message.proposal) return undefined;
      return message.proposal;
    },
  });
}

export async function requestDerivExecution(input: {
  session: Session;
  account: DerivAccount;
  symbol: string;
  contractType: DerivContractType;
  amount: number;
  duration: number;
  durationUnit: string;
  barrier?: number;
}) {
  const barrierError = getDerivBarrierError(input.contractType, input.barrier);
  if (barrierError) throw new DerivApiError(barrierError, 400);
  const socketUrl = await getAccountOtpUrl(input.session, input.account.account_id);
  let proposal: NonNullable<DerivMessage["proposal"]> | undefined;
  let buy: NonNullable<DerivMessage["buy"]> | undefined;
  let buyRequestSent = false;

  return requestOptionsSocket<DerivExecutionResult>({
    socketUrl,
    timeoutMs: executionTimeoutMs(input.duration, input.durationUnit),
    onOpen(send) {
      send({
        proposal: 1,
        amount: input.amount,
        basis: "stake",
        contract_type: input.contractType,
        currency: input.account.currency,
        duration: input.duration,
        duration_unit: input.durationUnit,
        underlying_symbol: input.symbol,
        ...(input.barrier === undefined ? {} : { barrier: String(input.barrier) }),
      });
    },
    onMessage(message, send) {
      if (!proposal) {
        if (message.msg_type !== "proposal" || !message.proposal) {
          return undefined;
        }
        proposal = message.proposal;
          const askPrice = finiteNumber(proposal.ask_price);
          if (!proposal.id || askPrice === null || askPrice <= 0) {
          throw new DerivApiError("Deriv proposal is missing a valid ask price; no trade was submitted.");
        }
          send({ buy: proposal.id, price: askPrice });
          buyRequestSent = true;
        return undefined;
      }

      if (!buy) {
        if (message.msg_type !== "buy" || !message.buy) return undefined;
        buy = message.buy;
        if (!buy.contract_id) {
          throw new DerivApiError("Deriv did not return a contract ID.");
        }
        const contractId = finiteNumber(buy.contract_id);
        if (contractId === null || !Number.isSafeInteger(contractId) || contractId < 1) {
          throw new DerivApiError("Deriv confirmed the buy but returned an invalid contract ID.");
        }
        send({
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1,
        });
        return undefined;
      }

      if (message.msg_type !== "proposal_open_contract" || !message.proposal_open_contract) {
        return undefined;
      }

      const contract = message.proposal_open_contract;
      const settled =
        contract.is_sold === 1 || contract.status === "won" || contract.status === "lost";
      if (!settled || !proposal || !buy) return undefined;
      return {
        proposal,
        buy,
        contract,
        settlementPending: false,
        settlementError: null,
        orderStatusUnknown: false,
      };
    },
    onFailure(message) {
      if (!proposal) return undefined;
      const confirmedContractId = buy ? finiteNumber(buy.contract_id) : null;
      if (
        buy &&
        confirmedContractId !== null &&
        Number.isSafeInteger(confirmedContractId) &&
        confirmedContractId > 0
      ) {
        return {
          proposal,
          buy,
          contract: {
            contract_id: buy.contract_id,
            is_sold: 0,
            status: "open",
            buy_price: buy.buy_price ?? proposal.ask_price,
            currency: proposal.currency ?? input.account.currency,
          },
          settlementPending: true,
          settlementError: message,
          orderStatusUnknown: false,
        };
      }
      if (buyRequestSent) {
        return {
          proposal,
          buy: buy ?? { buy_price: proposal.ask_price },
          contract: {
            is_sold: 0,
            status: "unknown",
            buy_price: proposal.ask_price,
            currency: proposal.currency ?? input.account.currency,
          },
          settlementPending: false,
          settlementError: message,
          orderStatusUnknown: true,
        };
      }
      return undefined;
    },
  });
}
