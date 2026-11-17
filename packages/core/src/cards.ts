import type { ISODate } from './dates';
import { addDays, addMonths, daysBetween, daysInMonth, makeDate } from './dates';
import { applyBps, max, ratioBps, ZERO, type Paise } from './money';
import type { Account, Entry, Statement } from './types';

export interface CardCycle {
  /** Last statement generation date on/before today (null if no statement day configured). */
  lastStatementOn: ISODate | null;
  nextStatementOn: ISODate | null;
  /** Due date for the last generated statement. */
  dueOn: ISODate | null;
  daysToDue: number | null;
  cycleStart: ISODate | null;
}

function clampDay(year: number, month: number, day: number): ISODate {
  return makeDate(year, month, Math.min(day, daysInMonth(year, month)));
}

/** Work out the billing cycle from statement day and due day. */
export function cardCycle(statementDay: number | null, dueDay: number | null, todayDate: ISODate): CardCycle {
  if (!statementDay) return { lastStatementOn: null, nextStatementOn: null, dueOn: null, daysToDue: null, cycleStart: null };
  const y = Number(todayDate.slice(0, 4));
  const m = Number(todayDate.slice(5, 7));
  let last = clampDay(y, m, statementDay);
  if (last > todayDate) last = addMonths(last, -1, statementDay);
  const next = addMonths(last, 1, statementDay);
  let dueOn: ISODate | null = null;
  if (dueDay) {
    // Due date falls after the statement date: same month if day is later, else next month.
    const ly = Number(last.slice(0, 4));
    const lm = Number(last.slice(5, 7));
    dueOn = dueDay > statementDay ? clampDay(ly, lm, dueDay) : addMonths(clampDay(ly, lm, 1), 1, dueDay);
  }
  return {
    lastStatementOn: last,
    nextStatementOn: next,
    dueOn,
    daysToDue: dueOn ? daysBetween(todayDate, dueOn) : null,
    cycleStart: addDays(last, 1),
  };
}

export interface CardSummary {
  limit: Paise | null;
  outstanding: Paise;
  available: Paise | null;
  utilisationBps: number;
  /** Spend posted in the current (unbilled) cycle. */
  unbilled: Paise;
  /** Latest statement and how much of it is still unpaid. */
  statement: Statement | null;
  statementPaid: Paise;
  statementRemaining: Paise;
  minimumDue: Paise;
  minimumDueEstimated: boolean;
  cycle: CardCycle;
}

/**
 * Card position. Outstanding comes from the ledger; statement figures come
 * from what the user recorded (or estimated when no statement exists yet).
 */
export function summariseCard(
  account: Pick<Account, 'id' | 'card'>,
  outstanding: Paise,
  entries: Pick<Entry, 'type' | 'occurredOn' | 'postings' | 'status'>[],
  statements: Statement[],
  todayDate: ISODate,
): CardSummary {
  const limit = account.card?.creditLimit ?? null;
  const cycle = cardCycle(account.card?.statementDay ?? null, account.card?.dueDay ?? null, todayDate);
  const own = statements.filter((s) => s.accountId === account.id).sort((a, b) => (a.statementDate < b.statementDate ? 1 : -1));
  const statement = own[0] ?? null;
  const since = statement?.statementDate ?? cycle.lastStatementOn;

  let unbilled = ZERO;
  let paidSinceStatement = ZERO;
  for (const e of entries) {
    if (e.status === 'void') continue;
    for (const p of e.postings) {
      if (p.target !== 'account' || p.accountId !== account.id) continue;
      if (since && e.occurredOn <= since) continue;
      if (p.amount < 0n) unbilled += -p.amount; // new charges
      else if (e.type === 'card_repayment' || e.type === 'transfer') paidSinceStatement += p.amount;
    }
  }

  const statementBalance = statement?.statementBalance ?? (cycle.lastStatementOn ? max(ZERO, outstanding - unbilled) : outstanding);
  const statementPaid = paidSinceStatement;
  const statementRemaining = max(ZERO, statementBalance - statementPaid);
  const minBps = account.card?.minDueBps ?? 500;
  let minimumDue: Paise;
  let minimumDueEstimated = false;
  if (statement?.minimumDue != null) {
    minimumDue = max(ZERO, statement.minimumDue - statementPaid);
  } else {
    minimumDueEstimated = true;
    const est = applyBps(statementRemaining, minBps);
    minimumDue = statementRemaining === ZERO ? ZERO : statementRemaining < 200_00n ? statementRemaining : max(est, 200_00n);
  }
  return {
    limit,
    outstanding,
    available: limit !== null ? limit - outstanding : null,
    utilisationBps: limit ? ratioBps(max(ZERO, outstanding), limit) : 0,
    unbilled,
    statement,
    statementPaid,
    statementRemaining,
    minimumDue,
    minimumDueEstimated,
    cycle: statement?.dueDate ? { ...cycle, dueOn: statement.dueDate, daysToDue: daysBetween(todayDate, statement.dueDate) } : cycle,
  };
}

export function utilisationTone(bps: number): 'good' | 'watch' | 'high' {
  if (bps <= 3000) return 'good';
  if (bps <= 6000) return 'watch';
  return 'high';
}

/** Reward estimate for a spend, if the card has a flat reward rate configured. */
export function rewardEstimate(spend: Paise, rewardRateBps: number | null): Paise {
  if (!rewardRateBps) return ZERO;
  return applyBps(spend, rewardRateBps);
}
