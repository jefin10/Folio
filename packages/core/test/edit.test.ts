import { describe, expect, it } from 'vitest';
import { intentFromEntry } from '../src/edit';
import { buildEntry, type EntryIntent } from '../src/ledger';
import { key, world } from './fixtures';

const D = '2026-11-10';

describe('edit round-trip: entry → intent → identical postings', () => {
  const cases: EntryIntent[] = [
    { kind: 'expense', accountId: 'sbi_elite', amount: 10_000_00n, categoryId: 'groceries', shares: [{ personId: 'parents', amount: 7_000_00n }], occurredOn: D, idempotencyKey: 'k-edit-0001' },
    { kind: 'expense', accountId: 'idfc_debit', amount: 300_00n, categoryId: 'groceries', occurredOn: D, idempotencyKey: 'k-edit-0002' },
    { kind: 'income', accountId: 'idfc', amount: 50_000_00n, categoryId: 'salary', occurredOn: D, idempotencyKey: 'k-edit-0003' },
    { kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'sbi_elite', amount: 5_000_00n, occurredOn: D, idempotencyKey: 'k-edit-0004' },
    { kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'kotak', amount: 5_000_00n, fee: 5_90n, occurredOn: D, idempotencyKey: 'k-edit-0005' },
    { kind: 'loan_repayment', fromAccountId: 'idfc', loanAccountId: 'bike_loan', amount: 5_649_00n, interest: 1_200_00n, occurredOn: D, idempotencyKey: 'k-edit-0006' },
    { kind: 'reimbursement_received', accountId: 'kotak', personId: 'rahul', amount: 400_00n, occurredOn: D, idempotencyKey: 'k-edit-0007' },
    { kind: 'interest', accountId: 'idfc', direction: 'earned', amount: 99_00n, occurredOn: D, idempotencyKey: 'k-edit-0008' },
    { kind: 'expense', paidByPersonId: 'rahul', amount: 450_00n, categoryId: 'transport', occurredOn: D, idempotencyKey: 'k-edit-0009' },
  ];
  for (const intent of cases) {
    it(`${intent.kind} ${intent.idempotencyKey}`, () => {
      const w = world();
      const original = buildEntry(intent, w.ctx);
      const back = intentFromEntry(original, w.ctx);
      expect(back).not.toBeNull();
      const rebuilt = buildEntry({ ...(back as EntryIntent), idempotencyKey: key() }, w.ctx);
      expect(rebuilt.type).toBe(original.type);
      expect(rebuilt.postings.map((p) => [p.target, p.accountId ?? p.categoryId ?? p.personId ?? null, p.amount])).toEqual(
        original.postings.map((p) => [p.target, p.accountId ?? p.categoryId ?? p.personId ?? null, p.amount]),
      );
    });
  }
});
