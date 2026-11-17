/**
 * Reimbursements: money paid on someone's behalf ("claims") and money they
 * pay back ("settlements"). The person's balance is simply the sum of their
 * ledger legs; allocation only decides *which* purchases a settlement covers,
 * so one payment can clear several expenses and one expense can be cleared by
 * several payments.
 *
 * Explicit allocations (chosen by the user) are honoured first; anything left
 * is allocated oldest-first.
 */
import type { ISODate } from './dates';
import { min, ZERO, type Paise } from './money';
import type { Entry, SettlementAllocation } from './types';

export interface Claim {
  entryId: string;
  personId: string;
  occurredOn: ISODate;
  description: string;
  amount: Paise;
  settled: Paise;
  outstanding: Paise;
  status: 'open' | 'partial' | 'settled';
  settledBy: { entryId: string; amount: Paise }[];
}

export interface Settlement {
  entryId: string;
  personId: string;
  occurredOn: ISODate;
  amount: Paise;
  allocated: Paise;
  unallocated: Paise;
}

type LedgerEntry = Pick<Entry, 'id' | 'occurredOn' | 'description' | 'postings' | 'status' | 'type' | 'createdAt'>;

export interface PersonLedger {
  personId: string;
  claims: Claim[];
  settlements: Settlement[];
  outstanding: Paise;
}

export function personLedger(personId: string, entries: LedgerEntry[], explicit: SettlementAllocation[] = []): PersonLedger {
  const sorted = [...entries]
    .filter((e) => e.status !== 'void')
    .sort((a, b) => (a.occurredOn === b.occurredOn ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') : a.occurredOn < b.occurredOn ? -1 : 1));

  const claims: Claim[] = [];
  const settlements: Settlement[] = [];
  for (const e of sorted) {
    let legSum = ZERO;
    for (const p of e.postings) if (p.target === 'person' && p.personId === personId) legSum += p.amount;
    if (legSum > 0n) {
      claims.push({ entryId: e.id!, personId, occurredOn: e.occurredOn, description: e.description, amount: legSum, settled: ZERO, outstanding: legSum, status: 'open', settledBy: [] });
    } else if (legSum < 0n) {
      settlements.push({ entryId: e.id!, personId, occurredOn: e.occurredOn, amount: -legSum, allocated: ZERO, unallocated: -legSum });
    }
  }

  const claimById = new Map(claims.map((c) => [c.entryId, c]));
  const settlementById = new Map(settlements.map((s) => [s.entryId, s]));

  const apply = (s: Settlement, c: Claim, amount: Paise) => {
    if (amount <= 0n) return;
    s.allocated += amount;
    s.unallocated -= amount;
    c.settled += amount;
    c.outstanding -= amount;
    const existing = c.settledBy.find((x) => x.entryId === s.entryId);
    if (existing) existing.amount += amount;
    else c.settledBy.push({ entryId: s.entryId, amount });
  };

  // 1. Explicit allocations.
  for (const a of explicit) {
    if (a.personId !== personId) continue;
    const s = settlementById.get(a.settlementEntryId);
    const c = claimById.get(a.claimEntryId);
    if (!s || !c) continue;
    apply(s, c, min(a.amount, min(s.unallocated, c.outstanding)));
  }

  // 2. FIFO for the rest.
  for (const s of settlements) {
    for (const c of claims) {
      if (s.unallocated <= 0n) break;
      if (c.outstanding <= 0n) continue;
      apply(s, c, min(s.unallocated, c.outstanding));
    }
  }

  for (const c of claims) c.status = c.outstanding === 0n ? 'settled' : c.settled > 0n ? 'partial' : 'open';
  const outstanding = claims.reduce((t, c) => t + c.amount, ZERO) - settlements.reduce((t, s) => t + s.amount, ZERO);
  return { personId, claims, settlements, outstanding };
}

/**
 * Plan a settlement: given an amount received and the claims the user ticked,
 * produce explicit allocations (oldest first within the selection).
 */
export function planAllocations(settlementEntryId: string, personId: string, amount: Paise, selectedClaims: Claim[]): SettlementAllocation[] {
  let left = amount;
  const out: SettlementAllocation[] = [];
  const ordered = [...selectedClaims].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0));
  for (const c of ordered) {
    if (left <= 0n) break;
    const take = min(left, c.outstanding);
    if (take <= 0n) continue;
    out.push({ settlementEntryId, claimEntryId: c.entryId, personId, amount: take });
    left -= take;
  }
  return out;
}

export interface SettlementSummaryLine {
  personId: string;
  outstanding: Paise;
  openClaims: number;
  oldestOpenOn: ISODate | null;
}

export function settlementSummary(ledgers: PersonLedger[]): SettlementSummaryLine[] {
  return ledgers
    .map((l) => {
      const open = l.claims.filter((c) => c.status !== 'settled');
      return { personId: l.personId, outstanding: l.outstanding, openClaims: open.length, oldestOpenOn: open[0]?.occurredOn ?? null };
    })
    .filter((l) => l.outstanding !== 0n)
    .sort((a, b) => (b.outstanding > a.outstanding ? 1 : b.outstanding < a.outstanding ? -1 : 0));
}
