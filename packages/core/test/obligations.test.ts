import { describe, expect, it } from 'vitest';
import { cardCycle, summariseCard } from '../src/cards';
import { amortizationSchedule, computeEmi, monthlyInterest, remainingTenure, splitEmi } from '../src/loans';
import { dueDatesBetween, isAlreadyResolved, nextDue, obligationsTotal, upcomingObligations } from '../src/recurring';
import type { RecurringRule, Statement } from '../src/types';
import { computeBalances } from '../src/balances';
import { key, world } from './fixtures';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  name: 'Netflix',
  kind: 'subscription',
  amount: 649_00n,
  isVariable: false,
  frequency: 'monthly',
  intervalDays: null,
  startOn: '2026-01-31',
  endOn: null,
  maxOccurrences: null,
  dayOfMonth: null,
  sourceAccountId: 'idfc',
  targetAccountId: null,
  categoryId: 'subscriptions',
  personId: null,
  reminderDaysBefore: 1,
  reminderTime: '09:00',
  isActive: true,
  bankAutopay: false,
  notes: null,
  ...over,
});

describe('recurring schedule', () => {
  it('monthly on the 31st clamps to month end and returns to the 31st', () => {
    expect(dueDatesBetween(rule(), '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('weekly, quarterly, yearly, custom', () => {
    expect(dueDatesBetween(rule({ frequency: 'weekly', startOn: '2026-11-02' }), '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(dueDatesBetween(rule({ frequency: 'quarterly', startOn: '2026-01-15' }), '2026-01-01', '2026-12-31')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
    expect(dueDatesBetween(rule({ frequency: 'yearly', startOn: '2024-02-29' }), '2025-01-01', '2028-12-31')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(dueDatesBetween(rule({ frequency: 'custom_days', intervalDays: 10, startOn: '2026-11-01' }), '2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-11', '2026-11-21']);
  });

  it('respects end dates and occurrence counts', () => {
    expect(dueDatesBetween(rule({ startOn: '2026-01-05', maxOccurrences: 3 }), '2026-01-01', '2026-12-31')).toHaveLength(3);
    expect(dueDatesBetween(rule({ startOn: '2026-01-05', endOn: '2026-03-04' }), '2026-01-01', '2026-12-31')).toEqual(['2026-01-05', '2026-02-05']);
  });

  it('fast-forwards long-running rules correctly', () => {
    const r = rule({ startOn: '2020-03-31' });
    expect(dueDatesBetween(r, '2026-11-01', '2026-12-31')).toEqual(['2026-11-30', '2026-12-31']);
  });

  it('builds the obligations timeline with overdue / today / upcoming / paid states', () => {
    const rules = [rule({ id: 'a', startOn: '2026-11-10' }), rule({ id: 'b', name: 'Rent', kind: 'rent', amount: 15_000_00n, startOn: '2026-11-17' }), rule({ id: 'c', name: 'EMI', kind: 'emi', amount: 5_649_00n, startOn: '2026-11-25' })];
    const items = upcomingObligations(rules, [{ ruleId: 'c', dueOn: '2026-11-25', status: 'paid', entryId: 'x', amount: 5_649_00n }], '2026-11-17', 30);
    const states = Object.fromEntries(items.filter((i) => i.dueOn <= '2026-11-30').map((i) => [`${i.ruleId}:${i.dueOn}`, i.state]));
    expect(states['a:2026-11-10']).toBe('overdue');
    expect(states['b:2026-11-17']).toBe('due_today');
    expect(states['c:2026-11-25']).toBe('paid');
    // paid items don't count towards what's due.
    const dueSoon = items.filter((i) => i.daysAway <= 8);
    expect(obligationsTotal(dueSoon, 8)).toBe(649_00n + 15_000_00n);
  });

  it('a confirmed occurrence is never offered again (no duplicate payments)', () => {
    const r = rule({ startOn: '2026-11-01' });
    const occ = [{ ruleId: 'r1', dueOn: '2026-11-01', status: 'paid' as const, entryId: 'e', amount: 649_00n }];
    expect(isAlreadyResolved('r1', '2026-11-01', occ)).toBe(true);
    expect(nextDue(r, occ, '2026-11-02')).toBe('2026-12-01');
    expect(nextDue(r, [], '2026-11-02')).toBe('2026-11-01'); // missed one surfaces first
  });

  it('inactive rules produce nothing', () => {
    expect(upcomingObligations([rule({ isActive: false })], [], '2026-11-17')).toHaveLength(0);
  });
});

describe('loan maths', () => {
  it('computes a standard EMI', () => {
    // ₹1,20,000 @ 12% for 24 months → ₹5,648.82
    expect(computeEmi(1_20_000_00n, 1200, 24)).toBe(5_648_82n);
    // ₹10,00,000 @ 8.5% for 240 months → ₹8,678.23
    expect(computeEmi(10_00_000_00n, 850, 240)).toBe(8_678_23n);
    expect(computeEmi(12_000_00n, 0, 12)).toBe(1_000_00n);
  });

  it('splits EMI into interest and principal', () => {
    expect(monthlyInterest(1_20_000_00n, 1200)).toBe(1_200_00n);
    expect(splitEmi(5_648_82n, 1_20_000_00n, 1200)).toEqual({ interest: 1_200_00n, principal: 4_448_82n });
  });

  it('amortisation closes at exactly zero', () => {
    const rows = amortizationSchedule(1_20_000_00n, 1200, 24, '2026-02-05');
    expect(rows).toHaveLength(24);
    expect(rows.at(-1)!.closing).toBe(0n);
    expect(rows.reduce((s, r) => s + r.principal, 0n)).toBe(1_20_000_00n);
  });

  it('remaining tenure', () => {
    expect(remainingTenure(1_20_000_00n, 1200, 5_648_82n)).toBe(24);
    expect(remainingTenure(1_00_000_00n, 1200, 1_000_00n)).toBeNull(); // EMI never beats interest
  });
});

describe('credit card cycle and dues', () => {
  it('statement on the 5th, due on the 25th', () => {
    const c = cardCycle(5, 25, '2026-11-17');
    expect(c.lastStatementOn).toBe('2026-11-05');
    expect(c.nextStatementOn).toBe('2026-12-05');
    expect(c.dueOn).toBe('2026-11-25');
    expect(c.daysToDue).toBe(8);
  });

  it('due day before statement day rolls into next month', () => {
    const c = cardCycle(20, 8, '2026-11-25');
    expect(c.lastStatementOn).toBe('2026-11-20');
    expect(c.dueOn).toBe('2026-12-08');
  });

  it('statement remaining reduces with payments made after the statement', () => {
    const w = world();
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 20_000_00n, categoryId: 'shopping', occurredOn: '2026-10-20', idempotencyKey: key() });
    w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'sbi_elite', amount: 8_000_00n, occurredOn: '2026-11-10', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 1_500_00n, categoryId: 'food_dining', occurredOn: '2026-11-12', idempotencyKey: key() });
    const stmt: Statement = { id: 's1', accountId: 'sbi_elite', periodStart: '2026-10-06', periodEnd: '2026-11-05', statementDate: '2026-11-05', dueDate: '2026-11-25', statementBalance: 20_000_00n, minimumDue: 1_000_00n, filePath: null, status: 'open', reconciledAt: null, notes: null };
    const bal = computeBalances(w.accounts, w.entries).get('sbi_elite')!.balance;
    const card = w.accounts.find((a) => a.id === 'sbi_elite')!;
    const s = summariseCard(card, bal, w.entries, [stmt], '2026-11-17');
    expect(s.outstanding).toBe(13_500_00n);
    expect(s.statementRemaining).toBe(12_000_00n);
    expect(s.minimumDue).toBe(0n);
    expect(s.unbilled).toBe(1_500_00n);
    expect(s.available).toBe(2_00_000_00n - 13_500_00n);
    expect(s.utilisationBps).toBe(675);
    expect(s.cycle.daysToDue).toBe(8);
  });
});
