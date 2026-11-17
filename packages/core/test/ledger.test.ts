import { describe, expect, it } from 'vitest';
import { computeBalances, computePersonBalances } from '../src/balances';
import { breakdown, buildEntry, LedgerError, validateEntry } from '../src/ledger';
import { periodTotals } from '../src/analytics';
import { computePosition } from '../src/position';
import { key, world } from './fixtures';

const D = '2026-11-10';

describe('opening balances and bank accounts', () => {
  it('opening + credits − debits = current balance', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 50_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'income', accountId: 'idfc', amount: 40_000_00n, categoryId: 'salary', occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'idfc', amount: 1_250_50n, categoryId: 'food_dining', occurredOn: D, idempotencyKey: key() });
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('idfc')!.balance).toBe(50_000_00n + 40_000_00n - 1_250_50n);
  });

  it('opening outstanding on a credit card is a liability, not money', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'sbi_elite', balance: 12_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('sbi_elite')!.balance).toBe(12_000_00n);
    expect(b.get('sbi_elite')!.ledgerSum).toBe(-12_000_00n);
  });
});

describe('transfers', () => {
  it('₹5,000 IDFC → Kotak moves money and creates no income or expense', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 20_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'opening_balance', accountId: 'kotak', balance: 1_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    const t = w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'kotak', amount: 5_000_00n, occurredOn: D, idempotencyKey: key() });
    expect(t.type).toBe('transfer');
    expect(t.postings.every((p) => p.target === 'account')).toBe(true);
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('idfc')!.balance).toBe(15_000_00n);
    expect(b.get('kotak')!.balance).toBe(6_000_00n);
    const totals = periodTotals(w.entries, w.kindOf, '2026-11-01', '2026-11-30');
    expect(totals.income).toBe(0n);
    expect(totals.personalExpense).toBe(0n);
    expect(totals.transfers).toBe(5_000_00n);
    expect(breakdown(t, w.kindOf).netWorthDelta).toBe(0n);
  });

  it('rejects transferring to the same account', () => {
    const w = world();
    expect(() => buildEntry({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'idfc', amount: 100n, occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow(LedgerError);
  });

  it('transfer fees are the only expense a transfer may carry', () => {
    const w = world();
    const t = w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'kotak', amount: 10_000_00n, fee: 5_90n, occurredOn: D, idempotencyKey: key() });
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('idfc')!.balance).toBe(-(10_000_00n + 5_90n));
    expect(b.get('kotak')!.balance).toBe(10_000_00n);
    expect(periodTotals(w.entries, w.kindOf, D, D).personalExpense).toBe(5_90n);
    expect(t.type).toBe('transfer');
  });

  it('ATM withdrawal is a cash_withdrawal between own accounts', () => {
    const w = world();
    const t = w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'cash', amount: 2_000_00n, occurredOn: D, idempotencyKey: key() });
    expect(t.type).toBe('cash_withdrawal');
    const back = w.post({ kind: 'transfer', fromAccountId: 'cash', toAccountId: 'kotak', amount: 500_00n, occurredOn: D, idempotencyKey: key() });
    expect(back.type).toBe('cash_deposit');
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('cash')!.balance).toBe(1_500_00n);
  });

  it('validator refuses a transfer that books a category on the receiving side', () => {
    const w = world();
    const bad = buildEntry({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'kotak', amount: 100_00n, occurredOn: D, idempotencyKey: key() }, w.ctx);
    bad.postings = [
      { target: 'account', accountId: 'idfc', amount: -100_00n },
      { target: 'account', accountId: 'kotak', amount: 101_00n },
      { target: 'category', categoryId: 'salary', amount: -1_00n },
    ];
    expect(() => validateEntry(bad, w.ctx)).toThrow(/Transfers/);
  });
});

describe('credit cards', () => {
  it('outstanding = opening + purchases + fees + interest − repayments − refunds', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'sbi_elite', balance: 3_000_00n, occurredOn: '2026-10-01', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 8_000_00n, categoryId: 'shopping', occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'bank_charges', accountId: 'sbi_elite', amount: 4_999_00n, occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'interest', accountId: 'sbi_elite', direction: 'charged', amount: 120_00n, occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'sbi_elite', amount: 5_000_00n, occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'refund', accountId: 'sbi_elite', amount: 1_000_00n, categoryId: 'shopping', occurredOn: D, idempotencyKey: key() });
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('sbi_elite')!.balance).toBe(3_000_00n + 8_000_00n + 4_999_00n + 120_00n - 5_000_00n - 1_000_00n);
  });

  it('a card purchase is typed card_purchase and raises the liability', () => {
    const w = world();
    const e = w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 499_00n, categoryId: 'subscriptions', occurredOn: D, idempotencyKey: key() });
    expect(e.type).toBe('card_purchase');
    expect(computeBalances(w.accounts, w.entries).get('sbi_elite')!.balance).toBe(499_00n);
  });

  it('₹5,000 card payment from savings: savings −5,000, card −5,000, no expense', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 30_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 12_000_00n, categoryId: 'shopping', occurredOn: D, idempotencyKey: key() });
    const before = periodTotals(w.entries, w.kindOf, '2026-11-01', '2026-11-30');
    const pay = w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'sbi_elite', amount: 5_000_00n, occurredOn: D, idempotencyKey: key() });
    expect(pay.type).toBe('card_repayment');
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('idfc')!.balance).toBe(25_000_00n);
    expect(b.get('sbi_elite')!.balance).toBe(7_000_00n);
    const after = periodTotals(w.entries, w.kindOf, '2026-11-01', '2026-11-30');
    expect(after.personalExpense).toBe(before.personalExpense);
    expect(after.cardRepayments).toBe(5_000_00n);
  });

  it('card payments by debit card hit the linked bank account', () => {
    const w = world();
    const e = w.post({ kind: 'expense', accountId: 'idfc_debit', amount: 300_00n, categoryId: 'groceries', occurredOn: D, idempotencyKey: key() });
    expect(e.instrumentId).toBe('idfc_debit');
    expect(e.primaryAccountId).toBe('idfc');
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('idfc')!.balance).toBe(-300_00n);
    expect(b.get('idfc_debit')!.balance).toBe(0n);
  });
});

describe('reimbursable expenses', () => {
  it('₹10,000 groceries on SBI ELITE, parents owe ₹7,000', () => {
    const w = world();
    const e = w.post({
      kind: 'expense',
      accountId: 'sbi_elite',
      amount: 10_000_00n,
      categoryId: 'groceries',
      description: 'Household groceries',
      shares: [{ personId: 'parents', amount: 7_000_00n }],
      occurredOn: D,
      idempotencyKey: key(),
    });
    const bd = breakdown(e, w.kindOf);
    expect(bd.personalExpense).toBe(3_000_00n);
    expect(bd.reimbursable).toBe(7_000_00n);
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('sbi_elite')!.balance).toBe(10_000_00n); // card liability +10,000
    const people = computePersonBalances(w.people, w.entries);
    expect(people.get('parents')!.outstanding).toBe(7_000_00n);
    const totals = periodTotals(w.entries, w.kindOf, '2026-11-01', '2026-11-30');
    expect(totals.grossSpend).toBe(10_000_00n);
    expect(totals.personalExpense).toBe(3_000_00n);
    expect(totals.reimbursable).toBe(7_000_00n);

    // Parents transfer ₹7,000 into IDFC.
    w.post({ kind: 'reimbursement_received', accountId: 'idfc', personId: 'parents', amount: 7_000_00n, occurredOn: '2026-11-12', idempotencyKey: key() });
    const b2 = computeBalances(w.accounts, w.entries);
    expect(b2.get('idfc')!.balance).toBe(7_000_00n);
    expect(computePersonBalances(w.people, w.entries).get('parents')!.outstanding).toBe(0n);
    const totals2 = periodTotals(w.entries, w.kindOf, '2026-11-01', '2026-11-30');
    expect(totals2.personalExpense).toBe(3_000_00n); // unchanged
    expect(totals2.income).toBe(0n); // not inflated
    expect(totals2.reimbursementsReceived).toBe(7_000_00n);
  });

  it('net worth falls only by the personal share', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 50_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 10_000_00n, categoryId: 'groceries', shares: [{ personId: 'parents', amount: 7_000_00n }], occurredOn: D, idempotencyKey: key() });
    const pos = computePosition({ accounts: w.accounts, balances: computeBalances(w.accounts, w.entries), personBalances: computePersonBalances(w.people, w.entries) });
    expect(pos.netWorth).toBe(50_000_00n - 3_000_00n);
    expect(pos.receivables).toBe(7_000_00n);
    expect(pos.creditOutstanding).toBe(10_000_00n);
  });

  it('multi-person split with partial reimbursements', () => {
    const w = world();
    w.post({
      kind: 'expense',
      accountId: 'idfc',
      amount: 3_000_00n,
      categoryId: 'food_dining',
      shares: [
        { personId: 'rahul', amount: 1_000_00n },
        { personId: 'aisha', amount: 1_000_00n },
      ],
      occurredOn: D,
      idempotencyKey: key(),
    });
    w.post({ kind: 'reimbursement_received', accountId: 'idfc', personId: 'rahul', amount: 400_00n, occurredOn: D, idempotencyKey: key() });
    w.post({ kind: 'reimbursement_received', accountId: 'kotak', personId: 'rahul', amount: 600_00n, occurredOn: D, idempotencyKey: key() });
    const pb = computePersonBalances(w.people, w.entries);
    expect(pb.get('rahul')!.outstanding).toBe(0n);
    expect(pb.get('aisha')!.outstanding).toBe(1_000_00n);
    expect(periodTotals(w.entries, w.kindOf, D, D).personalExpense).toBe(1_000_00n);
  });

  it('rejects shares larger than the bill and duplicate people', () => {
    const w = world();
    expect(() =>
      buildEntry({ kind: 'expense', accountId: 'idfc', amount: 100_00n, categoryId: 'groceries', shares: [{ personId: 'rahul', amount: 101_00n }], occurredOn: D, idempotencyKey: key() }, w.ctx),
    ).toThrow(/exceed/);
    expect(() =>
      buildEntry(
        {
          kind: 'expense',
          accountId: 'idfc',
          amount: 100_00n,
          categoryId: 'groceries',
          shares: [
            { personId: 'rahul', amount: 10_00n },
            { personId: 'rahul', amount: 10_00n },
          ],
          occurredOn: D,
          idempotencyKey: key(),
        },
        w.ctx,
      ),
    ).toThrow(/once/);
  });

  it('fully-on-behalf purchase has no personal expense leg', () => {
    const w = world();
    const e = w.post({ kind: 'expense', accountId: 'idfc', amount: 2_000_00n, categoryId: 'shopping', shares: [{ personId: 'parents', amount: 2_000_00n }], occurredOn: D, idempotencyKey: key() });
    expect(e.postings.some((p) => p.target === 'category')).toBe(false);
    expect(breakdown(e, w.kindOf).personalExpense).toBe(0n);
  });

  it('someone else paying for me creates a payable, not a bank movement', () => {
    const w = world();
    w.post({ kind: 'expense', paidByPersonId: 'rahul', amount: 450_00n, categoryId: 'transport', occurredOn: D, idempotencyKey: key() });
    const pb = computePersonBalances(w.people, w.entries);
    expect(pb.get('rahul')!.outstanding).toBe(-450_00n);
    const pos = computePosition({ accounts: w.accounts, balances: computeBalances(w.accounts, w.entries), personBalances: pb });
    expect(pos.payables).toBe(450_00n);
    expect(pos.netWorth).toBe(-450_00n);
    w.post({ kind: 'reimbursement_paid', accountId: 'idfc', personId: 'rahul', amount: 450_00n, occurredOn: D, idempotencyKey: key() });
    expect(computePersonBalances(w.people, w.entries).get('rahul')!.outstanding).toBe(0n);
  });
});

describe('refunds', () => {
  it('refund of a split purchase returns shares proportionally', () => {
    const w = world();
    const orig = w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 10_000_00n, categoryId: 'groceries', shares: [{ personId: 'parents', amount: 7_000_00n }], occurredOn: D, idempotencyKey: key() });
    const r = w.post({ kind: 'refund', accountId: 'sbi_elite', amount: 1_000_00n, categoryId: 'groceries', relatedEntry: orig, occurredOn: D, idempotencyKey: key() });
    expect(r.relatedEntryId).toBe(orig.id);
    const pb = computePersonBalances(w.people, w.entries);
    expect(pb.get('parents')!.outstanding).toBe(6_300_00n);
    expect(periodTotals(w.entries, w.kindOf, D, D).personalExpense).toBe(2_700_00n);
    expect(computeBalances(w.accounts, w.entries).get('sbi_elite')!.balance).toBe(9_000_00n);
  });

  it('cannot refund more than the original', () => {
    const w = world();
    const orig = w.post({ kind: 'expense', accountId: 'idfc', amount: 500_00n, categoryId: 'shopping', occurredOn: D, idempotencyKey: key() });
    expect(() => buildEntry({ kind: 'refund', accountId: 'idfc', amount: 600_00n, categoryId: 'shopping', relatedEntry: orig, occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow(/larger/);
  });
});

describe('loans', () => {
  it('EMI splits into principal (reduces loan) and interest (expense)', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'bike_loan', balance: 1_20_000_00n, occurredOn: '2026-01-05', idempotencyKey: key() });
    w.post({ kind: 'loan_repayment', fromAccountId: 'idfc', loanAccountId: 'bike_loan', amount: 5_649_00n, interest: 1_200_00n, occurredOn: '2026-02-05', idempotencyKey: key() });
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('bike_loan')!.balance).toBe(1_20_000_00n - (5_649_00n - 1_200_00n));
    expect(b.get('idfc')!.balance).toBe(-5_649_00n);
    expect(periodTotals(w.entries, w.kindOf, '2026-02-01', '2026-02-28').personalExpense).toBe(1_200_00n);
  });

  it('disbursement raises both the loan and the bank balance — net worth unchanged', () => {
    const w = world();
    const e = w.post({ kind: 'loan_disbursement', loanAccountId: 'bike_loan', toAccountId: 'idfc', amount: 1_00_000_00n, occurredOn: D, idempotencyKey: key() });
    expect(breakdown(e, w.kindOf).netWorthDelta).toBe(0n);
    const b = computeBalances(w.accounts, w.entries);
    expect(b.get('bike_loan')!.balance).toBe(1_00_000_00n);
    expect(b.get('idfc')!.balance).toBe(1_00_000_00n);
  });

  it('rejects interest greater than the payment', () => {
    const w = world();
    expect(() => buildEntry({ kind: 'loan_repayment', fromAccountId: 'idfc', loanAccountId: 'bike_loan', amount: 100n, interest: 101n, occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow();
  });
});

describe('income, interest, adjustments', () => {
  it('income must land in an asset account', () => {
    const w = world();
    expect(() => buildEntry({ kind: 'income', accountId: 'sbi_elite', amount: 100n, categoryId: 'salary', occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow(/Income/);
  });

  it('income cannot use an expense category and vice versa', () => {
    const w = world();
    expect(() => buildEntry({ kind: 'income', accountId: 'idfc', amount: 100n, categoryId: 'groceries', occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow(/income category/);
    expect(() => buildEntry({ kind: 'expense', accountId: 'idfc', amount: 100n, categoryId: 'salary', occurredOn: D, idempotencyKey: key() }, w.ctx)).toThrow(/expense category/);
  });

  it('interest earned on savings is income', () => {
    const w = world();
    w.post({ kind: 'interest', accountId: 'idfc', direction: 'earned', amount: 312_45n, occurredOn: D, idempotencyKey: key() });
    expect(periodTotals(w.entries, w.kindOf, D, D).income).toBe(312_45n);
  });

  it('adjustment corrects the balance to an exact target via equity', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'kotak', balance: 10_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'adjustment', accountId: 'kotak', currentBalance: 10_000_00n, targetBalance: 9_876_54n, occurredOn: D, idempotencyKey: key() });
    expect(computeBalances(w.accounts, w.entries).get('kotak')!.balance).toBe(9_876_54n);
    expect(periodTotals(w.entries, w.kindOf, D, D).personalExpense).toBe(0n);
  });

  it('void entries are ignored everywhere', () => {
    const w = world();
    const e = w.post({ kind: 'expense', accountId: 'idfc', amount: 999_00n, categoryId: 'shopping', occurredOn: D, idempotencyKey: key() });
    e.status = 'void';
    expect(computeBalances(w.accounts, w.entries).get('idfc')!.balance).toBe(0n);
    expect(periodTotals(w.entries, w.kindOf, D, D).personalExpense).toBe(0n);
  });

  it('every built entry balances to zero', () => {
    const w = world();
    for (const e of w.entries) expect(e.postings.reduce((s, p) => s + p.amount, 0n)).toBe(0n);
  });

  it('requires an idempotency key', () => {
    const w = world();
    expect(() => buildEntry({ kind: 'expense', accountId: 'idfc', amount: 1n, categoryId: 'shopping', occurredOn: D, idempotencyKey: '' }, w.ctx)).toThrow(/idempotency/);
  });
});
