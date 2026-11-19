/**
 * Grow maths — deposits and market accounts — in exact integer arithmetic,
 * same fixed-point technique as loans.ts.
 *
 * Indian bank deposits (FD and RD) compound quarterly; when a deposit runs an
 * odd number of months, banks compound the full quarters and pay simple
 * interest for the leftover fraction. That is what `compoundMonths` does.
 * Rates are annual, in basis points (750 = 7.50% p.a.).
 */
import { addMonths, type ISODate } from './dates';
import { divRound, type Paise } from './money';
import type { Account, GrowDetails } from './types';

const SCALE = 10n ** 18n;

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

/**
 * Value of `principal` after `months` months at an annual rate of `annualRateBps`,
 * compounding `compoundingPerYear` times a year. Full compounding periods
 * compound; a partial period earns simple interest pro-rata (bank practice).
 */
export function compoundMonths(principal: Paise, annualRateBps: number, months: number, compoundingPerYear = 4): Paise {
  if (principal <= 0n || months <= 0 || annualRateBps <= 0) return principal;
  const cpy = Math.max(1, Math.min(12, Math.round(compoundingPerYear)));
  const periodMonths = 12 / cpy;
  const full = Math.floor(months / periodMonths);
  const remMonths = months % periodMonths;
  // i = rate per compounding period, scaled to 18 decimals.
  const iScaled = (BigInt(annualRateBps) * SCALE) / BigInt(10000 * cpy);
  let value = principal;
  if (full > 0) value = divRound(value * powScaled(SCALE + iScaled, full), SCALE);
  if (remMonths > 0) value += divRound((value * iScaled * BigInt(remMonths)), BigInt(periodMonths) * SCALE);
  return value;
}

/** Maturity value of a fixed deposit: principal compounded over the tenure. */
export function fdMaturityValue(principal: Paise, annualRateBps: number, tenureMonths: number, compoundingPerYear = 4): Paise {
  return compoundMonths(principal, annualRateBps, tenureMonths, compoundingPerYear);
}

/**
 * Maturity value of a recurring deposit: every installment compounds for the
 * months it stays in (installment k of n, paid at the start of month k, stays
 * n − k + 1 months).
 */
export function rdMaturityValue(installment: Paise, annualRateBps: number, tenureMonths: number, compoundingPerYear = 4): Paise {
  if (installment <= 0n || tenureMonths <= 0) return 0n;
  let total = 0n;
  for (let k = 1; k <= tenureMonths; k++) total += compoundMonths(installment, annualRateBps, tenureMonths - k + 1, compoundingPerYear);
  return total;
}

/** Maturity date of a deposit started (or starting) on `startDate`. */
export function maturityDate(startDate: ISODate, tenureMonths: number): ISODate {
  return addMonths(startDate, tenureMonths);
}

export type GrowGroup = 'deposit' | 'market';

export function growGroupOf(a: Pick<Account, 'type'>): GrowGroup | null {
  if (a.type === 'fixed_deposit' || a.type === 'recurring_deposit') return 'deposit';
  if (a.type === 'stocks' || a.type === 'mutual_funds') return 'market';
  return null;
}

export interface GrowStats {
  group: GrowGroup;
  /** Money put in: FD principal, RD installments so far, market invested. */
  invested: Paise;
  /** What it is worth now (the ledger balance). */
  value: Paise;
  gain: Paise;
  gainBps: number | null;
  /** Deposit projection at maturity, when rate and tenure are known. */
  maturityOn: ISODate | null;
  maturityValue: Paise | null;
  interestTotal: Paise | null;
}

/** One consistent read of a Grow account for cards, lists and detail pages. */
export function growStats(account: Account, balance: Paise): GrowStats {
  const g: GrowDetails | null = account.grow;
  const group = growGroupOf(account) ?? 'market';
  if (group === 'deposit') {
    const invested = account.type === 'fixed_deposit' ? g?.principalAmount ?? balance : balance;
    const rate = g?.interestRateBps ?? null;
    const tenure = g?.tenureMonths ?? null;
    const start = g?.startDate ?? account.openedOn ?? null;
    const cpy = g?.compoundingPerYear ?? 4;
    const canProject = rate !== null && tenure !== null && start !== null;
    let maturityValue: Paise | null = null;
    let interestTotal: Paise | null = null;
    if (canProject) {
      if (account.type === 'fixed_deposit') {
        maturityValue = fdMaturityValue(invested, rate!, tenure!, cpy);
        interestTotal = maturityValue - invested;
      } else {
        maturityValue = rdMaturityValue(g?.principalAmount ?? 0n, rate!, tenure!, cpy);
        interestTotal = maturityValue - (g?.principalAmount ?? 0n) * BigInt(tenure!);
      }
    }
    return {
      group,
      invested,
      value: balance,
      gain: balance - invested,
      gainBps: invested > 0n ? Number(((balance - invested) * 10000n) / invested) : null,
      maturityOn: canProject ? maturityDate(start, tenure!) : null,
      maturityValue,
      interestTotal,
    };
  }
  const invested = g?.investedAmount ?? balance;
  const gain = balance - invested;
  return {
    group,
    invested,
    value: balance,
    gain,
    gainBps: invested > 0n ? Number((gain * 10000n) / invested) : null,
    maturityOn: null,
    maturityValue: null,
    interestTotal: null,
  };
}
