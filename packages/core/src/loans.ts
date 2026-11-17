import type { ISODate } from './dates';
import { addMonths } from './dates';
import { divRound, type Paise } from './money';

/**
 * Loan maths in exact integer arithmetic.
 * Rates are annual, in basis points (1050 = 10.50% p.a.), reducing balance,
 * monthly compounding — the standard for Indian retail loans.
 */

const SCALE = 10n ** 18n; // fixed-point precision for (1+r)^n

function powScaled(baseScaled: bigint, n: number): bigint {
  let result = SCALE;
  let b = baseScaled;
  let e = n;
  while (e > 0) {
    if (e & 1) result = (result * b) / SCALE;
    b = (b * b) / SCALE;
    e >>= 1;
  }
  return result;
}

/** EMI = P·r·(1+r)^n / ((1+r)^n − 1), rounded to the nearest paisa. */
export function computeEmi(principal: Paise, annualRateBps: number, months: number): Paise {
  if (months <= 0) throw new Error('Tenure must be at least one month');
  if (principal <= 0n) return 0n;
  if (annualRateBps <= 0) return divRound(principal, BigInt(months));
  // r scaled: rate per month = bps / 10000 / 12
  const rScaled = (BigInt(annualRateBps) * SCALE) / 120_000n;
  const growth = powScaled(SCALE + rScaled, months);
  const numerator = principal * rScaled * growth;
  const denominator = (growth - SCALE) * SCALE;
  return divRound(numerator, denominator);
}

/** Interest for one month on an outstanding principal. */
export function monthlyInterest(outstanding: Paise, annualRateBps: number): Paise {
  if (outstanding <= 0n || annualRateBps <= 0) return 0n;
  return divRound(outstanding * BigInt(annualRateBps), 120_000n);
}

/** Split an EMI into interest and principal given the current outstanding principal. */
export function splitEmi(emi: Paise, outstanding: Paise, annualRateBps: number): { interest: Paise; principal: Paise } {
  const interest = monthlyInterest(outstanding, annualRateBps);
  const cappedInterest = interest > emi ? emi : interest;
  let principal = emi - cappedInterest;
  if (principal > outstanding) principal = outstanding;
  return { interest: cappedInterest, principal };
}

export interface AmortizationRow {
  n: number;
  dueOn: ISODate;
  emi: Paise;
  interest: Paise;
  principal: Paise;
  closing: Paise;
}

export function amortizationSchedule(principal: Paise, annualRateBps: number, months: number, firstDueOn: ISODate, emiOverride?: Paise): AmortizationRow[] {
  const emi = emiOverride ?? computeEmi(principal, annualRateBps, months);
  const rows: AmortizationRow[] = [];
  let outstanding = principal;
  const day = Number(firstDueOn.slice(8));
  for (let n = 1; n <= months && outstanding > 0n; n++) {
    const interest = monthlyInterest(outstanding, annualRateBps);
    let principalPart = emi - interest;
    let thisEmi = emi;
    if (n === months || principalPart >= outstanding) {
      principalPart = outstanding;
      thisEmi = principalPart + interest;
    }
    if (principalPart < 0n) principalPart = 0n;
    outstanding -= principalPart;
    rows.push({ n, dueOn: addMonths(firstDueOn, n - 1, day), emi: thisEmi, interest, principal: principalPart, closing: outstanding });
  }
  return rows;
}

/** Months left to clear `outstanding` paying `emi` each month. Null if EMI never covers interest. */
export function remainingTenure(outstanding: Paise, annualRateBps: number, emi: Paise): number | null {
  if (outstanding <= 0n) return 0;
  if (emi <= 0n) return null;
  let o = outstanding;
  for (let n = 1; n <= 600; n++) {
    const interest = monthlyInterest(o, annualRateBps);
    if (emi <= interest) return null;
    o = o + interest - emi;
    if (o <= 0n) return n;
  }
  return null;
}

export function totalInterestPayable(outstanding: Paise, annualRateBps: number, emi: Paise): Paise | null {
  const months = remainingTenure(outstanding, annualRateBps, emi);
  if (months === null) return null;
  let o = outstanding;
  let interestTotal = 0n;
  for (let n = 0; n < months; n++) {
    const interest = monthlyInterest(o, annualRateBps);
    interestTotal += interest;
    o = o + interest - emi;
    if (o < 0n) o = 0n;
  }
  return interestTotal;
}
