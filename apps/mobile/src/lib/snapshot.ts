/**
 * The compact summary shared with the watch and the home-screen widgets.
 * Totals only, as strings of paise; stored in Keystore-backed storage.
 */
import { addDays, dailySpend, formatCompact, formatMoney, groupOf, periodTotals, sortAccounts, startOfMonth, type Account, type AccountBalance, type Category, type DueItem, type Entry, type FinancialPosition, type Person, type PersonBalance } from '@folio/core';
import { secureGet, secureSet } from './secure-kv';

export interface Snapshot {
  v: 1;
  generatedAt: string;
  hideBalances: boolean;
  liquid: string;
  bankBalance: string;
  netWorth: string;
  creditOutstanding: string;
  receivables: string;
  afterObligations: string;
  todaySpend: string;
  monthSpend: string;
  accounts: { id: string; name: string; group: string; balance: string; color: string | null }[];
  categories: { id: string; name: string; icon: string | null; color: string | null }[];
  people: { id: string; name: string; outstanding: string }[];
  upcoming: { name: string; dueOn: string; amount: string | null; state: string }[];
}

export function buildSnapshot(input: {
  position: FinancialPosition;
  accounts: Account[];
  balances: Map<string, AccountBalance>;
  categories: Category[];
  people: Person[];
  personBalances: Map<string, PersonBalance>;
  entries: Entry[];
  obligations: DueItem[];
  today: string;
  hideBalances: boolean;
}): Snapshot {
  const kindOf = (id: string) => input.categories.find((c) => c.id === id)?.kind;
  const today = dailySpend(input.entries, kindOf, input.today, input.today).get(input.today) ?? 0n;
  const month = periodTotals(input.entries, kindOf, startOfMonth(input.today), input.today);
  const payable = sortAccounts(input.accounts.filter((a) => a.status === 'active' && a.type !== 'debit_card' && ['bank', 'cash', 'wallet', 'credit'].includes(groupOf(a))));
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    hideBalances: input.hideBalances,
    liquid: input.position.liquid.toString(),
    bankBalance: input.position.bankBalance.toString(),
    netWorth: input.position.netWorth.toString(),
    creditOutstanding: input.position.creditOutstanding.toString(),
    receivables: input.position.receivables.toString(),
    afterObligations: input.position.afterObligations.toString(),
    todaySpend: today.toString(),
    monthSpend: month.grossSpend.toString(),
    accounts: payable.map((a) => ({ id: a.id, name: a.nickname || a.name, group: groupOf(a), balance: (input.balances.get(a.id)?.balance ?? 0n).toString(), color: a.theme?.colors[0] ?? a.color })),
    categories: input.categories.filter((c) => c.kind === 'expense' && !c.archived).slice(0, 24).map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })),
    people: input.people.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name, outstanding: (input.personBalances.get(p.id)?.outstanding ?? 0n).toString() })),
    upcoming: input.obligations
      .filter((i) => i.state !== 'paid' && i.state !== 'skipped' && i.kind !== 'income' && i.dueOn <= addDays(input.today, 14))
      .slice(0, 6)
      .map((i) => ({ name: i.name, dueOn: i.dueOn, amount: i.amount?.toString() ?? null, state: i.state })),
  };
}

const KEY = 'folio.snapshot.v1';
export const saveSnapshot = (s: Snapshot) => secureSet(KEY, JSON.stringify(s));
export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await secureGet(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export const money = (s: string | null | undefined, hidden: boolean, compact = false) => {
  if (hidden) return '₹ ••••';
  const v = BigInt(s ?? '0');
  return compact ? formatCompact(v) : formatMoney(v, { decimals: 0 });
};
