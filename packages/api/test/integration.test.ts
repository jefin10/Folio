/**
 * Live integration test against a running Supabase (local `supabase start`).
 * Skipped unless FOLIO_IT_URL and FOLIO_IT_ANON_KEY are set.
 *   FOLIO_IT_URL=http://127.0.0.1:54321 FOLIO_IT_ANON_KEY=... pnpm --filter @folio/api test
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { buildEntry, computePosition, makeContext, newIdempotencyKey, today } from '@folio/core';
import * as repo from '../src/repo';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const url = env.FOLIO_IT_URL;
const key = env.FOLIO_IT_ANON_KEY;
const run = url && key ? describe : describe.skip;

run('live Supabase round-trip', () => {
  it('signs up, creates accounts, posts entries and reads derived balances', async () => {
    const sb = createClient(url!, key!, { auth: { persistSession: false } });
    const email = `it-${Date.now()}@folio.test`;
    const { error } = await sb.auth.signUp({ email, password: 'correct-horse-battery' });
    expect(error).toBeNull();

    const profile = await repo.getProfile(sb);
    expect(profile.baseCurrency).toBe('INR');
    expect(profile.timezone).toBe('Asia/Kolkata');

    const d = today();
    const idfc = await repo.saveAccount(sb, { name: 'IDFC First', type: 'savings', opening: { balance: 20_000_00n, on: d } });
    const kotak = await repo.saveAccount(sb, { name: 'Kotak', type: 'savings', opening: { balance: 1_000_00n, on: d } });
    const card = await repo.saveAccount(sb, { name: 'SBI ELITE', type: 'credit_card', card: { creditLimit: 2_00_000_00n, statementDay: 5, dueDay: 25, network: 'visa' } });
    await repo.savePerson(sb, { name: 'Parents', relation: 'parent' });

    const [accounts, categories, people] = await Promise.all([repo.listAccounts(sb), repo.listCategories(sb), repo.listPeople(sb)]);
    expect(accounts.find((a) => a.id === card)!.card!.creditLimit).toBe(2_00_000_00n);
    const ctx = makeContext(accounts, categories, people.map((p) => p.id));
    const groceries = categories.find((c) => c.name === 'Groceries')!.id;
    const parents = people[0]!.id;

    const t = buildEntry({ kind: 'transfer', fromAccountId: idfc, toAccountId: kotak, amount: 5_000_00n, occurredOn: d, idempotencyKey: newIdempotencyKey(), source: 'web' }, ctx);
    expect((await repo.postEntry(sb, t)).created).toBe(true);
    expect((await repo.postEntry(sb, t)).created).toBe(false); // idempotent replay

    const exp = buildEntry({ kind: 'expense', accountId: card, amount: 10_000_00n, categoryId: groceries, shares: [{ personId: parents, amount: 7_000_00n }], description: 'Household groceries', occurredOn: d, idempotencyKey: newIdempotencyKey() }, ctx);
    const posted = await repo.postEntry(sb, exp);
    const back = buildEntry({ kind: 'reimbursement_received', accountId: idfc, personId: parents, amount: 3_000_00n, occurredOn: d, idempotencyKey: newIdempotencyKey() }, ctx);
    await repo.postEntry(sb, back);

    const balances = new Map((await repo.listBalances(sb)).map((b) => [b.accountId, b]));
    expect(balances.get(idfc)!.balance).toBe(18_000_00n);
    expect(balances.get(kotak)!.balance).toBe(6_000_00n);
    expect(balances.get(card)!.balance).toBe(10_000_00n);
    const pb = await repo.listPersonBalances(sb);
    expect(pb.find((p) => p.personId === parents)!.outstanding).toBe(4_000_00n);

    // Filtering by account keeps every leg of each entry.
    const cardEntries = await repo.listEntriesPage(sb, { accountId: card }, 0);
    expect(cardEntries).toHaveLength(1);
    expect(cardEntries[0]!.postings).toHaveLength(3);
    const parentEntries = await repo.listEntriesInRange(sb, { personId: parents });
    expect(parentEntries).toHaveLength(2);

    const pos = computePosition({ accounts, balances, personBalances: pb });
    expect(pos.netWorth).toBe(18_000_00n + 6_000_00n + 4_000_00n - 10_000_00n);

    // Correction with history, then void.
    const full = await repo.getEntry(sb, posted.id);
    const corrected = buildEntry({ kind: 'expense', accountId: card, amount: 9_500_00n, categoryId: groceries, shares: [{ personId: parents, amount: 7_000_00n }], description: 'Household groceries', occurredOn: d, idempotencyKey: full.idempotencyKey }, ctx);
    await repo.updateEntry(sb, posted.id, full.version, corrected, 'Typo');
    expect((await repo.getEntryRevisions(sb, posted.id))[0]!.reason).toBe('Typo');
    await repo.voidEntry(sb, posted.id, 'test');
    const after = new Map((await repo.listBalances(sb)).map((b) => [b.accountId, b]));
    expect(after.get(card)!.balance).toBe(0n);

    // Reorder + statements + rules.
    await repo.reorderAccounts(sb, [card, kotak, idfc]);
    expect((await repo.listAccounts(sb))[0]!.id).toBe(card);
    const rule = await repo.saveRule(sb, { name: 'Netflix', kind: 'subscription', amount: 649_00n, isVariable: false, frequency: 'monthly', intervalDays: null, startOn: d, endOn: null, maxOccurrences: null, dayOfMonth: null, sourceAccountId: card, targetAccountId: null, categoryId: groceries, personId: null, reminderDaysBefore: 1, reminderTime: '09:00', isActive: true, bankAutopay: false, notes: null });
    const pay = buildEntry({ kind: 'expense', accountId: card, amount: 649_00n, categoryId: groceries, occurredOn: d, idempotencyKey: newIdempotencyKey() }, ctx);
    expect((await repo.confirmOccurrence(sb, rule, d, pay)).created).toBe(true);
    const pay2 = buildEntry({ kind: 'expense', accountId: card, amount: 649_00n, categoryId: groceries, occurredOn: d, idempotencyKey: newIdempotencyKey() }, ctx);
    expect((await repo.confirmOccurrence(sb, rule, d, pay2)).created).toBe(false);
    expect((await repo.listOccurrences(sb))).toHaveLength(1);

    const stmt = await repo.saveStatement(sb, { accountId: card, periodStart: d, periodEnd: d, statementDate: d, dueDate: null, statementBalance: 649_00n, minimumDue: null, filePath: null, notes: null });
    await repo.replaceStatementLines(sb, stmt, [{ occurredOn: d, description: 'NETFLIX', amount: 649_00n }]);
    expect(await repo.listStatementLines(sb, stmt)).toHaveLength(1);

    // Files live in Postgres under RLS.
    const path = await repo.uploadFile(sb, 'artwork', 'card.png', new Uint8Array([137, 80, 78, 71, 13, 10]), 'image/png');
    expect(path.startsWith('file:')).toBe(true);
    expect(await repo.signedUrl(sb, path)).toBe('data:image/png;base64,iVBORw0K');
    expect(Array.from(repo.base64ToBytes((await repo.getFile(sb, path)).base64))).toEqual([137, 80, 78, 71, 13, 10]);

    const dump = await repo.exportEverything(sb);
    expect((dump.entries as unknown[]).length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('a second user cannot read the first user\'s data', async () => {
    const sb = createClient(url!, key!, { auth: { persistSession: false } });
    await sb.auth.signUp({ email: `it2-${Date.now()}@folio.test`, password: 'correct-horse-battery' });
    expect(await repo.listAccounts(sb)).toHaveLength(0);
    expect((await repo.listEntriesPage(sb, {}, 0))).toHaveLength(0);
  });
});
