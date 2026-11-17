import { addMonths, makeDate, nextDue, type Account, type RecurringOccurrence, type RecurringRule } from '@folio/core';

const PER_MONTH: Record<string, [bigint, bigint]> = { weekly: [52n, 12n], biweekly: [26n, 12n], monthly: [1n, 1n], bimonthly: [1n, 2n], quarterly: [1n, 3n], half_yearly: [1n, 6n], yearly: [1n, 12n] };

export function monthlyEquivalent(r: RecurringRule): bigint {
  if (!r.amount) return 0n;
  const f = PER_MONTH[r.frequency];
  if (!f) return r.amount * 30n / BigInt(Math.max(1, r.intervalDays ?? 30));
  return (r.amount * f[0]) / f[1];
}

/** A loan's EMI dates: next due and the last EMI. */
export function loanDates(l: Account, rule: RecurringRule | undefined, occ: RecurringOccurrence[], today: string): { next: string | null; end: string | null } {
  if (rule) {
    const end = rule.endOn ?? (rule.maxOccurrences ? addMonths(rule.startOn, rule.maxOccurrences - 1, rule.dayOfMonth ?? undefined) : null);
    return { next: nextDue(rule, occ, today), end };
  }
  const d = l.loan;
  if (!d?.emiDay) return { next: null, end: null };
  let next = makeDate(Number(today.slice(0, 4)), Number(today.slice(5, 7)), Math.min(d.emiDay, 28));
  if (next < today) next = addMonths(next, 1, d.emiDay);
  const end = d.startDate && d.tenureMonths ? addMonths(d.startDate, d.tenureMonths - 1, d.emiDay) : null;
  return { next, end };
}

