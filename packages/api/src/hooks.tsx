/**
 * React bindings shared by the web app and the Android app. Business rules
 * live in @folio/core; these hooks fetch, derive and mutate.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  buildEntry,
  computePosition,
  makeContext,
  newIdempotencyKey,
  normaliseDashboard,
  today,
  upcomingObligations,
  type Account,
  type AccountBalance,
  type Category,
  type DashboardPrefs,
  type DueItem,
  type Entry,
  type EntryIntent,
  type EntrySource,
  type FinancialPosition,
  type ISODate,
  type LedgerContext,
  type Person,
  type PersonBalance,
  type RecurringRule,
  type SettlementAllocation,
  type Statement,
} from '@folio/core';
import { FolioApiError, toApiError } from './errors';
import { qk, LEDGER_KEYS } from './keys';
import type { Outbox, OutboxItem } from './outbox';
import * as repo from './repo';
import type { AccountInput, EntryFilter, Sb } from './repo';

interface FolioContextValue {
  sb: Sb;
  outbox?: Outbox;
  source: EntrySource;
  timezone: string;
}

const FolioContext = createContext<FolioContextValue | null>(null);

export function FolioProvider({ client, outbox, source, timezone = 'Asia/Kolkata', children }: { client: Sb; outbox?: Outbox; source: EntrySource; timezone?: string; children: ReactNode }) {
  const value = useMemo(() => ({ sb: client, outbox, source, timezone }), [client, outbox, source, timezone]);
  return <FolioContext.Provider value={value}>{children}</FolioContext.Provider>;
}

export function useFolio(): FolioContextValue {
  const ctx = useContext(FolioContext);
  if (!ctx) throw new Error('useFolio must be used inside <FolioProvider>');
  return ctx;
}

export function useToday(): ISODate {
  const { timezone } = useFolio();
  return today(timezone);
}

export function invalidateLedger(qc: QueryClient) {
  for (const key of LEDGER_KEYS) void qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export const useProfile = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.profile(), queryFn: () => repo.getProfile(sb) });
};

export function useDashboardPrefs(): { prefs: DashboardPrefs; save: (p: DashboardPrefs) => Promise<void>; isLoading: boolean } {
  const profile = useProfile();
  const { sb } = useFolio();
  const qc = useQueryClient();
  const prefs = useMemo(() => normaliseDashboard(profile.data?.dashboard), [profile.data?.dashboard]);
  const save = useCallback(
    async (p: DashboardPrefs) => {
      qc.setQueryData(qk.profile(), (old: Awaited<ReturnType<typeof repo.getProfile>> | undefined) => (old ? { ...old, dashboard: p } : old));
      await repo.updateProfile(sb, { dashboard: p });
      void qc.invalidateQueries({ queryKey: qk.profile() });
    },
    [qc, sb],
  );
  return { prefs, save, isLoading: profile.isLoading };
}

export const useAccounts = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.accounts(), queryFn: () => repo.listAccounts(sb) });
};

export const useBalances = () => {
  const { sb } = useFolio();
  return useQuery({
    queryKey: qk.balances(),
    queryFn: async () => new Map((await repo.listBalances(sb)).map((b) => [b.accountId, b] as const)),
  });
};

export const usePeople = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.people(), queryFn: () => repo.listPeople(sb) });
};

export const usePersonBalances = () => {
  const { sb } = useFolio();
  return useQuery({
    queryKey: qk.personBalances(),
    queryFn: async () => new Map((await repo.listPersonBalances(sb)).map((b) => [b.personId, b] as const)),
  });
};

export const useCategories = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.categories(), queryFn: () => repo.listCategories(sb), staleTime: 5 * 60_000 });
};

export const useRules = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.rules(), queryFn: () => repo.listRules(sb) });
};

export const useOccurrences = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.occurrences(), queryFn: () => repo.listOccurrences(sb) });
};

export const useAllocations = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.allocations(), queryFn: () => repo.listAllocations(sb) });
};

export const useStatements = (accountId?: string) => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.statements(accountId), queryFn: () => repo.listStatements(sb, accountId) });
};

export const useStatementLines = (statementId: string | null) => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.statementLines(statementId ?? '-'), queryFn: () => repo.listStatementLines(sb, statementId!), enabled: !!statementId });
};

export const useEntry = (id: string | null) => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.entry(id ?? '-'), queryFn: () => repo.getEntry(sb, id!), enabled: !!id });
};

export const useEntryRevisions = (id: string | null) => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.revisions(id ?? '-'), queryFn: () => repo.getEntryRevisions(sb, id!), enabled: !!id });
};

export const useInstitutions = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.institutions(), queryFn: () => repo.listInstitutions(sb), staleTime: 5 * 60_000 });
};

/** Signed URLs for uploaded institution logos, keyed by institution id. */
export function useInstitutionLogos(): Map<string, string> {
  const { sb } = useFolio();
  const inst = useInstitutions();
  const withLogo = (inst.data ?? []).filter((i) => i.logoPath);
  const urls = useQuery({
    queryKey: ['folio', 'institution-logos', withLogo.map((i) => i.logoPath).join('|')],
    queryFn: async () => new Map(await Promise.all(withLogo.map(async (i) => [i.id, await repo.signedUrl(sb, i.logoPath!, 6 * 3600)] as const))),
    enabled: withLogo.length > 0,
    staleTime: 5 * 3600_000,
  });
  return urls.data ?? new Map();
}

export function useSaveInstitution() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: Parameters<typeof repo.saveInstitution>[1]) => repo.saveInstitution(sb, i),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.institutions() });
      void qc.invalidateQueries({ queryKey: ['folio', 'institution-logos'] });
    },
  });
}

export const useAudit = () => {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.audit(), queryFn: () => repo.listAudit(sb) });
};

/** Paged ledger list (newest first). */
export function useEntries(filter: EntryFilter, pageSize = 40) {
  const { sb } = useFolio();
  return useInfiniteQuery({
    queryKey: qk.entries(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => repo.listEntriesPage(sb, filter, pageParam, pageSize),
    getNextPageParam: (last, all) => (last.length < pageSize ? undefined : all.length),
  });
}

/** Every entry in a range (analytics, statements, exports). */
export function useEntriesInRange(filter: EntryFilter, enabled = true) {
  const { sb } = useFolio();
  return useQuery({ queryKey: qk.entriesRange(filter), queryFn: () => repo.listEntriesInRange(sb, filter), enabled });
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------
export function useLedgerContext(): { ctx: LedgerContext | null; accounts: Account[]; categories: Category[]; people: Person[] } {
  const accounts = useAccounts();
  const categories = useCategories();
  const people = usePeople();
  return useMemo(() => {
    const a = accounts.data ?? [];
    const c = categories.data ?? [];
    const p = people.data ?? [];
    return { ctx: accounts.data && categories.data ? makeContext(a, c, p.map((x) => x.id)) : null, accounts: a, categories: c, people: p };
  }, [accounts.data, categories.data, people.data]);
}

export function useObligations(horizonDays = 30): { items: DueItem[]; rules: RecurringRule[]; isLoading: boolean } {
  const rules = useRules();
  const occ = useOccurrences();
  const t = useToday();
  const items = useMemo(() => upcomingObligations(rules.data ?? [], occ.data ?? [], t, horizonDays), [rules.data, occ.data, t, horizonDays]);
  return { items, rules: rules.data ?? [], isLoading: rules.isLoading || occ.isLoading };
}

export interface PositionState {
  position: FinancialPosition | null;
  accounts: Account[];
  balances: Map<string, AccountBalance>;
  personBalances: Map<string, PersonBalance>;
  isLoading: boolean;
  error: unknown;
}

export function usePosition(horizonDays = 30): PositionState {
  const accounts = useAccounts();
  const balances = useBalances();
  const people = usePersonBalances();
  const { items } = useObligations(horizonDays);
  return useMemo(() => {
    const ready = accounts.data && balances.data && people.data;
    return {
      position: ready ? computePosition({ accounts: accounts.data!, balances: balances.data!, personBalances: people.data!, upcoming: items, horizonDays }) : null,
      accounts: accounts.data ?? [],
      balances: balances.data ?? new Map(),
      personBalances: people.data ?? new Map(),
      isLoading: accounts.isLoading || balances.isLoading || people.isLoading,
      error: accounts.error ?? balances.error ?? people.error,
    };
  }, [accounts.data, balances.data, people.data, items, horizonDays, accounts.isLoading, balances.isLoading, people.isLoading, accounts.error, balances.error, people.error]);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
type IntentInput = EntryIntent extends infer I ? (I extends EntryIntent ? Omit<I, 'idempotencyKey' | 'source'> & { idempotencyKey?: string } : never) : never;

export interface PostOutcome {
  entry: Entry;
  id: string | null;
  created: boolean;
  queued: boolean;
}

/**
 * Record a financial event. The entry (and its idempotency key) is built once
 * from the intent; if the network fails it goes to the outbox unchanged, so
 * the eventual retry can never create a duplicate.
 */
export function usePostIntent() {
  const { sb, outbox, source } = useFolio();
  const { ctx } = useLedgerContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: IntentInput & { recurring?: { ruleId: string; dueOn: ISODate } }): Promise<PostOutcome> => {
      if (!ctx) throw new FolioApiError('Still loading your accounts — try again in a moment', 'not_ready');
      const { recurring, ...intent } = input;
      const entry = buildEntry({ ...(intent as EntryIntent), idempotencyKey: intent.idempotencyKey ?? newIdempotencyKey(), source }, ctx);
      if (recurring) {
        entry.recurringRuleId = recurring.ruleId;
        entry.recurringDueOn = recurring.dueOn;
      }
      try {
        const res = recurring ? await repo.confirmOccurrence(sb, recurring.ruleId, recurring.dueOn, entry) : await repo.postEntry(sb, entry);
        return { entry, id: res.id, created: res.created, queued: false };
      } catch (e) {
        const err = toApiError(e);
        if (err.retryable && outbox) {
          await outbox.enqueue(recurring ? { kind: 'confirm', ruleId: recurring.ruleId, dueOn: recurring.dueOn, entry } : { kind: 'post', entry }, source === 'web' ? 'web' : 'mobile');
          return { entry, id: null, created: false, queued: true };
        }
        throw err;
      }
    },
    onSettled: () => invalidateLedger(qc),
  });
}

/** Post an already-built entry (used for the watch bridge and imports). */
export function usePostBuiltEntry() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: Entry) => repo.postEntry(sb, entry),
    onSettled: () => invalidateLedger(qc),
  });
}

export function useUpdateEntry() {
  const { sb } = useFolio();
  const { ctx } = useLedgerContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ original, intent, reason }: { original: Entry; intent: IntentInput; reason?: string }) => {
      if (!ctx) throw new FolioApiError('Still loading', 'not_ready');
      const rebuilt = buildEntry({ ...(intent as EntryIntent), idempotencyKey: original.idempotencyKey }, ctx);
      rebuilt.relatedEntryId = rebuilt.relatedEntryId ?? original.relatedEntryId;
      await repo.updateEntry(sb, original.id!, original.version, rebuilt, reason);
    },
    onSettled: () => invalidateLedger(qc),
  });
}

export function useVoidEntry() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => repo.voidEntry(sb, id, reason), onSettled: () => invalidateLedger(qc) });
}

export function useRestoreEntry() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => repo.restoreEntry(sb, id), onSettled: () => invalidateLedger(qc) });
}

export function useSaveAccount() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountInput) => repo.saveAccount(sb, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      invalidateLedger(qc);
    },
  });
}

export function useAccountStatus() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Account['status'] }) => repo.setAccountStatus(sb, id, status),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.accounts() }),
  });
}

export function usePatchAccount() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof repo.patchAccount>[2] }) => repo.patchAccount(sb, id, patch),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.accounts() }),
  });
}

export function useDeleteAccount() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => repo.deleteAccount(sb, id), onSettled: () => void qc.invalidateQueries({ queryKey: qk.accounts() }) });
}

export function useReorderAccounts() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => repo.reorderAccounts(sb, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.accounts() });
      const prev = qc.getQueryData<Account[]>(qk.accounts());
      if (prev) {
        const order = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData<Account[]>(
          qk.accounts(),
          prev.map((a) => (order.has(a.id) ? { ...a, sortOrder: order.get(a.id)! } : a)).sort((a, b) => a.sortOrder - b.sortOrder),
        );
      }
      return { prev };
    },
    onError: (_e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.accounts(), c.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.accounts() }),
  });
}

export function useSavePerson() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Person> & { name: string }) => repo.savePerson(sb, p),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.people() });
      void qc.invalidateQueries({ queryKey: qk.personBalances() });
    },
  });
}

export function useSaveCategory() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Partial<Category> & { name: string; kind: Category['kind'] }) => repo.saveCategory(sb, c),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.categories() }),
  });
}

export function useSaveRule() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Parameters<typeof repo.saveRule>[1]) => repo.saveRule(sb, r),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.rules() }),
  });
}

export function useDeleteRule() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => repo.deleteRule(sb, id), onSettled: () => void qc.invalidateQueries({ queryKey: qk.rules() }) });
}

export function useSkipOccurrence() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, dueOn, undo }: { ruleId: string; dueOn: ISODate; undo?: boolean }) => (undo ? repo.unskipOccurrence(sb, ruleId, dueOn) : repo.skipOccurrence(sb, ruleId, dueOn)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.occurrences() }),
  });
}

export function useSetAllocations() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ settlementEntryId, allocations }: { settlementEntryId: string; allocations: SettlementAllocation[] }) => repo.setAllocations(sb, settlementEntryId, allocations),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.allocations() }),
  });
}

export function useSaveStatement() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Parameters<typeof repo.saveStatement>[1]) => repo.saveStatement(sb, s),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['folio', 'statements'] }),
  });
}

export function useMarkStatement() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Statement['status'] }) => repo.markStatement(sb, id, status),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['folio', 'statements'] }),
  });
}

export function useUpdateProfile() {
  const { sb } = useFolio();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof repo.updateProfile>[1]) => repo.updateProfile(sb, patch),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.profile() }),
  });
}

// ---------------------------------------------------------------------------
// Realtime + outbox
// ---------------------------------------------------------------------------
/**
 * Keep every open device current without a realtime server: refresh what the
 * screen shows every `intervalMs` while the app is in the foreground. (Focus
 * and reconnect refetches come from TanStack Query's focus/online managers.)
 * A single user's ledger makes this a handful of small requests.
 */
export function useLiveRefresh(enabled: boolean, isForeground: () => boolean, intervalMs = 20_000) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (!isForeground()) return;
      invalidateLedger(qc);
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      void qc.invalidateQueries({ queryKey: qk.rules() });
      void qc.invalidateQueries({ queryKey: qk.people() });
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, isForeground, intervalMs, qc]);
}

/** Flush the offline outbox; call on app start, reconnect and foreground. */
export function useOutboxFlusher(onRejected?: (item: OutboxItem, e: unknown) => void) {
  const { sb, outbox } = useFolio();
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!outbox) return;
    await outbox.flush(
      async (op) => {
        if (op.kind === 'post') await repo.postEntry(sb, op.entry);
        else await repo.confirmOccurrence(sb, op.ruleId, op.dueOn, op.entry);
      },
      {
        isRetryable: (e) => toApiError(e).retryable,
        onRejected,
        onSent: () => invalidateLedger(qc),
      },
    );
  }, [sb, outbox, qc, onRejected]);
}
