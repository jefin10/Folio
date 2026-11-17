/**
 * Data access for Folio. Every read is parsed through @folio/core's Zod
 * schemas into exact bigint domain objects; every write goes through either
 * an RLS-protected table or a validated RPC.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  entryToWire,
  mapAccount,
  mapAllocation,
  mapBalance,
  mapCategory,
  mapEntry,
  mapOccurrence,
  mapPerson,
  mapPersonBalance,
  mapProfile,
  mapRule,
  mapStatement,
  mapStatementLine,
  type Account,
  type AccountBalance,
  type Category,
  type DashboardPrefs,
  type Entry,
  type EntryType,
  type ISODate,
  type Paise,
  type Person,
  type PersonBalance,
  type Profile,
  type RecurringOccurrence,
  type RecurringRule,
  type SettlementAllocation,
  type Statement,
  type StatementLine,
} from '@folio/core';
import { FolioApiError, toApiError } from './errors';

export type Sb = SupabaseClient;

const ACCOUNT_SELECT = '*, card_details!card_details_account_id_fkey(*), loan_details!loan_details_account_id_fkey(*)';
const ENTRY_SELECT = '*, postings(*)';
const PAGE = 1000;

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}

async function uid(sb: Sb): Promise<string> {
  const { data } = await sb.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new FolioApiError('Please sign in again', 'not_authenticated');
  return id;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, map: (r: unknown) => T, cap = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const rows = check(await build(from, from + PAGE - 1)) ?? [];
    for (const r of rows) out.push(map(r));
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function getProfile(sb: Sb): Promise<Profile> {
  const id = await uid(sb);
  return mapProfile(check(await sb.from('profiles').select('*').eq('id', id).single()));
}

export async function updateProfile(sb: Sb, patch: Partial<{ displayName: string | null; dashboard: DashboardPrefs; onboarded: boolean; lockTimeoutSeconds: number; timezone: string }>): Promise<void> {
  const id = await uid(sb);
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.dashboard !== undefined) row.dashboard = patch.dashboard;
  if (patch.onboarded) row.onboarded_at = new Date().toISOString();
  if (patch.lockTimeoutSeconds !== undefined) row.lock_timeout_seconds = patch.lockTimeoutSeconds;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  check(await sb.from('profiles').update(row).eq('id', id));
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function listAccounts(sb: Sb): Promise<Account[]> {
  return check(await sb.from('accounts').select(ACCOUNT_SELECT).order('sort_order').order('created_at')).map(mapAccount);
}

export async function listBalances(sb: Sb): Promise<AccountBalance[]> {
  return check(await sb.from('account_balances').select('account_id, ledger_sum, balance, last_activity_on, posting_count')).map(mapBalance);
}

export interface AccountInput {
  id?: string;
  name: string;
  nickname?: string | null;
  type: Account['type'];
  customClass?: 'asset' | 'liability' | null;
  customTypeLabel?: string | null;
  institutionName?: string | null;
  currency?: string;
  last4?: string | null;
  color?: string | null;
  icon?: string | null;
  theme?: Account['theme'];
  artworkPath?: string | null;
  interestRateBps?: number | null;
  includeInNetWorth?: boolean;
  isLiquid?: boolean;
  notes?: string | null;
  linkedAccountId?: string | null;
  openedOn?: ISODate | null;
  card?: Partial<NonNullable<Account['card']>> | null;
  loan?: Partial<NonNullable<Account['loan']>> | null;
  /** Natural opening balance (money held / amount owed). Omit to leave unchanged. */
  opening?: { balance: Paise; on: ISODate } | null;
}

const big = (v: Paise | null | undefined) => (v === null || v === undefined ? null : v.toString());

export async function saveAccount(sb: Sb, input: AccountInput): Promise<string> {
  const account: Record<string, unknown> = {
    id: input.id ?? null,
    name: input.name,
    nickname: input.nickname ?? null,
    type: input.type,
    custom_class: input.customClass ?? null,
    custom_type_label: input.customTypeLabel ?? null,
    institution_name: input.institutionName ?? null,
    currency: input.currency ?? 'INR',
    last4: input.last4 ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    theme: input.theme ?? null,
    interest_rate_bps: input.interestRateBps ?? null,
    include_in_net_worth: input.includeInNetWorth ?? true,
    notes: input.notes ?? null,
    linked_account_id: input.linkedAccountId ?? null,
    opened_on: input.openedOn ?? null,
  };
  if (input.isLiquid !== undefined) account.is_liquid = input.isLiquid;
  if (input.artworkPath !== undefined) account.artwork_path = input.artworkPath;
  const card = input.card
    ? {
        network: input.card.network ?? null,
        variant: input.card.variant ?? null,
        credit_limit: big(input.card.creditLimit),
        statement_day: input.card.statementDay ?? null,
        due_day: input.card.dueDay ?? null,
        annual_fee: big(input.card.annualFee),
        lifetime_free: input.card.lifetimeFree ?? false,
        rewards_info: input.card.rewardsInfo ?? null,
        reward_rate_bps: input.card.rewardRateBps ?? null,
        min_due_bps: input.card.minDueBps ?? null,
      }
    : null;
  const loan = input.loan
    ? {
        loan_kind: input.loan.loanKind ?? 'other',
        lender: input.loan.lender ?? null,
        principal_amount: big(input.loan.principalAmount),
        interest_rate_bps: input.loan.interestRateBps ?? null,
        emi_amount: big(input.loan.emiAmount),
        tenure_months: input.loan.tenureMonths ?? null,
        emi_day: input.loan.emiDay ?? null,
        start_date: input.loan.startDate ?? null,
        emi_account_id: input.loan.emiAccountId ?? null,
      }
    : null;
  const opening = input.opening ? { balance: input.opening.balance.toString(), on: input.opening.on } : null;
  return check(await sb.rpc('save_account', { p_account: account, p_card: card, p_loan: loan, p_opening: opening })) as string;
}

export async function setAccountStatus(sb: Sb, id: string, status: Account['status']): Promise<void> {
  check(await sb.from('accounts').update({ status }).eq('id', id));
}

export async function patchAccount(sb: Sb, id: string, patch: Partial<{ include_in_net_worth: boolean; theme: Account['theme']; color: string | null; artwork_path: string | null; is_liquid: boolean }>): Promise<void> {
  check(await sb.from('accounts').update(patch).eq('id', id));
}

export async function reorderAccounts(sb: Sb, ids: string[]): Promise<void> {
  check(await sb.rpc('reorder_accounts', { p_ids: ids }));
}

export async function deleteAccount(sb: Sb, id: string): Promise<void> {
  const res = await sb.from('accounts').delete().eq('id', id);
  if (res.error) {
    const e = toApiError(res.error);
    if (e.code === 'foreign_key') throw new FolioApiError('This account has entries. Archive it instead to keep your history.', 'has_entries');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// People & categories
// ---------------------------------------------------------------------------
export async function listPeople(sb: Sb): Promise<Person[]> {
  return check(await sb.from('people').select('*').order('name')).map(mapPerson);
}

export async function listPersonBalances(sb: Sb): Promise<PersonBalance[]> {
  return check(await sb.from('person_balances').select('person_id, paid_on_behalf, reimbursed, outstanding, last_activity_on')).map(mapPersonBalance);
}

export async function savePerson(sb: Sb, p: Partial<Person> & { name: string }): Promise<string> {
  const row = { name: p.name.trim(), relation: p.relation ?? 'friend', color: p.color ?? null, emoji: p.emoji ?? null, phone: p.phone ?? null, notes: p.notes ?? null, archived: p.archived ?? false };
  if (p.id) {
    check(await sb.from('people').update(row).eq('id', p.id));
    return p.id;
  }
  return (check(await sb.from('people').insert(row).select('id').single()) as { id: string }).id;
}

export async function listCategories(sb: Sb): Promise<Category[]> {
  return check(await sb.from('categories').select('*').order('kind').order('sort_order').order('name')).map(mapCategory);
}

export async function saveCategory(sb: Sb, c: Partial<Category> & { name: string; kind: Category['kind'] }): Promise<string> {
  const row = { name: c.name.trim(), kind: c.kind, icon: c.icon ?? null, color: c.color ?? null, parent_id: c.parentId ?? null, archived: c.archived ?? false, sort_order: c.sortOrder ?? 100 };
  if (c.id) {
    check(await sb.from('categories').update(row).eq('id', c.id));
    return c.id;
  }
  return (check(await sb.from('categories').insert(row).select('id').single()) as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
export interface EntryFilter {
  accountId?: string;
  personId?: string;
  categoryId?: string;
  types?: EntryType[];
  from?: ISODate;
  to?: ISODate;
  search?: string;
  includeVoid?: boolean;
  recurringRuleId?: string;
}

// PostgREST builder generics are too deep for TS when chained dynamically;
// filters are applied through this narrow structural interface instead.
interface FilterBuilder {
  eq(column: string, value: unknown): FilterBuilder;
  gte(column: string, value: unknown): FilterBuilder;
  lte(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  ilike(column: string, pattern: string): FilterBuilder;
  order(column: string, opts?: { ascending?: boolean }): FilterBuilder;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

function applyFilter(q: unknown, f: EntryFilter): FilterBuilder {
  let query = q as FilterBuilder;
  if (!f.includeVoid) query = query.eq('status', 'posted');
  if (f.from) query = query.gte('occurred_on', f.from);
  if (f.to) query = query.lte('occurred_on', f.to);
  if (f.types?.length) query = query.in('type', f.types);
  if (f.search?.trim()) query = query.ilike('description', `%${f.search.trim().replace(/[%_]/g, '')}%`);
  if (f.recurringRuleId) query = query.eq('recurring_rule_id', f.recurringRuleId);
  if (f.accountId) query = query.eq('match.account_id', f.accountId);
  if (f.personId) query = query.eq('match.person_id', f.personId);
  if (f.categoryId) query = query.eq('match.category_id', f.categoryId);
  return query;
}

function selectFor(f: EntryFilter): string {
  // Filtering by a leg must not hide the entry's other legs: embed postings twice.
  return f.accountId || f.personId || f.categoryId ? `${ENTRY_SELECT}, match:postings!inner(account_id, person_id, category_id)` : ENTRY_SELECT;
}

export async function listEntriesPage(sb: Sb, f: EntryFilter, page: number, pageSize = 40): Promise<Entry[]> {
  const from = page * pageSize;
  const q = applyFilter(sb.from('entries').select(selectFor(f)), f)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  return (check(await q) ?? []).map(mapEntry);
}

/** All entries in a date range — for analytics and statements. */
export async function listEntriesInRange(sb: Sb, f: EntryFilter): Promise<Entry[]> {
  return fetchAll(
    (from, to) =>
      applyFilter(sb.from('entries').select(selectFor(f)), f)
        .order('occurred_on', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to),
    mapEntry,
  );
}

export async function getEntry(sb: Sb, id: string): Promise<Entry> {
  return mapEntry(check(await sb.from('entries').select(ENTRY_SELECT).eq('id', id).single()));
}

export async function getEntryRevisions(sb: Sb, id: string): Promise<{ revision: number; action: string; reason: string | null; createdAt: string; snapshot: unknown }[]> {
  const rows = check(await sb.from('entry_revisions').select('revision, action, reason, created_at, snapshot').eq('entry_id', id).order('revision', { ascending: false })) as {
    revision: number;
    action: string;
    reason: string | null;
    created_at: string;
    snapshot: unknown;
  }[];
  return rows.map((r) => ({ revision: r.revision, action: r.action, reason: r.reason, createdAt: r.created_at, snapshot: r.snapshot }));
}

export interface PostResult {
  id: string;
  created: boolean;
}

export async function postEntry(sb: Sb, entry: Entry): Promise<PostResult> {
  const wire = entryToWire(entry);
  return check(await sb.rpc('post_entry', { p_entry: wire.entry, p_postings: wire.postings })) as PostResult;
}

export async function updateEntry(sb: Sb, id: string, expectedVersion: number | undefined, entry: Entry, reason?: string): Promise<void> {
  const wire = entryToWire(entry);
  check(await sb.rpc('update_entry', { p_entry_id: id, p_expected_version: expectedVersion ?? null, p_entry: wire.entry, p_postings: wire.postings, p_reason: reason ?? null }));
}

export async function voidEntry(sb: Sb, id: string, reason?: string): Promise<void> {
  check(await sb.rpc('void_entry', { p_entry_id: id, p_reason: reason ?? null }));
}

export async function restoreEntry(sb: Sb, id: string): Promise<void> {
  check(await sb.rpc('restore_entry', { p_entry_id: id }));
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------
export async function listRules(sb: Sb): Promise<RecurringRule[]> {
  return check(await sb.from('recurring_rules').select('*').order('name')).map(mapRule);
}

export async function listOccurrences(sb: Sb, since?: ISODate): Promise<RecurringOccurrence[]> {
  let q = sb.from('recurring_occurrences').select('*');
  if (since) q = q.gte('due_on', since);
  return check(await q.order('due_on')).map(mapOccurrence);
}

export async function saveRule(sb: Sb, r: Omit<RecurringRule, 'id'> & { id?: string }): Promise<string> {
  const row = {
    name: r.name.trim(),
    kind: r.kind,
    amount: r.isVariable && r.amount === null ? null : big(r.amount),
    is_variable: r.isVariable,
    frequency: r.frequency,
    interval_days: r.frequency === 'custom_days' ? r.intervalDays : null,
    start_on: r.startOn,
    end_on: r.endOn,
    max_occurrences: r.maxOccurrences,
    day_of_month: r.dayOfMonth,
    source_account_id: r.sourceAccountId,
    target_account_id: r.targetAccountId,
    category_id: r.categoryId,
    person_id: r.personId,
    reminder_days_before: r.reminderDaysBefore,
    reminder_time: r.reminderTime,
    is_active: r.isActive,
    bank_autopay: r.bankAutopay,
    notes: r.notes,
  };
  if (r.id) {
    check(await sb.from('recurring_rules').update(row).eq('id', r.id));
    return r.id;
  }
  return (check(await sb.from('recurring_rules').insert(row).select('id').single()) as { id: string }).id;
}

export async function deleteRule(sb: Sb, id: string): Promise<void> {
  check(await sb.from('recurring_rules').delete().eq('id', id));
}

export async function confirmOccurrence(sb: Sb, ruleId: string, dueOn: ISODate, entry: Entry): Promise<PostResult> {
  const wire = entryToWire(entry);
  return check(await sb.rpc('confirm_occurrence', { p_rule_id: ruleId, p_due_on: dueOn, p_entry: wire.entry, p_postings: wire.postings })) as PostResult;
}

export async function skipOccurrence(sb: Sb, ruleId: string, dueOn: ISODate): Promise<void> {
  check(await sb.rpc('skip_occurrence', { p_rule_id: ruleId, p_due_on: dueOn }));
}

export async function unskipOccurrence(sb: Sb, ruleId: string, dueOn: ISODate): Promise<void> {
  check(await sb.rpc('unskip_occurrence', { p_rule_id: ruleId, p_due_on: dueOn }));
}

// ---------------------------------------------------------------------------
// Reimbursement allocations
// ---------------------------------------------------------------------------
export async function listAllocations(sb: Sb): Promise<SettlementAllocation[]> {
  return check(await sb.from('settlement_allocations').select('settlement_entry_id, claim_entry_id, person_id, amount')).map(mapAllocation);
}

export async function setAllocations(sb: Sb, settlementEntryId: string, allocations: SettlementAllocation[]): Promise<void> {
  check(
    await sb.rpc('set_settlement_allocations', {
      p_settlement_entry_id: settlementEntryId,
      p_allocations: allocations.map((a) => ({ claim_entry_id: a.claimEntryId, person_id: a.personId, amount: a.amount.toString() })),
    }),
  );
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------
export async function listStatements(sb: Sb, accountId?: string): Promise<Statement[]> {
  let q = sb.from('statements').select('*');
  if (accountId) q = q.eq('account_id', accountId);
  return check(await q.order('statement_date', { ascending: false })).map(mapStatement);
}

export async function saveStatement(sb: Sb, s: Omit<Statement, 'id' | 'reconciledAt' | 'status'> & { id?: string; status?: Statement['status'] }): Promise<string> {
  const row = {
    account_id: s.accountId,
    period_start: s.periodStart,
    period_end: s.periodEnd,
    statement_date: s.statementDate,
    due_date: s.dueDate,
    statement_balance: s.statementBalance.toString(),
    minimum_due: big(s.minimumDue),
    file_path: s.filePath,
    notes: s.notes,
    status: s.status ?? 'open',
  };
  if (s.id) {
    check(await sb.from('statements').update(row).eq('id', s.id));
    return s.id;
  }
  return (check(await sb.from('statements').insert(row).select('id').single()) as { id: string }).id;
}

export async function markStatement(sb: Sb, id: string, status: Statement['status']): Promise<void> {
  check(await sb.from('statements').update({ status, reconciled_at: status === 'reconciled' ? new Date().toISOString() : null }).eq('id', id));
}

export async function deleteStatement(sb: Sb, id: string): Promise<void> {
  check(await sb.from('statements').delete().eq('id', id));
}

export async function listStatementLines(sb: Sb, statementId: string): Promise<StatementLine[]> {
  return check(await sb.from('statement_lines').select('*').eq('statement_id', statementId).order('occurred_on')).map(mapStatementLine);
}

export async function replaceStatementLines(sb: Sb, statementId: string, lines: StatementLine[]): Promise<void> {
  check(await sb.from('statement_lines').delete().eq('statement_id', statementId));
  if (lines.length === 0) return;
  for (let i = 0; i < lines.length; i += 500) {
    const chunk = lines.slice(i, i + 500).map((l) => ({
      statement_id: statementId,
      occurred_on: l.occurredOn,
      description: l.description.slice(0, 200),
      amount: l.amount.toString(),
      matched_entry_id: l.matchedEntryId ?? null,
    }));
    check(await sb.from('statement_lines').insert(chunk));
  }
}

export async function matchStatementLine(sb: Sb, lineId: string, entryId: string | null): Promise<void> {
  check(await sb.from('statement_lines').update({ matched_entry_id: entryId }).eq('id', lineId));
}

// ---------------------------------------------------------------------------
// Files (stored in Postgres, see migration 0005). References look like
// "file:<uuid>" and are kept in accounts.artwork_path, institutions.logo_path
// and statements.file_path.
// ---------------------------------------------------------------------------
const FILE_LIMITS: Record<'artwork' | 'statements' | 'receipts' | 'logos', number> = {
  artwork: 2_500_000,
  logos: 512_000,
  receipts: 3_000_000,
  statements: 6_000_000,
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Platform-independent base64 (no btoa/Buffer, works in browsers and Hermes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1] ?? 'A') << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length && clean[i + 2]) out[o++] = (n >> 8) & 255;
    if (o < out.length && clean[i + 3]) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

export async function uploadFile(sb: Sb, folder: 'artwork' | 'statements' | 'receipts' | 'logos', fileName: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const bytes = body instanceof Uint8Array ? body : body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(await (body as Blob).arrayBuffer());
  const limit = FILE_LIMITS[folder];
  if (bytes.byteLength > limit) throw new FolioApiError(`That file is too large — keep it under ${Math.round(limit / 100_000) / 10} MB`, 'file_too_large');
  const name = fileName.replace(/[^\w.\- ]+/g, '-').slice(-120) || 'file';
  const row = check(await sb.from('files').insert({ folder, name, mime: contentType, size_bytes: bytes.byteLength, data: bytesToBase64(bytes) }).select('id').single()) as { id: string };
  return `file:${row.id}`;
}

export async function getFile(sb: Sb, ref: string): Promise<{ mime: string; base64: string; name: string }> {
  const id = ref.startsWith('file:') ? ref.slice(5) : ref;
  const r = check(await sb.from('files').select('mime, data, name').eq('id', id).single()) as { mime: string; data: string; name: string };
  return { mime: r.mime, base64: r.data, name: r.name };
}

const urlCache = new Map<string, string>();

/** A displayable URL (data: URI) for a stored file; cached for the session. */
export async function signedUrl(sb: Sb, ref: string, _seconds = 0): Promise<string> {
  const hit = urlCache.get(ref);
  if (hit) return hit;
  const f = await getFile(sb, ref);
  const url = `data:${f.mime};base64,${f.base64}`;
  if (urlCache.size > 60) urlCache.clear();
  urlCache.set(ref, url);
  return url;
}

export async function removeFile(sb: Sb, ref: string): Promise<void> {
  urlCache.delete(ref);
  check(await sb.from('files').delete().eq('id', ref.startsWith('file:') ? ref.slice(5) : ref));
}

export async function addAttachment(sb: Sb, a: { entryId?: string; accountId?: string; statementId?: string; path: string; mime: string; size: number }): Promise<void> {
  check(await sb.from('attachments').insert({ entry_id: a.entryId ?? null, account_id: a.accountId ?? null, statement_id: a.statementId ?? null, path: a.path, mime: a.mime, size_bytes: a.size }));
}

export async function listAttachments(sb: Sb, entryId: string): Promise<{ id: string; path: string; mime: string | null }[]> {
  return check(await sb.from('attachments').select('id, path, mime').eq('entry_id', entryId)) as { id: string; path: string; mime: string | null }[];
}

// ---------------------------------------------------------------------------
// Audit & export
// ---------------------------------------------------------------------------
export async function listAudit(sb: Sb, limit = 100): Promise<{ id: number; table: string; recordId: string; action: string; at: string }[]> {
  const rows = check(await sb.from('audit_log').select('id, table_name, record_id, action, at').order('at', { ascending: false }).limit(limit)) as {
    id: number;
    table_name: string;
    record_id: string;
    action: string;
    at: string;
  }[];
  return rows.map((r) => ({ id: r.id, table: r.table_name, recordId: r.record_id, action: r.action, at: r.at }));
}

/** Everything the user owns, as plain JSON (bigints as strings). */
export async function exportEverything(sb: Sb): Promise<Record<string, unknown[]>> {
  const tables = ['profiles', 'institutions', 'accounts', 'card_details', 'loan_details', 'people', 'categories', 'entries', 'postings', 'entry_revisions', 'recurring_rules', 'recurring_occurrences', 'settlement_allocations', 'statements', 'statement_lines', 'attachments', 'files'];
  const out: Record<string, unknown[]> = { exported_at: [new Date().toISOString()], format: ['folio-export-v1'] };
  for (const t of tables) {
    out[t] = await fetchAll((from, to) => sb.from(t).select('*').range(from, to), (r) => r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Institutions (user-owned; logo images are uploaded by the user)
// ---------------------------------------------------------------------------
export interface Institution {
  id: string;
  name: string;
  color: string | null;
  logoPath: string | null;
}

export async function listInstitutions(sb: Sb): Promise<Institution[]> {
  const rows = check(await sb.from('institutions').select('id, name, color, logo_path').order('name')) as { id: string; name: string; color: string | null; logo_path: string | null }[];
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, logoPath: r.logo_path }));
}

/** Create or update an institution by name; returns its id. */
export async function saveInstitution(sb: Sb, i: { id?: string; name: string; color?: string | null; logoPath?: string | null }): Promise<string> {
  const row: Record<string, unknown> = { name: i.name.trim(), color: i.color ?? null };
  if (i.logoPath !== undefined) row.logo_path = i.logoPath;
  if (i.id) {
    check(await sb.from('institutions').update(row).eq('id', i.id));
    return i.id;
  }
  const existing = check(await sb.from('institutions').select('id').eq('name', row.name as string).maybeSingle()) as { id: string } | null;
  if (existing) {
    check(await sb.from('institutions').update(row).eq('id', existing.id));
    return existing.id;
  }
  return (check(await sb.from('institutions').insert(row).select('id').single()) as { id: string }).id;
}

export async function linkInstitution(sb: Sb, accountId: string, institutionId: string | null): Promise<void> {
  check(await sb.from('accounts').update({ institution_id: institutionId }).eq('id', accountId));
}
