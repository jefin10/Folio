import type { ISODate } from './dates';
import { signedToNatural } from './ledger';
import type { Paise } from './money';
import type { Account, AccountBalance, Entry, Person } from './types';

/**
 * Compute every account's balance from the ledger.
 * Mirrors the `folio.account_balances` view.
 *
 *   bank:   opening + credits − debits
 *   card:   opening outstanding + purchases + fees + interest − repayments − refunds
 *   loan:   opening principal + interest capitalised − principal repaid
 *
 * All three are the same formula once postings follow double-entry signs.
 */
export function computeBalances(accounts: Pick<Account, 'id' | 'class'>[], entries: Pick<Entry, 'postings' | 'status' | 'occurredOn'>[], asOf?: ISODate): Map<string, AccountBalance> {
  const out = new Map<string, AccountBalance>();
  for (const a of accounts) out.set(a.id, { accountId: a.id, ledgerSum: 0n, balance: 0n, lastActivityOn: null, postingCount: 0 });
  for (const e of entries) {
    if (e.status === 'void') continue;
    if (asOf && e.occurredOn > asOf) continue;
    for (const p of e.postings) {
      if (p.target !== 'account' || !p.accountId) continue;
      const b = out.get(p.accountId);
      if (!b) continue;
      b.ledgerSum += p.amount;
      b.postingCount += 1;
      if (!b.lastActivityOn || e.occurredOn > b.lastActivityOn) b.lastActivityOn = e.occurredOn;
    }
  }
  for (const a of accounts) {
    const b = out.get(a.id)!;
    b.balance = signedToNatural(b.ledgerSum, a.class);
  }
  return out;
}

export interface PersonBalance {
  personId: string;
  /** Total ever paid on their behalf (their shares of purchases + money lent). */
  paidOnBehalf: Paise;
  /** Total they have paid back to me (plus refunds of their shares). */
  reimbursed: Paise;
  /** Positive: they owe me. Negative: I owe them. */
  outstanding: Paise;
  lastActivityOn: ISODate | null;
}

/** Mirrors the `folio.person_balances` view. */
export function computePersonBalances(people: Pick<Person, 'id'>[], entries: Pick<Entry, 'postings' | 'status' | 'occurredOn'>[]): Map<string, PersonBalance> {
  const out = new Map<string, PersonBalance>();
  for (const p of people) out.set(p.id, { personId: p.id, paidOnBehalf: 0n, reimbursed: 0n, outstanding: 0n, lastActivityOn: null });
  for (const e of entries) {
    if (e.status === 'void') continue;
    for (const p of e.postings) {
      if (p.target !== 'person' || !p.personId) continue;
      const b = out.get(p.personId);
      if (!b) continue;
      if (p.amount > 0n) b.paidOnBehalf += p.amount;
      else b.reimbursed += -p.amount;
      b.outstanding += p.amount;
      if (!b.lastActivityOn || e.occurredOn > b.lastActivityOn) b.lastActivityOn = e.occurredOn;
    }
  }
  return out;
}

/** Running balance for a single account's ledger view, newest first. */
export function runningBalance(account: Pick<Account, 'id' | 'class'>, entries: Pick<Entry, 'id' | 'postings' | 'status' | 'occurredOn' | 'createdAt'>[]): { entryId: string; delta: Paise; balanceAfter: Paise }[] {
  const relevant = entries
    .filter((e) => e.status !== 'void' && e.postings.some((p) => p.target === 'account' && p.accountId === account.id))
    .sort((a, b) => (a.occurredOn === b.occurredOn ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') : a.occurredOn < b.occurredOn ? -1 : 1));
  let running = 0n;
  const rows: { entryId: string; delta: Paise; balanceAfter: Paise }[] = [];
  for (const e of relevant) {
    const signed = e.postings.filter((p) => p.target === 'account' && p.accountId === account.id).reduce((s, p) => s + p.amount, 0n);
    running += signed;
    rows.push({ entryId: e.id!, delta: signedToNatural(signed, account.class), balanceAfter: signedToNatural(running, account.class) });
  }
  return rows.reverse();
}
