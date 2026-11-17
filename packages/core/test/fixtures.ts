import { classOf } from '../src/accounts';
import { DEFAULT_CATEGORIES } from '../src/defaults';
import { buildEntry, makeContext, type EntryIntent, type LedgerContext } from '../src/ledger';
import type { Account, AccountType, Category, Entry, Person } from '../src/types';

let seq = 0;
export const key = () => `test-key-${String(++seq).padStart(6, '0')}`;

export function account(id: string, type: AccountType, extra: Partial<Account> = {}): Account {
  return {
    id,
    name: extra.name ?? id,
    nickname: null,
    type,
    class: classOf(type, extra.class),
    customTypeLabel: null,
    institutionName: null,
    institutionId: null,
    currency: 'INR',
    last4: null,
    color: null,
    icon: null,
    theme: null,
    artworkPath: null,
    interestRateBps: null,
    status: 'active',
    includeInNetWorth: true,
    isLiquid: ['savings', 'current', 'salary', 'cash', 'wallet'].includes(type),
    sortOrder: 0,
    notes: null,
    linkedAccountId: null,
    card: null,
    loan: null,
    openedOn: '2026-01-01',
    ...extra,
  };
}

export function world() {
  const accounts: Account[] = [
    account('idfc', 'savings', { name: 'IDFC First' }),
    account('kotak', 'savings', { name: 'Kotak 811' }),
    account('sbi_elite', 'credit_card', {
      name: 'SBI ELITE',
      card: { network: 'visa', variant: 'Elite', creditLimit: 2_00_000_00n, statementDay: 5, dueDay: 25, annualFee: 4_999_00n, lifetimeFree: false, rewardsInfo: null, rewardRateBps: 100, minDueBps: 500 },
    }),
    account('cash', 'cash', { name: 'Wallet cash' }),
    account('bike_loan', 'vehicle_loan', {
      name: 'Bike loan',
      loan: { loanKind: 'two_wheeler', lender: 'HDFC', principalAmount: 1_20_000_00n, interestRateBps: 1200, emiAmount: 5_649_00n, tenureMonths: 24, emiDay: 5, startDate: '2026-01-05', emiAccountId: 'idfc' },
    }),
    account('idfc_debit', 'debit_card', { name: 'IDFC Debit', linkedAccountId: 'idfc' }),
    account('fd', 'fixed_deposit', { name: 'FD' }),
  ];
  const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    id: c.systemKey ?? c.name.toLowerCase().replace(/[^a-z]+/g, '_'),
    kind: c.kind,
    name: c.name,
    icon: c.icon,
    color: c.color,
    parentId: null,
    systemKey: c.systemKey ?? null,
    archived: false,
    sortOrder: i,
  }));
  const people: Person[] = [
    { id: 'parents', name: 'Parents', relation: 'parent', color: null, emoji: null, phone: null, notes: null, archived: false },
    { id: 'rahul', name: 'Rahul', relation: 'friend', color: null, emoji: null, phone: null, notes: null, archived: false },
    { id: 'aisha', name: 'Aisha', relation: 'roommate', color: null, emoji: null, phone: null, notes: null, archived: false },
  ];
  const ctx: LedgerContext = makeContext(accounts, categories, people.map((p) => p.id));
  const entries: Entry[] = [];
  let id = 0;
  const post = (intent: EntryIntent): Entry => {
    const e = buildEntry(intent, ctx);
    const saved = { ...e, id: `e${++id}`, createdAt: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z` };
    entries.push(saved);
    return saved;
  };
  return { accounts, categories, people, ctx, entries, post, kindOf: (cid: string) => categories.find((c) => c.id === cid)?.kind };
}
