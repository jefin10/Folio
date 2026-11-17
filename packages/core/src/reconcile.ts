/**
 * Statement reconciliation.
 *
 * Compares what the bank says (statement lines + closing balance) with what
 * the Folio ledger says for the same account and period. Lines are matched
 * to ledger entries by exact amount, date proximity and description
 * similarity. Nothing is changed automatically — the user reviews the result
 * and chooses to add missing entries or post a correction.
 */
import type { ISODate } from './dates';
import { daysBetween } from './dates';
import { similarity } from './dedupe';
import { abs, ZERO, type Paise } from './money';
import type { Account, Entry, StatementLine } from './types';

export interface LedgerLine {
  entryId: string;
  occurredOn: ISODate;
  description: string;
  /** Same convention as StatementLine: positive = charge (balance owed up / bank balance down). */
  amount: Paise;
}

export interface ReconcileMatch {
  line: StatementLine;
  ledger: LedgerLine;
  confidence: number;
}

export interface ReconcileResult {
  matches: ReconcileMatch[];
  /** On the statement but not in Folio — candidates to add. */
  missingInLedger: StatementLine[];
  /** In Folio but not on the statement — typos, duplicates or next-cycle items. */
  missingOnStatement: LedgerLine[];
  statementBalance: Paise | null;
  ledgerBalance: Paise;
  /** statementBalance − ledgerBalance (0 means fully reconciled). */
  difference: Paise | null;
  reconciled: boolean;
}

/**
 * Express an account's ledger postings within a period as statement-style
 * lines (charges positive).
 */
export function ledgerLinesFor(account: Pick<Account, 'id' | 'class'>, entries: Pick<Entry, 'id' | 'occurredOn' | 'description' | 'postings' | 'status'>[], from: ISODate, to: ISODate): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const e of entries) {
    if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
    let signed = ZERO;
    for (const p of e.postings) if (p.target === 'account' && p.accountId === account.id) signed += p.amount;
    if (signed === 0n) continue;
    // A charge is a credit (−) to either class of account.
    lines.push({ entryId: e.id!, occurredOn: e.occurredOn, description: e.description, amount: -signed });
  }
  return lines;
}

export function reconcile(statementLines: StatementLine[], ledgerLines: LedgerLine[], opts: { statementBalance?: Paise | null; ledgerBalance: Paise; dateWindowDays?: number }): ReconcileResult {
  const window = opts.dateWindowDays ?? 4;
  const unusedLedger = new Set(ledgerLines.map((_, i) => i));
  const matches: ReconcileMatch[] = [];
  const missingInLedger: StatementLine[] = [];

  // Pre-matched lines (user linked them earlier) first.
  const pending: StatementLine[] = [];
  for (const line of statementLines) {
    if (line.matchedEntryId) {
      const idx = ledgerLines.findIndex((l, i) => unusedLedger.has(i) && l.entryId === line.matchedEntryId);
      if (idx >= 0) {
        unusedLedger.delete(idx);
        matches.push({ line, ledger: ledgerLines[idx]!, confidence: 1 });
        continue;
      }
    }
    pending.push(line);
  }

  // Greedy best-score matching; process larger amounts first (fewer collisions).
  pending.sort((a, b) => (abs(b.amount) > abs(a.amount) ? 1 : abs(b.amount) < abs(a.amount) ? -1 : 0));
  for (const line of pending) {
    let best = -1;
    let bestScore = 0;
    for (const i of unusedLedger) {
      const l = ledgerLines[i]!;
      if (l.amount !== line.amount) continue;
      const gap = Math.abs(daysBetween(line.occurredOn, l.occurredOn));
      if (gap > window) continue;
      const score = 0.6 + 0.3 * similarity(line.description, l.description) + 0.1 * (1 - gap / (window + 1));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      unusedLedger.delete(best);
      matches.push({ line, ledger: ledgerLines[best]!, confidence: Math.round(bestScore * 100) / 100 });
    } else {
      missingInLedger.push(line);
    }
  }

  const missingOnStatement = [...unusedLedger].map((i) => ledgerLines[i]!);
  const statementBalance = opts.statementBalance ?? null;
  const difference = statementBalance === null ? null : statementBalance - opts.ledgerBalance;
  return {
    matches,
    missingInLedger,
    missingOnStatement,
    statementBalance,
    ledgerBalance: opts.ledgerBalance,
    difference,
    reconciled: difference === 0n && missingInLedger.length === 0,
  };
}
