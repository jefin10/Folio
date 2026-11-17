import { describe, expect, it } from 'vitest';
import { buildEntry, makeContext, type Account, type Category } from '@folio/core';
import { FolioApiError, toApiError } from '../src/errors';
import { Outbox, type OutboxOp } from '../src/outbox';

const acct = { id: 'a1', name: 'Bank', type: 'savings', class: 'asset', status: 'active', linkedAccountId: null } as unknown as Account;
const cat = { id: 'c1', kind: 'expense', name: 'Food', systemKey: null } as unknown as Category;
const ctx = makeContext([acct], [cat]);
const entry = (key: string) => buildEntry({ kind: 'expense', accountId: 'a1', categoryId: 'c1', amount: 250_00n, occurredOn: '2026-11-17', idempotencyKey: key }, ctx);

function memory() {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), store };
}

describe('offline outbox', () => {
  it('persists bigint entries and survives a restart', async () => {
    const storage = memory();
    const box = new Outbox(storage);
    await box.enqueue({ kind: 'post', entry: entry('idem-key-0001') }, 'mobile');
    const reopened = new Outbox(storage);
    const items = await reopened.load();
    expect(items).toHaveLength(1);
    expect(items[0]!.op.entry.amount).toBe(250_00n);
    expect(items[0]!.op.entry.postings[0]!.amount).toBe(-250_00n);
  });

  it('never queues the same submission twice', async () => {
    const box = new Outbox(memory());
    const e = entry('idem-key-0002');
    await box.enqueue({ kind: 'post', entry: e }, 'watch');
    await box.enqueue({ kind: 'post', entry: e }, 'watch');
    expect(box.pending).toHaveLength(1);
  });

  it('keeps items while offline, drops them once accepted, reports permanent rejections', async () => {
    const box = new Outbox(memory());
    await box.enqueue({ kind: 'post', entry: entry('idem-key-0003') }, 'mobile');
    await box.enqueue({ kind: 'post', entry: entry('idem-key-0004') }, 'mobile');
    const offline = async () => {
      throw new FolioApiError('offline', 'offline', true);
    };
    await box.flush(offline, { isRetryable: (e) => toApiError(e).retryable });
    expect(box.pending).toHaveLength(2);
    expect(box.pending[0]!.attempts).toBe(1);

    const sent: string[] = [];
    const rejected: string[] = [];
    await box.flush(
      async (op: OutboxOp) => {
        if (op.entry.idempotencyKey === 'idem-key-0004') throw new FolioApiError('Unknown account', 'unknown_account');
        sent.push(op.entry.idempotencyKey);
      },
      { isRetryable: (e) => toApiError(e).retryable, onRejected: (i) => rejected.push(i.id) },
    );
    expect(sent).toEqual(['idem-key-0003']);
    expect(rejected).toEqual(['idem-key-0004']);
    expect(box.pending).toHaveLength(0);
  });

  it('classifies network failures as retryable and ledger rules as permanent', () => {
    expect(toApiError(new TypeError('Failed to fetch')).retryable).toBe(true);
    expect(toApiError({ code: 'P0001', message: 'Entry does not balance', hint: 'unbalanced' }).code).toBe('unbalanced');
    expect(toApiError({ code: 'P0001', message: 'x' }).retryable).toBe(false);
    expect(toApiError({ code: '23514', message: 'violates check constraint "entries_no_pan"' }).code).toBe('sensitive_data');
  });
});

import { base64ToBytes, bytesToBase64 } from '../src/repo';

describe('file encoding (no btoa/Buffer)', () => {
  it('round-trips every length and matches the standard alphabet', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
    expect(bytesToBase64(new TextEncoder().encode('Folio'))).toBe('Rm9saW8=');
  });
});
