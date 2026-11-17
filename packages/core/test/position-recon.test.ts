import { describe, expect, it } from 'vitest';
import { computeBalances, computePersonBalances } from '../src/balances';
import { defaultDashboard, moveWidget, normaliseDashboard, toggleWidget } from '../src/dashboard';
import { dedupeQueue, findDuplicates } from '../src/dedupe';
import { detectMapping, importStatementCsv, parseCsv } from '../src/importer';
import { computePosition } from '../src/position';
import { ledgerLinesFor, reconcile } from '../src/reconcile';
import { personLedger, planAllocations } from '../src/reimbursements';
import { containsSensitiveCardData } from '../src/schemas';
import { matchByHint, parseQuickEntry } from '../src/voice';
import { key, world } from './fixtures';

describe('net worth', () => {
  it('assets + receivables − liabilities; credit limits are not assets; exclusions honoured', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 60_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'opening_balance', accountId: 'kotak', balance: 15_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'opening_balance', accountId: 'cash', balance: 2_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'opening_balance', accountId: 'fd', balance: 1_00_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'opening_balance', accountId: 'bike_loan', balance: 80_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 10_000_00n, categoryId: 'groceries', shares: [{ personId: 'parents', amount: 7_000_00n }], occurredOn: '2026-11-05', idempotencyKey: key() });

    const balances = computeBalances(w.accounts, w.entries);
    const people = computePersonBalances(w.people, w.entries);
    const pos = computePosition({ accounts: w.accounts, balances, personBalances: people });
    expect(pos.bankBalance).toBe(75_000_00n);
    expect(pos.liquid).toBe(77_000_00n);
    expect(pos.deposits).toBe(1_00_000_00n);
    expect(pos.totalAssets).toBe(1_77_000_00n);
    expect(pos.creditOutstanding).toBe(10_000_00n);
    expect(pos.availableCredit).toBe(1_90_000_00n);
    expect(pos.loanOutstanding).toBe(80_000_00n);
    expect(pos.receivables).toBe(7_000_00n);
    expect(pos.netWorth).toBe(1_77_000_00n + 7_000_00n - 10_000_00n - 80_000_00n);

    const excluded = w.accounts.map((a) => (a.id === 'fd' ? { ...a, includeInNetWorth: false } : a));
    expect(computePosition({ accounts: excluded, balances, personBalances: people }).netWorth).toBe(pos.netWorth - 1_00_000_00n);
  });

  it('after-obligations subtracts only bills paid from liquid money', () => {
    const w = world();
    w.post({ kind: 'opening_balance', accountId: 'idfc', balance: 50_000_00n, occurredOn: '2026-11-01', idempotencyKey: key() });
    const pos = computePosition({
      accounts: w.accounts,
      balances: computeBalances(w.accounts, w.entries),
      personBalances: [],
      upcoming: [
        { ruleId: 'rent', name: 'Rent', kind: 'rent', dueOn: '2026-11-20', amount: 15_000_00n, isVariable: false, state: 'upcoming', daysAway: 3, sourceAccountId: 'idfc', targetAccountId: null, occurrence: null, key: 'k1' },
        { ruleId: 'ott', name: 'OTT', kind: 'subscription', dueOn: '2026-11-21', amount: 649_00n, isVariable: false, state: 'upcoming', daysAway: 4, sourceAccountId: 'sbi_elite', targetAccountId: null, occurrence: null, key: 'k2' },
        { ruleId: 'sal', name: 'Salary', kind: 'income', dueOn: '2026-11-30', amount: 60_000_00n, isVariable: false, state: 'upcoming', daysAway: 13, sourceAccountId: null, targetAccountId: 'idfc', occurrence: null, key: 'k3' },
      ],
    });
    expect(pos.upcomingObligations).toBe(15_000_00n);
    expect(pos.afterObligations).toBe(35_000_00n);
  });
});

describe('reimbursement allocation', () => {
  it('one payment settles several expenses; one expense settled by several payments', () => {
    const w = world();
    const e1 = w.post({ kind: 'expense', accountId: 'idfc', amount: 1_000_00n, categoryId: 'groceries', shares: [{ personId: 'parents', amount: 600_00n }], occurredOn: '2026-11-01', idempotencyKey: key() });
    const e2 = w.post({ kind: 'expense', accountId: 'idfc', amount: 2_000_00n, categoryId: 'household', shares: [{ personId: 'parents', amount: 2_000_00n }], occurredOn: '2026-11-02', idempotencyKey: key() });
    w.post({ kind: 'reimbursement_received', accountId: 'idfc', personId: 'parents', amount: 1_000_00n, occurredOn: '2026-11-05', idempotencyKey: key() });
    w.post({ kind: 'reimbursement_received', accountId: 'kotak', personId: 'parents', amount: 1_000_00n, occurredOn: '2026-11-06', idempotencyKey: key() });
    const l = personLedger('parents', w.entries);
    const c1 = l.claims.find((c) => c.entryId === e1.id)!;
    const c2 = l.claims.find((c) => c.entryId === e2.id)!;
    expect(c1.status).toBe('settled');
    expect(c2.status).toBe('partial');
    expect(c2.outstanding).toBe(600_00n);
    expect(c2.settledBy).toHaveLength(2);
    expect(l.outstanding).toBe(600_00n);
  });

  it('explicit allocations override FIFO', () => {
    const w = world();
    const e1 = w.post({ kind: 'expense', accountId: 'idfc', amount: 500_00n, categoryId: 'groceries', shares: [{ personId: 'rahul', amount: 500_00n }], occurredOn: '2026-11-01', idempotencyKey: key() });
    const e2 = w.post({ kind: 'expense', accountId: 'idfc', amount: 800_00n, categoryId: 'groceries', shares: [{ personId: 'rahul', amount: 800_00n }], occurredOn: '2026-11-02', idempotencyKey: key() });
    // The UI plans allocations against open claims *before* posting the settlement.
    const before = personLedger('rahul', w.entries);
    const s = w.post({ kind: 'reimbursement_received', accountId: 'idfc', personId: 'rahul', amount: 800_00n, occurredOn: '2026-11-03', idempotencyKey: key() });
    const plan = planAllocations(s.id!, 'rahul', 800_00n, [before.claims.find((c) => c.entryId === e2.id)!]);
    const l = personLedger('rahul', w.entries, plan);
    expect(l.claims.find((c) => c.entryId === e2.id)!.status).toBe('settled');
    expect(l.claims.find((c) => c.entryId === e1.id)!.status).toBe('open');
  });
});

describe('statement reconciliation', () => {
  it('matches lines, finds missing on both sides and the balance difference', () => {
    const w = world();
    const a = w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 1_299_00n, categoryId: 'shopping', description: 'Amazon order', occurredOn: '2026-10-10', idempotencyKey: key() });
    w.post({ kind: 'expense', accountId: 'sbi_elite', amount: 450_00n, categoryId: 'food_dining', description: 'Swiggy', occurredOn: '2026-10-12', idempotencyKey: key() });
    w.post({ kind: 'transfer', fromAccountId: 'idfc', toAccountId: 'sbi_elite', amount: 1_000_00n, description: 'Card payment', occurredOn: '2026-10-15', idempotencyKey: key() });
    const card = w.accounts.find((x) => x.id === 'sbi_elite')!;
    const ledger = ledgerLinesFor(card, w.entries, '2026-10-06', '2026-11-05');
    expect(ledger.find((l) => l.entryId === a.id)!.amount).toBe(1_299_00n);
    const result = reconcile(
      [
        { occurredOn: '2026-10-11', description: 'AMAZON PAY INDIA', amount: 1_299_00n },
        { occurredOn: '2026-10-15', description: 'PAYMENT RECEIVED THANK YOU', amount: -1_000_00n },
        { occurredOn: '2026-10-20', description: 'ANNUAL FEE', amount: 499_00n },
      ],
      ledger,
      { statementBalance: 1_248_00n, ledgerBalance: computeBalances(w.accounts, w.entries).get('sbi_elite')!.balance },
    );
    expect(result.matches).toHaveLength(2);
    expect(result.missingInLedger.map((l) => l.description)).toEqual(['ANNUAL FEE']);
    expect(result.missingOnStatement.map((l) => l.description)).toEqual(['Swiggy']);
    expect(result.difference).toBe(1_248_00n - 749_00n);
    expect(result.reconciled).toBe(false);
  });
});

describe('duplicates and idempotency', () => {
  it('flags same amount + account + close date + similar text', () => {
    const w = world();
    const e = w.post({ kind: 'expense', accountId: 'idfc', amount: 1_499_00n, categoryId: 'bills_utilities', description: 'Airtel postpaid bill', occurredOn: '2026-11-10', idempotencyKey: 'k-airtel-1' });
    const dup = findDuplicates({ amount: 1_499_00n, occurredOn: '2026-11-11', accountId: 'idfc', description: 'AIRTEL bill payment' }, w.entries);
    expect(dup[0]?.entryId).toBe(e.id);
    expect(findDuplicates({ amount: 1_499_00n, occurredOn: '2026-11-20', accountId: 'idfc', description: 'Airtel' }, w.entries)).toHaveLength(0);
    expect(findDuplicates({ amount: 1_500_00n, occurredOn: '2026-11-10', accountId: 'idfc', description: 'Airtel' }, w.entries)).toHaveLength(0);
    expect(findDuplicates({ amount: 1n, occurredOn: '2026-01-01', accountId: null, description: 'x', idempotencyKey: 'k-airtel-1' }, w.entries)[0]?.reason).toBe('Same submission');
  });

  it('offline queue replay never sends the same intent twice', () => {
    const q = [{ idempotencyKey: 'a' }, { idempotencyKey: 'b' }, { idempotencyKey: 'a' }, { idempotencyKey: 'c' }];
    expect(dedupeQueue(q, ['c']).map((x) => x.idempotencyKey)).toEqual(['a', 'b']);
  });
});

describe('CSV import', () => {
  it('handles quoted fields and debit/credit columns', () => {
    const csv = 'Statement for XXXX1234\nTxn Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/11/2026,"UPI/SWIGGY, BLR",450.00,,10000\n02/11/2026,SALARY NOV,,"60,000.00",70000\n,,,,\n';
    expect(parseCsv(csv)[2]![1]).toBe('UPI/SWIGGY, BLR');
    const mapping = detectMapping(parseCsv(csv));
    expect(mapping).toMatchObject({ headerRow: 1, date: 0, description: 1, debit: 2, credit: 3 });
    const r = importStatementCsv(csv);
    expect(r.lines).toEqual([
      { occurredOn: '2026-11-01', description: 'UPI/SWIGGY, BLR', amount: 450_00n },
      { occurredOn: '2026-11-02', description: 'SALARY NOV', amount: -60_000_00n },
    ]);
  });

  it('handles single amount column with Dr/Cr markers', () => {
    const csv = 'Date,Transaction Details,Amount\n05-11-2026,AMAZON,1299.00 Dr\n06-11-2026,PAYMENT RECEIVED,5000.00 Cr\n';
    expect(importStatementCsv(csv).lines.map((l) => l.amount)).toEqual([1_299_00n, -5_000_00n]);
  });
});

describe('quick entry parsing (phone + watch voice)', () => {
  it('parses amount, description, account and shares', () => {
    const p = parseQuickEntry('10000 household groceries on elite, parents owe 7000', { accountNames: ['SBI ELITE', 'IDFC First'] });
    expect(p.amount).toBe(10_000_00n);
    expect(p.accountHint).toBe('elite');
    expect(p.shares).toEqual([{ nameHint: 'parents', amount: 7_000_00n }]);
    expect(p.description.toLowerCase()).toContain('household groceries');
  });

  it('handles k suffix and split with half', () => {
    const p = parseQuickEntry('spent 1.2k on dinner split with rahul');
    expect(p.amount).toBe(1_200_00n);
    expect(p.shares[0]).toEqual({ nameHint: 'rahul', amount: 600_00n });
    expect(p.description).toBe('Dinner');
    expect(p.accountHint).toBeNull();
  });

  it('strong cues name the account even without a known list', () => {
    expect(parseQuickEntry('uber 340 paid by hdfc').accountHint).toBe('hdfc');
    expect(parseQuickEntry('lunch 250 with friends').accountHint).toBeNull();
    expect(parseQuickEntry('fuel 500 on kotak card').accountHint).toBe('kotak');
  });

  it('matches hints fuzzily', () => {
    const items = [{ n: 'SBI ELITE' }, { n: 'IDFC First' }];
    expect(matchByHint('elite', items, (i) => [i.n])?.n).toBe('SBI ELITE');
    expect(matchByHint('idfc', items, (i) => [i.n])?.n).toBe('IDFC First');
    expect(matchByHint('hdfc', items, (i) => [i.n])).toBeNull();
  });
});

describe('dashboard preferences', () => {
  it('defaults, reorder, toggle and repair', () => {
    const d = defaultDashboard();
    expect(d.widgets[0]!.id).toBe('net_worth');
    const moved = moveWidget(d, 'card_carousel', -1);
    expect(moved.widgets.findIndex((w) => w.id === 'card_carousel')).toBe(d.widgets.findIndex((w) => w.id === 'bank_carousel'));
    expect(toggleWidget(d, 'recent').widgets.find((w) => w.id === 'recent')!.visible).toBe(false);
    const repaired = normaliseDashboard({ version: 1, widgets: [{ id: 'recent', visible: true }] });
    expect(repaired.widgets).toHaveLength(d.widgets.length);
    expect(normaliseDashboard('garbage').widgets).toHaveLength(d.widgets.length);
  });
});

describe('security guards', () => {
  it('detects full card numbers and CVV/OTP', () => {
    expect(containsSensitiveCardData('4111 1111 1111 1111')).toBe(true);
    expect(containsSensitiveCardData('otp 482913')).toBe(true);
    expect(containsSensitiveCardData('Ref 1234 for lunch')).toBe(false);
  });
});
