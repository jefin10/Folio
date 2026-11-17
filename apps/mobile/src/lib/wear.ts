/**
 * Phone side of the Wear OS bridge: pushes the snapshot to the watch and
 * turns expenses recorded on the watch into ledger entries. The watch's
 * entry id is used as the idempotency key, so a re-delivered entry can never
 * be booked twice.
 */
import { buildEntry, isISODate, parseAmount, today, type LedgerContext } from '@folio/core';
import { repo, toApiError, type Outbox, type Sb } from '@folio/api';
import { FolioWear } from '../../modules/folio-wear';
import type { Snapshot } from './snapshot';

export interface WatchEntry {
  id: string;
  amount: string; // rupees as typed/spoken, e.g. "250" or "1,250.50"
  description: string;
  accountId?: string | null;
  categoryId?: string | null;
  personId?: string | null;
  personShare?: string | null;
  occurredOn?: string;
  viaVoice?: boolean;
}

export const wearAvailable = () => FolioWear !== null;

export async function pushSnapshotToWatch(s: Snapshot): Promise<void> {
  if (!FolioWear) return;
  try {
    await FolioWear.syncSnapshot(JSON.stringify(s));
  } catch {
    // No watch paired / Play services missing — nothing to do.
  }
}

export async function drainWatchQueue(sb: Sb, ctx: LedgerContext, outbox: Outbox, fallbackCategoryId: string | null, onPosted?: () => void): Promise<number> {
  if (!FolioWear) return 0;
  const raw = await FolioWear.pendingEntries();
  let posted = 0;
  for (const json of raw) {
    let w: WatchEntry;
    try {
      w = JSON.parse(json) as WatchEntry;
    } catch {
      continue;
    }
    try {
      const amount = parseAmount(w.amount);
      const accounts = [...ctx.accounts.values()];
      // Fall back to cash (most watch spends are small cash payments), then any active asset.
      const accountId =
        w.accountId && ctx.accounts.has(w.accountId) ? w.accountId : (accounts.find((a) => a.status === 'active' && a.type === 'cash') ?? accounts.find((a) => a.status === 'active' && a.class === 'asset' && a.type !== 'debit_card'))?.id;
      const categoryId = w.categoryId && ctx.categories.has(w.categoryId) ? w.categoryId : fallbackCategoryId;
      if (!accountId || !categoryId) throw new Error('No account or category to book this to');
      const shares = w.personId && w.personShare ? [{ personId: w.personId, amount: parseAmount(w.personShare) }] : [];
      const entry = buildEntry(
        { kind: 'expense', accountId, categoryId, amount, shares, description: w.description || 'Watch entry', occurredOn: w.occurredOn && isISODate(w.occurredOn) ? w.occurredOn : today(), idempotencyKey: w.id, source: 'watch', notes: w.viaVoice ? 'Recorded by voice on the watch' : null },
        ctx,
      );
      try {
        await repo.postEntry(sb, entry);
      } catch (e) {
        const err = toApiError(e);
        if (!err.retryable) throw err;
        await outbox.enqueue({ kind: 'post', entry }, 'watch'); // phone now owns it
      }
      await FolioWear.ackEntry(w.id, true, null);
      posted++;
    } catch (e) {
      await FolioWear.ackEntry(w.id, false, e instanceof Error ? e.message : 'Rejected');
    }
  }
  if (posted) onPosted?.();
  return posted;
}
