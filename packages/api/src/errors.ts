/** Normalised, user-presentable errors from Supabase / PostgREST / the ledger RPCs. */
export class FolioApiError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'unknown',
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'FolioApiError';
  }
}

interface PgLikeError {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
  status?: number;
  name?: string;
}

export function toApiError(raw: unknown): FolioApiError {
  if (raw instanceof FolioApiError) return raw;
  const e = (raw ?? {}) as PgLikeError;
  const msg = e.message ?? String(raw);
  // Network / fetch failures are retryable — the outbox keeps the intent.
  if (/fetch failed|network|Failed to fetch|NetworkError|timed out|ECONN|ENOTFOUND/i.test(msg) || e.name === 'AuthRetryableFetchError') {
    return new FolioApiError('You appear to be offline. Saved on this device — it will sync automatically.', 'offline', true);
  }
  if (e.code === '23503') return new FolioApiError('This is still used elsewhere.', 'foreign_key');
  if (e.code === '23505') return new FolioApiError('That already exists.', 'duplicate');
  if (e.code === '23514') {
    if (/no_pan/.test(msg)) return new FolioApiError('Folio never stores full card numbers, CVVs or OTPs. Remove them and try again.', 'sensitive_data');
    return new FolioApiError('Some values are out of range.', 'check_violation');
  }
  if (e.code === '42501') return new FolioApiError("You don't have access to that.", 'forbidden');
  if (e.code === '28000' || e.code === 'PGRST301' || e.status === 401) return new FolioApiError('Please sign in again.', 'not_authenticated');
  if (e.code === 'P0001') return new FolioApiError(msg, e.hint ?? 'ledger_rule');
  return new FolioApiError(msg || 'Something went wrong', e.code ?? 'unknown', (e.status ?? 0) >= 500);
}
