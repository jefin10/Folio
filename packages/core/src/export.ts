import { formatDate } from './dates';
import { ENTRY_TYPE_LABEL } from './ledger';
import { formatMoneyPlain } from './money';
import type { Account, Category, Entry, Person } from './types';

function csvCell(v: string | null | undefined): string {
  const s = v ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per posting leg — lossless and re-importable into a spreadsheet. */
export function entriesToCsv(entries: Entry[], lookups: { accounts: Account[]; categories: Category[]; people: Person[] }): string {
  const acc = new Map(lookups.accounts.map((a) => [a.id, a.nickname || a.name]));
  const cat = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const ppl = new Map(lookups.people.map((p) => [p.id, p.name]));
  const header = ['Date', 'Type', 'Description', 'Entry amount', 'Leg', 'Leg target', 'Leg amount (debit +)', 'Status', 'Notes', 'Entry ID'];
  const lines = [header.join(',')];
  for (const e of entries) {
    for (const p of e.postings) {
      const target =
        p.target === 'account' ? acc.get(p.accountId!) : p.target === 'category' ? cat.get(p.categoryId!) : p.target === 'person' ? ppl.get(p.personId!) : 'Equity';
      lines.push(
        [formatDate(e.occurredOn), ENTRY_TYPE_LABEL[e.type], e.description, formatMoneyPlain(e.amount), p.target, target ?? '?', formatMoneyPlain(p.amount), e.status, e.notes, e.id ?? '']
          .map((x) => csvCell(x ?? ''))
          .join(','),
      );
    }
  }
  return lines.join('\n');
}

/** JSON-safe deep clone with bigints as strings. */
export function toJsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
