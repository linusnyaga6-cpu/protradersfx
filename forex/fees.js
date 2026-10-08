'use strict';

// Proposed fee schedule only. These helpers calculate allocations; they do
// not move money or update a customer or operator balance.
const FEE_BASIS_POINTS = Object.freeze({
  deposit: 1000,      // 10% of gross deposit
  executedTrade: 100, // 1% of executed stake
  netProfit: 2000,    // 20% of verified net realized profit
});
const BASIS_POINT_DENOMINATOR = 10_000n;

function asMinorUnits(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer in minor units.`);
  }
  return BigInt(value);
}

function feeFor(amountMinorUnits, basisPoints, label) {
  const amount = asMinorUnits(amountMinorUnits, label);
  const fee = (amount * BigInt(basisPoints)) / BASIS_POINT_DENOMINATOR;
  const result = Number(fee);
  if (!Number.isSafeInteger(result)) throw new RangeError('Fee exceeds safe integer range.');
  return result;
}

function calculateDepositAllocation(grossMinorUnits) {
  if (!Number.isSafeInteger(grossMinorUnits) || grossMinorUnits <= 0) {
    throw new TypeError('Gross deposit must be a positive safe integer in minor units.');
  }
  const platformFeeMinorUnits = feeFor(grossMinorUnits, FEE_BASIS_POINTS.deposit, 'Gross deposit');
  return {
    grossMinorUnits,
    platformFeeMinorUnits,
    customerCreditMinorUnits: grossMinorUnits - platformFeeMinorUnits,
  };
}

function calculateExecutedTradeFee(stakeMinorUnits) {
  return {
    stakeMinorUnits,
    platformFeeMinorUnits: feeFor(stakeMinorUnits, FEE_BASIS_POINTS.executedTrade, 'Trade stake'),
  };
}

// The input must already be verified net realized profit after losses. This
// function cannot determine profit from a quote, estimate, or browser value.
function calculatePerformanceFee(verifiedNetProfitMinorUnits) {
  const eligibleProfit = Math.max(0, verifiedNetProfitMinorUnits);
  return {
    eligibleNetProfitMinorUnits: eligibleProfit,
    platformFeeMinorUnits: feeFor(eligibleProfit, FEE_BASIS_POINTS.netProfit, 'Verified net profit'),
  };
}

module.exports = {
  FEE_BASIS_POINTS,
  calculateDepositAllocation,
  calculateExecutedTradeFee,
  calculatePerformanceFee,
};
