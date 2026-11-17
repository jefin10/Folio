import { groupOf } from './accounts';
import type { ISODate } from './dates';
import { monthKey, monthRange } from './dates';
import { ZERO, type Paise } from './money';
import type { Account, Category, Entry } from './types';

type AnalyticsEntry = Pick<Entry, 'type' | 'occurredOn' | 'postings' | 'status' | 'categoryId'>;

export interface PeriodTotals {
  income: Paise;
  /** What I spent on myself (expense categories, net of refunds). */
  personalExpense: Paise;
  /** What I paid on behalf of others in purchases (net of refunded shares). */
  reimbursable: Paise;
  /** personalExpense + reimbursable — the gross amount spent at merchants. */
  grossSpend: Paise;
  /** Money people paid me back. Never counted as income. */
  reimbursementsReceived: Paise;
  /** Income − personal expense. */
  saved: Paise;
  /** Internal movements, shown for completeness. Never income or expense. */
  transfers: Paise;
  cardRepayments: Paise;
  savingsRateBps: number;
}

function emptyTotals(): PeriodTotals {
  return { income: ZERO, personalExpense: ZERO, reimbursable: ZERO, grossSpend: ZERO, reimbursementsReceived: ZERO, saved: ZERO, transfers: ZERO, cardRepayments: ZERO, savingsRateBps: 0 };
}

const SPEND_TYPES = new Set(['expense', 'card_purchase', 'refund', 'bank_withdrawal', 'loan_disbursement']);

export function periodTotals(entries: AnalyticsEntry[], kindOf: (categoryId: string) => Category['kind'] | undefined, from: ISODate, to: ISODate): PeriodTotals {
  const t = emptyTotals();
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    for (const p of e.postings) {
      if (p.target === 'category') {
        const kind = kindOf(p.categoryId!);
        if (kind === 'income') t.income += -p.amount;
        else if (kind === 'expense') t.personalExpense += p.amount;
      } else if (p.target === 'person') {
        if (SPEND_TYPES.has(e.type)) t.reimbursable += p.amount;
        if (e.type === 'reimbursement_received') t.reimbursementsReceived += -p.amount;
      } else if (p.target === 'account' && p.amount > 0n) {
        if (e.type === 'transfer' || e.type === 'cash_withdrawal' || e.type === 'cash_deposit') t.transfers += p.amount;
        if (e.type === 'card_repayment') t.cardRepayments += p.amount;
      }
    }
  }
  t.grossSpend = t.personalExpense + t.reimbursable;
  t.saved = t.income - t.personalExpense;
  t.savingsRateBps = t.income > 0n ? Number((t.saved * 10_000n) / t.income) : 0;
  return t;
}

export interface MonthPoint extends PeriodTotals {
  month: string; // YYYY-MM
}

export function monthlySeries(entries: AnalyticsEntry[], kindOf: (categoryId: string) => Category['kind'] | undefined, from: ISODate, to: ISODate): MonthPoint[] {
  const months = monthRange(from, to);
  const byMonth = new Map<string, AnalyticsEntry[]>();
  for (const m of months) byMonth.set(m, []);
  for (const e of entries) {
    if (e.occurredOn < from || e.occurredOn > to) continue;
    byMonth.get(monthKey(e.occurredOn))?.push(e);
  }
  return months.map((m) => ({ month: m, ...periodTotals(byMonth.get(m)!, kindOf, `${m}-01`, `${m}-31`) }));
}

export interface CategorySlice {
  categoryId: string;
  amount: Paise;
  shareBps: number;
  count: number;
}

/** Spending (or income) by category within a period, largest first. */
export function categoryBreakdown(entries: AnalyticsEntry[], categories: Pick<Category, 'id' | 'kind' | 'parentId'>[], kind: Category['kind'], from: ISODate, to: ISODate, rollUpToParent = true): CategorySlice[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { amount: Paise; count: number }>();
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    for (const p of e.postings) {
      if (p.target !== 'category') continue;
      const c = catById.get(p.categoryId!);
      if (!c || c.kind !== kind) continue;
      const key = rollUpToParent && c.parentId ? c.parentId : c.id;
      const value = kind === 'expense' ? p.amount : -p.amount;
      const cur = totals.get(key) ?? { amount: ZERO, count: 0 };
      cur.amount += value;
      cur.count += 1;
      totals.set(key, cur);
    }
  }
  const total = [...totals.values()].reduce((s, v) => s + (v.amount > 0n ? v.amount : 0n), ZERO);
  return [...totals.entries()]
    .filter(([, v]) => v.amount > 0n)
    .map(([categoryId, v]) => ({ categoryId, amount: v.amount, count: v.count, shareBps: total > 0n ? Number((v.amount * 10_000n) / total) : 0 }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

/** Spend per account (where the money came from) within a period. */
export function spendByAccount(entries: AnalyticsEntry[], accounts: Pick<Account, 'id' | 'type'>[], from: ISODate, to: ISODate): Map<string, Paise> {
  const out = new Map<string, Paise>();
  const ids = new Set(accounts.map((a) => a.id));
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    if (e.type !== 'expense' && e.type !== 'card_purchase') continue;
    for (const p of e.postings) {
      if (p.target === 'account' && p.accountId && ids.has(p.accountId) && p.amount < 0n) out.set(p.accountId, (out.get(p.accountId) ?? ZERO) - p.amount);
    }
  }
  return out;
}

/** Daily personal spend for sparklines / the watch's "today". */
export function dailySpend(entries: AnalyticsEntry[], kindOf: (categoryId: string) => Category['kind'] | undefined, from: ISODate, to: ISODate): Map<ISODate, Paise> {
  const out = new Map<ISODate, Paise>();
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    for (const p of e.postings) {
      if (p.target !== 'category' || kindOf(p.categoryId!) !== 'expense') continue;
      out.set(e.occurredOn, (out.get(e.occurredOn) ?? ZERO) + p.amount);
    }
    if (e.type === 'expense' || e.type === 'card_purchase') {
      // Gross for "today's spending" includes shares paid for others.
      for (const p of e.postings) if (p.target === 'person' && p.amount > 0n) out.set(e.occurredOn, (out.get(e.occurredOn) ?? ZERO) + p.amount);
    }
  }
  return out;
}

/** Income by source category (salary, stipend, freelance…). */
export function incomeSources(entries: AnalyticsEntry[], categories: Pick<Category, 'id' | 'kind' | 'parentId'>[], from: ISODate, to: ISODate): CategorySlice[] {
  return categoryBreakdown(entries, categories, 'income', from, to, false);
}

/** Net cash movement of liquid accounts (bank/cash/wallet) — "real" cash flow. */
export function liquidFlow(entries: AnalyticsEntry[], accounts: Pick<Account, 'id' | 'type' | 'isLiquid'>[], from: ISODate, to: ISODate): { inflow: Paise; outflow: Paise; net: Paise } {
  const liquid = new Set(accounts.filter((a) => a.isLiquid && groupOf(a) !== 'debit').map((a) => a.id));
  let inflow = ZERO;
  let outflow = ZERO;
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    const legs = e.postings.filter((p) => p.target === 'account' && liquid.has(p.accountId!));
    const internal = e.postings.filter((p) => p.target === 'account').every((p) => liquid.has(p.accountId!));
    if (internal && legs.length >= 2) continue; // own-account shuffles
    for (const p of legs) {
      if (p.amount > 0n) inflow += p.amount;
      else outflow += -p.amount;
    }
  }
  return { inflow, outflow, net: inflow - outflow };
}
