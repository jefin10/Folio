/**
 * Reverse mapping: turn a recorded entry back into the intent that would
 * rebuild it, so the same composer can be used to correct it. The rebuilt
 * entry keeps the original idempotency key and is saved via update_entry
 * (which snapshots the previous version).
 */
import type { EntryIntent, LedgerContext } from './ledger';
import type { Entry } from './types';

/** Distributes over the union so each member keeps its own fields. */
export type EditableIntent = EntryIntent extends infer I ? (I extends EntryIntent ? Omit<I, 'idempotencyKey'> & { idempotencyKey?: string } : never) : never;

export function intentFromEntry(entry: Entry, ctx: LedgerContext): EditableIntent | null {
  const acctLegs = entry.postings.filter((p) => p.target === 'account');
  const catLegs = entry.postings.filter((p) => p.target === 'category');
  const personLegs = entry.postings.filter((p) => p.target === 'person');
  const base = { occurredOn: entry.occurredOn, description: entry.description, notes: entry.notes, counterparty: entry.counterparty, tags: entry.tags };
  const neg = acctLegs.find((p) => p.amount < 0n);
  const pos = acctLegs.find((p) => p.amount > 0n);

  switch (entry.type) {
    case 'expense':
    case 'card_purchase': {
      const categoryId = catLegs[0]?.categoryId ?? entry.categoryId;
      if (!categoryId) return null;
      const payer = personLegs.find((p) => p.amount < 0n);
      return {
        kind: 'expense',
        ...base,
        amount: entry.amount,
        categoryId,
        accountId: payer ? null : entry.instrumentId ?? neg?.accountId ?? null,
        paidByPersonId: payer && !neg ? payer.personId! : null,
        shares: personLegs.filter((p) => p.amount > 0n).map((p) => ({ personId: p.personId!, amount: p.amount })),
      };
    }
    case 'income':
      if (!pos || !catLegs[0]) return null;
      return { kind: 'income', ...base, accountId: pos.accountId!, amount: entry.amount, categoryId: catLegs[0].categoryId! };
    case 'transfer':
    case 'card_repayment':
    case 'cash_withdrawal':
    case 'cash_deposit': {
      if (!neg || !pos) return null;
      const fee = catLegs.reduce((s, p) => s + p.amount, 0n);
      return { kind: 'transfer', ...base, fromAccountId: entry.instrumentId ?? neg.accountId!, toAccountId: pos.accountId!, amount: pos.amount, fee, feeCategoryId: catLegs[0]?.categoryId ?? null };
    }
    case 'loan_repayment': {
      if (!neg) return null;
      const loanLeg = acctLegs.find((p) => p.amount > 0n);
      const interest = catLegs.reduce((s, p) => s + p.amount, 0n);
      const loanId = loanLeg?.accountId ?? [...ctx.accounts.values()].find((a) => a.id !== neg.accountId && a.class === 'liability')?.id;
      if (!loanId) return null;
      return { kind: 'loan_repayment', ...base, fromAccountId: entry.instrumentId ?? neg.accountId!, loanAccountId: loanId, amount: entry.amount, interest, interestCategoryId: catLegs[0]?.categoryId ?? null };
    }
    case 'refund':
      if (!pos) return null;
      return { kind: 'refund', ...base, accountId: entry.instrumentId ?? pos.accountId!, amount: entry.amount, categoryId: catLegs[0]?.categoryId ?? entry.categoryId! };
    case 'reimbursement_received':
      if (!pos || !personLegs[0]) return null;
      return { kind: 'reimbursement_received', ...base, accountId: pos.accountId!, personId: personLegs[0].personId!, amount: entry.amount };
    case 'reimbursement_paid':
      if (!neg || !personLegs[0]) return null;
      return { kind: 'reimbursement_paid', ...base, accountId: entry.instrumentId ?? neg.accountId!, personId: personLegs[0].personId!, amount: entry.amount };
    case 'interest': {
      const a = acctLegs[0];
      if (!a) return null;
      return { kind: 'interest', ...base, accountId: a.accountId!, amount: entry.amount, direction: a.amount > 0n ? 'earned' : 'charged', categoryId: catLegs[0]?.categoryId ?? null };
    }
    case 'bank_charges':
      if (!neg) return null;
      return { kind: 'bank_charges', ...base, accountId: neg.accountId!, amount: entry.amount, categoryId: catLegs[0]?.categoryId ?? null };
    case 'bank_deposit':
      if (!pos) return null;
      return { kind: 'bank_deposit', ...base, accountId: pos.accountId!, amount: entry.amount, fromAccountId: neg?.accountId ?? null, categoryId: catLegs[0]?.categoryId ?? null };
    case 'bank_withdrawal':
      if (!neg) return null;
      return { kind: 'bank_withdrawal', ...base, accountId: neg.accountId!, amount: entry.amount, toAccountId: pos?.accountId ?? null, categoryId: catLegs[0]?.categoryId ?? null };
    case 'loan_disbursement': {
      const loanLeg = acctLegs.find((p) => p.amount < 0n);
      if (!loanLeg) return null;
      const fee = catLegs.filter((p) => p.memo === 'Processing fee').reduce((s, p) => s + p.amount, 0n);
      return { kind: 'loan_disbursement', ...base, loanAccountId: loanLeg.accountId!, toAccountId: pos?.accountId ?? null, purchaseCategoryId: pos ? null : catLegs.find((p) => p.memo !== 'Processing fee')?.categoryId ?? null, amount: entry.amount, processingFee: fee };
    }
    case 'adjustment':
    case 'opening_balance':
      return null; // corrected from the account screen
  }
}
