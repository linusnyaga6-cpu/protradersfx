import { Router, type IRouter, type Response } from "express";
import { settlementFinancials } from "../lib/settlement-financials";
import {
  DerivApiError,
  getDerivAccountContext,
  getDerivBarrierError,
  isDerivDigitContractType,
  isDerivVolatilitySymbol,
  isValidDerivContractType,
  isValidDerivSymbol,
  numberInRange,
  requestDerivExecution,
  requestDerivProposal,
} from "../lib/deriv-options";
import { recordPlatformTradeActivity } from "../lib/platform-activity";

const router: IRouter = Router();

type ProposalRequest = {
  symbol?: unknown;
  contractType?: unknown;
  amount?: unknown;
  duration?: unknown;
  durationUnit?: unknown;
  barrier?: unknown;
  confirm?: unknown;
};

function finiteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function validatedTradeInput(body: ProposalRequest) {
  if (!isValidDerivSymbol(body.symbol)) {
    return { error: "Choose a valid Deriv market symbol." } as const;
  }
  if (!isValidDerivContractType(body.contractType)) {
    const supplied = typeof body.contractType === "string" ? ` "${body.contractType.slice(0, 40)}"` : "";
    return {
      error: `Unsupported Deriv contract type${supplied}. Choose CALL, PUT, DIGITOVER, DIGITUNDER, DIGITEVEN, or DIGITODD.`,
    } as const;
  }
  if (isDerivDigitContractType(body.contractType) && !isDerivVolatilitySymbol(body.symbol)) {
    return { error: "Digit contracts require a Volatility market. Select one before trading." } as const;
  }
  if (!numberInRange(body.amount, 0.35, 10_000) || !numberInRange(body.duration, 1, 365)) {
    return { error: "Amount or duration is outside the supported range." } as const;
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
    return { error: barrierError } as const;
  }
  return {
    symbol: body.symbol,
    contractType: body.contractType,
    amount: body.amount,
    duration: body.duration,
    durationUnit,
    barrier: needsBarrier ? barrier : undefined,
  } as const;
}

function sendError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const statusCode = error instanceof DerivApiError ? error.statusCode : 502;
  res.status(statusCode).json({ error: message });
}

router.post("/deriv/proposal", async (req, res) => {
  const input = validatedTradeInput((req.body ?? {}) as ProposalRequest);
  if ("error" in input) {
    res.status(400).json({ error: input.error });
    return;
  }

  try {
    const { session, selectedAccount } = await getDerivAccountContext(req, res);
    const proposal = await requestDerivProposal({
      session,
      account: selectedAccount,
      ...input,
    });
    res.json({
      proposal: {
        id: proposal.id ?? null,
        askPrice: finiteNumber(proposal.ask_price),
        payout: finiteNumber(proposal.payout),
        spot: finiteNumber(proposal.spot),
        displayValue: finiteNumber(proposal.display_value),
        longcode: proposal.longcode ?? null,
        currency: proposal.currency ?? selectedAccount.currency,
      },
      execution: "proposal-only",
    });
  } catch (error) {
    sendError(res, error, "Unable to request a Deriv proposal.");
  }
});

router.post("/deriv/execute", async (req, res) => {
  const body = (req.body ?? {}) as ProposalRequest;
  if (body.confirm !== true) {
    res.status(400).json({ error: "Explicit execution confirmation is required." });
    return;
  }
  const input = validatedTradeInput(body);
  if ("error" in input) {
    res.status(400).json({ error: input.error });
    return;
  }

  try {
    const { session, selectedAccount } = await getDerivAccountContext(req, res);
    const execution = await requestDerivExecution({
      session,
      account: selectedAccount,
      ...input,
    });
    const { proposal, buy, contract } = execution;
    const buyPrice =
      finiteNumber(contract.buy_price) ??
      finiteNumber(buy.buy_price) ??
      finiteNumber(proposal.ask_price) ??
      input.amount;
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
    const stake = finiteNumber(input.amount);
    if (contractId && stake !== null) {
      await recordPlatformTradeActivity(req, {
        accountId: selectedAccount.account_id,
        mode: selectedAccount.account_type,
        symbol: input.symbol,
        contractType: input.contractType,
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
        contractId: buy.contract_id ?? null,
        transactionId: buy.transaction_id ?? null,
        type: input.contractType,
        contractType: input.contractType,
        barrier: input.barrier,
        stake: input.amount,
        buyPrice,
        currency: proposal.currency ?? selectedAccount.currency,
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
    sendError(res, error, "Unable to execute the Deriv contract.");
  }
});

export default router;
