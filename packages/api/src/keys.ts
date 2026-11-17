import type { EntryFilter } from './repo';

export const qk = {
  all: ['folio'] as const,
  profile: () => ['folio', 'profile'] as const,
  accounts: () => ['folio', 'accounts'] as const,
  balances: () => ['folio', 'balances'] as const,
  people: () => ['folio', 'people'] as const,
  personBalances: () => ['folio', 'person-balances'] as const,
  categories: () => ['folio', 'categories'] as const,
  entries: (f: EntryFilter) => ['folio', 'entries', f] as const,
  entriesRange: (f: EntryFilter) => ['folio', 'entries-range', f] as const,
  entry: (id: string) => ['folio', 'entry', id] as const,
  revisions: (id: string) => ['folio', 'revisions', id] as const,
  rules: () => ['folio', 'rules'] as const,
  occurrences: () => ['folio', 'occurrences'] as const,
  allocations: () => ['folio', 'allocations'] as const,
  statements: (accountId?: string) => ['folio', 'statements', accountId ?? 'all'] as const,
  statementLines: (id: string) => ['folio', 'statement-lines', id] as const,
  audit: () => ['folio', 'audit'] as const,
  institutions: () => ['folio', 'institutions'] as const,
};

/** Every query whose result depends on the ledger. */
export const LEDGER_KEYS = [['folio', 'balances'], ['folio', 'person-balances'], ['folio', 'entries'], ['folio', 'entries-range'], ['folio', 'entry'], ['folio', 'occurrences'], ['folio', 'allocations'], ['folio', 'revisions'], ['folio', 'audit']] as const;
