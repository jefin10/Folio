/**
 * Duplicate protection, two layers:
 *  1. Idempotency keys — every client-created entry carries a UUID generated
 *     at the moment of user intent. Retries, offline replays and watch
 *     re-deliveries reuse it, and Postgres has a unique index on it, so a
 *     single tap can never produce two entries.
 *  2. Fuzzy duplicate detection — warns when a *new* intent looks like an
 *     existing entry (same amount, same account, close date, similar text),
 *     e.g. the same bill typed twice or an imported statement line.
 */
import type { ISODate } from './dates';
import { daysBetween } from './dates';
import type { Paise } from './money';
import type { Entry } from './types';

/** RFC 4122 v4 UUID using whatever secure RNG the platform offers. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const STOP = new Set(['the', 'a', 'an', 'to', 'for', 'of', 'at', 'on', 'in', 'and', 'upi', 'pos', 'payment', 'paid', 'txn', 'ref', 'via']);

export function normaliseDescription(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d{5,}$/.test(t));
}

export function similarity(a: string, b: string): number {
  const ta = new Set(normaliseDescription(a));
  const tb = new Set(normaliseDescription(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Stable fingerprint of what an entry *means*, stored for fast DB-side lookups. */
export function fingerprint(e: Pick<Entry, 'type' | 'amount' | 'occurredOn' | 'primaryAccountId' | 'description'>): string {
  const desc = normaliseDescription(e.description).slice(0, 4).join('-');
  return [e.type, e.amount.toString(), e.occurredOn, e.primaryAccountId ?? '-', desc].join('|');
}

export interface DuplicateCandidate {
  amount: Paise;
  occurredOn: ISODate;
  accountId: string | null;
  description: string;
  idempotencyKey?: string;
}

export interface DuplicateMatch {
  entryId: string;
  score: number;
  reason: string;
}

export function findDuplicates(candidate: DuplicateCandidate, existing: Pick<Entry, 'id' | 'amount' | 'occurredOn' | 'primaryAccountId' | 'description' | 'status' | 'idempotencyKey'>[], windowDays = 2): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const e of existing) {
    if (e.status === 'void') continue;
    if (candidate.idempotencyKey && e.idempotencyKey === candidate.idempotencyKey) {
      matches.push({ entryId: e.id!, score: 1, reason: 'Same submission' });
      continue;
    }
    if (e.amount !== candidate.amount) continue;
    const gap = Math.abs(daysBetween(candidate.occurredOn, e.occurredOn));
    if (gap > windowDays) continue;
    if (candidate.accountId && e.primaryAccountId && candidate.accountId !== e.primaryAccountId) continue;
    const sim = similarity(candidate.description, e.description);
    const score = 0.5 + (sim * 0.4) + (gap === 0 ? 0.1 : 0);
    if (sim >= 0.34 || (gap === 0 && candidate.accountId && candidate.accountId === e.primaryAccountId)) {
      matches.push({ entryId: e.id!, score: Math.min(0.99, score), reason: gap === 0 ? 'Same amount, same day' : `Same amount, ${gap} day${gap > 1 ? 's' : ''} apart` });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * In-memory guard for offline queues: drop queued items whose idempotency key
 * has already been acknowledged by the server.
 */
export function dedupeQueue<T extends { idempotencyKey: string }>(queue: T[], acknowledged: Iterable<string>): T[] {
  const ack = new Set(acknowledged);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of queue) {
    if (ack.has(item.idempotencyKey) || seen.has(item.idempotencyKey)) continue;
    seen.add(item.idempotencyKey);
    out.push(item);
  }
  return out;
}
