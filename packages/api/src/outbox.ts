/**
 * Offline outbox. A user intent is turned into a fully-built Entry (with its
 * idempotency key) *before* it is queued, so replays are byte-identical and
 * the server's unique index on idempotency_key makes double-posting
 * impossible no matter how many times a flush is retried.
 */
import type { Entry, ISODate } from '@folio/core';
import { dedupeQueue, toJsonSafe } from '@folio/core';

export interface OutboxStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
}

export type OutboxOp =
  | { kind: 'post'; entry: Entry }
  | { kind: 'confirm'; ruleId: string; dueOn: ISODate; entry: Entry };

export interface OutboxItem {
  id: string; // idempotency key
  op: OutboxOp;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  origin: 'mobile' | 'watch' | 'widget' | 'web';
}

const KEY = 'folio.outbox.v1';

function revive(op: OutboxOp): OutboxOp {
  const e = op.entry as unknown as Record<string, unknown>;
  // Stored JSON uses camelCase domain shape with bigint strings; rebuild bigints.
  const entry: Entry = {
    ...(op.entry as Entry),
    amount: BigInt(e.amount as string),
    postings: (e.postings as Record<string, unknown>[]).map((p) => ({ ...(p as object), amount: BigInt(p.amount as string) })) as Entry['postings'],
  };
  return { ...op, entry };
}

export class Outbox {
  private items: OutboxItem[] = [];
  private loaded = false;
  private listeners = new Set<(items: OutboxItem[]) => void>();
  private flushing: Promise<void> | null = null;

  constructor(private storage: OutboxStorage) {}

  async load(): Promise<OutboxItem[]> {
    if (this.loaded) return this.items;
    const raw = await this.storage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as OutboxItem[];
        this.items = parsed.map((i) => ({ ...i, op: revive(i.op) }));
      } catch {
        this.items = [];
      }
    }
    this.loaded = true;
    return this.items;
  }

  private async persist() {
    await this.storage.setItem(KEY, JSON.stringify(toJsonSafe(this.items)));
    for (const l of this.listeners) l([...this.items]);
  }

  subscribe(fn: (items: OutboxItem[]) => void): () => void {
    this.listeners.add(fn);
    fn([...this.items]);
    return () => this.listeners.delete(fn);
  }

  get pending(): OutboxItem[] {
    return [...this.items];
  }

  async enqueue(op: OutboxOp, origin: OutboxItem['origin']): Promise<OutboxItem> {
    await this.load();
    const id = op.entry.idempotencyKey;
    const existing = this.items.find((i) => i.id === id);
    if (existing) return existing;
    const item: OutboxItem = { id, op, queuedAt: new Date().toISOString(), attempts: 0, origin };
    this.items = dedupeQueue([...this.items, item].map((i) => ({ ...i, idempotencyKey: i.id })), []).map(({ idempotencyKey: _k, ...rest }) => rest as OutboxItem);
    await this.persist();
    return item;
  }

  /**
   * Send everything queued. `send` must throw a retryable error to keep an
   * item; any other error drops it (the server rejected it permanently) and
   * is reported through onRejected.
   */
  flush(send: (op: OutboxOp) => Promise<void>, opts: { isRetryable: (e: unknown) => boolean; onRejected?: (item: OutboxItem, e: unknown) => void; onSent?: (item: OutboxItem) => void }): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await this.load();
      for (const item of [...this.items]) {
        try {
          await send(item.op);
          this.items = this.items.filter((i) => i.id !== item.id);
          opts.onSent?.(item);
        } catch (e) {
          if (opts.isRetryable(e)) {
            item.attempts += 1;
            item.lastError = e instanceof Error ? e.message : String(e);
            break; // still offline — keep order, try later
          }
          this.items = this.items.filter((i) => i.id !== item.id);
          opts.onRejected?.(item, e);
        }
      }
      await this.persist();
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
}
