import { Router, type IRouter, type Response } from "express";
import { settlementFinancials } from "../lib/settlement-financials";
import {
  DerivApiError,
  getDerivAccountContext,
  getDerivAccountsForRequest,
  getDerivBarrierError,
  isDerivDigitContractType,
  isDerivVolatilitySymbol,
  isValidDerivContractType,
  isValidDerivSymbol,
  numberInRange,
  requestDerivExecution,
  type DerivContractType,
} from "../lib/deriv-options";
import { recordPlatformTradeActivity } from "../lib/platform-activity";

const router: IRouter = Router();

const BOT_CONTRACTS: Record<number, DerivContractType[]> = {
  1: ["DIGITEVEN", "DIGITODD"],
  2: ["DIGITEVEN", "DIGITODD"],
  3: ["DIGITEVEN", "DIGITODD"],
  4: ["DIGITEVEN", "DIGITODD"],
  5: ["DIGITOVER"],
  6: ["DIGITUNDER"],
  7: ["CALL", "PUT"],
  8: ["CALL", "PUT"],
  9: ["CALL", "PUT"],
  10: ["DIGITEVEN", "DIGITODD"],
  11: ["DIGITEVEN"],
  12: ["DIGITODD"],
};

function sendError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const statusCode = error instanceof DerivApiError ? error.statusCode : 502;
  res.status(statusCode).json({ error: message });
}

function finiteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

router.get("/live-trading/eligibility", async (req, res) => {
  try {
    const { accounts } = await getDerivAccountsForRequest(req, res);
    const realAccounts = accounts.filter((account) => account.account_type === "real");
    const eligible = realAccounts.some(
      (account) => account.currency.toUpperCase() === "USD" && account.balance > 100,
    );

    if (eligible) {
      res.json({ eligible: true, reason: "Verified real USD account above $100." });
      return;
    }

    const hasUsdAccount = realAccounts.some(
      (account) => account.currency.toUpperCase() === "USD",
    );
    res.json({
      eligible: false,
      reason: !realAccounts.length
        ? "A real Deriv account is required for live-trading booking."
        : hasUsdAccount
          ? "The real USD account balance must be above $100."
          : "A USD-denominated real account is required for live-trading booking.",
    });
  } catch (error) {
    sendError(res, error, "Unable to check live-trading booking eligibility.");
  }
});

router.post("/premium-bots/execute", async (req, res) => {
  const body = (req.body ?? {}) as {
    botId?: unknown;
    symbol?: unknown;
    contractType?: unknown;
    amount?: unknown;
    duration?: unknown;
    durationUnit?: unknown;
    barrier?: unknown;
    confirm?: unknown;
  };

  if (body.confirm !== true) {
    res.status(400).json({ error: "Start the bot before submitting an order." });
    return;
  }
  if (!Number.isInteger(body.botId) || typeof body.botId !== "number" || body.botId < 1 || body.botId > 12) {
    res.status(400).json({ error: "Choose a valid Deriv Pro Bot." });
    return;
  }
  if (!isValidDerivSymbol(body.symbol)) {
    res.status(400).json({ error: "Choose a valid Deriv market symbol." });
    return;
  }
  if (!isValidDerivContractType(body.contractType)) {
    const supplied = typeof body.contractType === "string" ? ` "${body.contractType.slice(0, 40)}"` : "";
    res.status(400).json({
      error: `Unsupported Deriv contract type${supplied}. Choose CALL, PUT, DIGITOVER, DIGITUNDER, DIGITEVEN, or DIGITODD.`,
    });
    return;
  }
  if (isDerivDigitContractType(body.contractType) && !isDerivVolatilitySymbol(body.symbol)) {
    res.status(400).json({
      error: "Digit contracts require a Volatility market. Select one before starting this bot.",
    });
    return;
  }
  if (!BOT_CONTRACTS[body.botId].includes(body.contractType)) {
    res.status(400).json({ error: "This bot cannot place that contract type." });
    return;
  }
  if (
    !numberInRange(body.amount, 0.35, 10_000) ||
    !numberInRange(body.duration, 1, 365) ||
    !Number.isInteger(body.duration)
  ) {
    res.status(400).json({ error: "Stake or duration is outside the supported range." });
    return;
  }
  const durationUnit =
    body.durationUnit === "t" || body.durationUnit === "s" || body.durationUnit === "m"
      ? body.durationUnit
      : "t";
  const needsBarrier =
    body.contractType === "DIGITOVER" || body.contractType === "DIGITUNDER";
  const barrier = typeof body.barrier === "number" ? body.barrier : undefined;
  const barrierError = needsBarrier ? getDerivBarrierError(body.contractType, barrier) : null;
  if (barrierError) {
    res.status(400).json({ error: barrierError });
    return;
  }

  try {
    const { session, selectedAccount } = await getDerivAccountContext(req, res);
    const execution = await requestDerivExecution({
      session,
      account: selectedAccount,
      symbol: body.symbol,
      contractType: body.contractType,
      amount: body.amount,
      duration: body.duration,
      durationUnit,
      barrier: needsBarrier ? barrier : undefined,
    });
    const { proposal, buy, contract } = execution;
    const buyPrice =
      finiteNumber(contract.buy_price) ??
      finiteNumber(buy.buy_price) ??
      finiteNumber(proposal.ask_price) ??
      body.amount;
    const isSettled =
      !execution.settlementPending &&
      !execution.orderStatusUnknown &&
      (contract.status === "won" || contract.status === "lost" || contract.is_sold === 1);
    const { profit, payout } = settlementFinancials(contract, buyPrice, isSettled);
    const result =
      isSettled && (contract.status === "won" || (profit !== null && profit > 0))
        ? "won"
        : isSettled && (contract.status === "lost" || (profit !== null && profit < 0))
          ? "lost"
          : "pending";
    const contractId =
      typeof buy.contract_id === "string" || typeof buy.contract_id === "number"
        ? String(buy.contract_id)
        : "";
    const stake = finiteNumber(body.amount);
    if (contractId && stake !== null) {
      await recordPlatformTradeActivity(req, {
        accountId: selectedAccount.account_id,
        mode: selectedAccount.account_type,
        symbol: body.symbol,
        contractType: body.contractType,
        currency: proposal.currency ?? selectedAccount.currency,
        stake,
        profit,
        result,
        contractId,
      });
    }

    res.json({
      execution: "live",
      trade: {
        botId: body.botId,
        contractId: buy.contract_id ?? null,
        transactionId: buy.transaction_id ?? null,
        type: body.contractType,
        contractType: body.contractType,
        barrier: needsBarrier ? barrier : undefined,
        stake: body.amount,
        buyPrice,
        currency: proposal.currency ?? selectedAccount.currency,
        mode: selectedAccount.account_type,
        result,
        status: contract.status ?? null,
        settlementPending: execution.settlementPending,
        orderStatusUnknown: execution.orderStatusUnknown,
        profit,
        payout,
        entrySpot: contract.entry_spot ?? contract.entry_tick ?? null,
        exitSpot: contract.exit_spot ?? contract.exit_tick ?? null,
      },
    });
  } catch (error) {
    sendError(res, error, "Unable to execute this Deriv Pro Bot trade.");
  }
});

export default router;
