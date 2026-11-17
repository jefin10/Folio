/**
 * Recurring obligations: EMIs, subscriptions, bills, rent, card autopay, salary.
 *
 * Folio only *tracks and reminds*. It never moves real money. An occurrence
 * becomes a ledger entry only when the user confirms it was paid, and each
 * (rule, due date) pair can be confirmed exactly once — enforced here and by
 * a unique index in Postgres — so retries can never double-book a payment.
 */
import type { ISODate } from './dates';
import { addDays, addMonths, compareDates, daysBetween } from './dates';
import type { Paise } from './money';
import type { Frequency, RecurringOccurrence, RecurringRule } from './types';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  bimonthly: 'Every 2 months',
  quarterly: 'Every quarter',
  half_yearly: 'Every 6 months',
  yearly: 'Every year',
  custom_days: 'Custom',
};

const MONTH_STEP: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, half_yearly: 6, yearly: 12 };

/** The n-th due date (0-based) of a rule. Month-based rules keep their preferred day. */
export function nthDueDate(rule: Pick<RecurringRule, 'frequency' | 'startOn' | 'intervalDays' | 'dayOfMonth'>, n: number): ISODate {
  const months = MONTH_STEP[rule.frequency];
  if (months !== undefined) {
    const day = rule.dayOfMonth ?? Number(rule.startOn.slice(8));
    return addMonths(rule.startOn, n * months, day);
  }
  const step = rule.frequency === 'weekly' ? 7 : rule.frequency === 'biweekly' ? 14 : Math.max(1, rule.intervalDays ?? 30);
  return addDays(rule.startOn, n * step);
}

/** All due dates of a rule within [from, to], honouring end date / max count. */
export function dueDatesBetween(rule: Pick<RecurringRule, 'frequency' | 'startOn' | 'intervalDays' | 'dayOfMonth' | 'endOn' | 'maxOccurrences'>, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const limit = rule.maxOccurrences ?? 10_000;
  // Skip ahead quickly for long-running rules.
  let n = 0;
  const months = MONTH_STEP[rule.frequency];
  if (from > rule.startOn) {
    if (months !== undefined) {
      const startY = Number(rule.startOn.slice(0, 4));
      const startM = Number(rule.startOn.slice(5, 7));
      const fromY = Number(from.slice(0, 4));
      const fromM = Number(from.slice(5, 7));
      n = Math.max(0, Math.floor(((fromY - startY) * 12 + (fromM - startM)) / months) - 1);
    } else {
      const step = rule.frequency === 'weekly' ? 7 : rule.frequency === 'biweekly' ? 14 : Math.max(1, rule.intervalDays ?? 30);
      n = Math.max(0, Math.floor(daysBetween(rule.startOn, from) / step) - 1);
    }
  }
  for (; n < limit; n++) {
    const d = nthDueDate(rule, n);
    if (rule.endOn && d > rule.endOn) break;
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export type DueState = 'paid' | 'skipped' | 'overdue' | 'due_today' | 'upcoming';

export interface DueItem {
  ruleId: string;
  name: string;
  kind: RecurringRule['kind'];
  dueOn: ISODate;
  amount: Paise | null;
  isVariable: boolean;
  state: DueState;
  daysAway: number;
  sourceAccountId: string | null;
  targetAccountId: string | null;
  occurrence: RecurringOccurrence | null;
  /** Stable key used for notifications and idempotent confirmation. */
  key: string;
}

export function occurrenceKey(ruleId: string, dueOn: ISODate): string {
  return `rec:${ruleId}:${dueOn}`;
}

/**
 * Build the obligations timeline: unresolved past occurrences (overdue,
 * looking back `lookbackDays`) plus everything due in the next `horizonDays`.
 */
export function upcomingObligations(
  rules: RecurringRule[],
  occurrences: RecurringOccurrence[],
  todayDate: ISODate,
  horizonDays = 30,
  lookbackDays = 45,
): DueItem[] {
  const resolved = new Map<string, RecurringOccurrence>();
  for (const o of occurrences) resolved.set(occurrenceKey(o.ruleId, o.dueOn), o);
  const from = addDays(todayDate, -lookbackDays);
  const to = addDays(todayDate, horizonDays);
  const items: DueItem[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    for (const dueOn of dueDatesBetween(rule, from, to)) {
      const key = occurrenceKey(rule.id, dueOn);
      const occ = resolved.get(key) ?? null;
      const daysAway = daysBetween(todayDate, dueOn);
      let state: DueState;
      if (occ) state = occ.status;
      else if (daysAway < 0) state = 'overdue';
      else if (daysAway === 0) state = 'due_today';
      else state = 'upcoming';
      // Resolved items in the past are history, not obligations.
      if (occ && daysAway < 0) continue;
      items.push({
        ruleId: rule.id,
        name: rule.name,
        kind: rule.kind,
        dueOn,
        amount: occ?.amount ?? rule.amount,
        isVariable: rule.isVariable,
        state,
        daysAway,
        sourceAccountId: rule.sourceAccountId,
        targetAccountId: rule.targetAccountId,
        occurrence: occ,
        key,
      });
    }
  }
  return items.sort((a, b) => compareDates(a.dueOn, b.dueOn) || a.name.localeCompare(b.name));
}

/** Next unresolved due date on/after `fromDate` for a rule. */
export function nextDue(rule: RecurringRule, occurrences: RecurringOccurrence[], fromDate: ISODate): ISODate | null {
  const done = new Set(occurrences.filter((o) => o.ruleId === rule.id).map((o) => o.dueOn));
  const dates = dueDatesBetween(rule, addDays(fromDate, -120), addDays(fromDate, 800));
  // Prefer the oldest unresolved one so missed payments surface first.
  for (const d of dates) if (!done.has(d)) return d;
  return null;
}

/** Reminder instant (local) for a due item. */
export function reminderAt(item: Pick<DueItem, 'dueOn'>, rule: Pick<RecurringRule, 'reminderDaysBefore' | 'reminderTime'>): { date: ISODate; time: string } {
  return { date: addDays(item.dueOn, -Math.max(0, rule.reminderDaysBefore)), time: /^\d{2}:\d{2}$/.test(rule.reminderTime) ? rule.reminderTime : '09:00' };
}

/** Sum of expected outflows in a window (skips income rules and variable unknown amounts). */
export function obligationsTotal(items: DueItem[], toDays: number): Paise {
  let total = 0n;
  for (const i of items) {
    if (i.state === 'paid' || i.state === 'skipped') continue;
    if (i.kind === 'income') continue;
    if (i.daysAway > toDays) continue;
    if (i.amount) total += i.amount;
  }
  return total;
}

/** Guard used before confirming: true if this occurrence was already resolved. */
export function isAlreadyResolved(ruleId: string, dueOn: ISODate, occurrences: RecurringOccurrence[]): boolean {
  return occurrences.some((o) => o.ruleId === ruleId && o.dueOn === dueOn);
}
