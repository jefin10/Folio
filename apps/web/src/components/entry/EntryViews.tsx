'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { breakdown, displayName, ENTRY_TYPE_LABEL, formatDate, formatMoney, relativeDay, type Account, type Category, type Entry, type Person } from '@folio/core';
import { useEntry, useEntryRevisions, useLedgerContext, useRestoreEntry, useToday, useVoidEntry } from '@folio/api';
import { cx } from '@/lib/cx';
import { useUi } from '@/lib/store';
import { Icon } from '../ui/Icon';
import { Badge, EmptyState, GhostButton, Money, PopButton, Sheet, Skeleton, TextInput } from '../ui/primitives';

const TYPE_ICON: Record<string, string> = {
  income: 'arrowDown',
  expense: 'arrowUp',
  card_purchase: 'card',
  transfer: 'swap',
  card_repayment: 'check',
  cash_withdrawal: 'cash',
  cash_deposit: 'cash',
  loan_repayment: 'loan',
  loan_disbursement: 'loan',
  refund: 'arrowDown',
  reimbursement_received: 'users',
  reimbursement_paid: 'users',
  interest: 'percent',
  bank_charges: 'receipt',
  adjustment: 'edit',
  opening_balance: 'sparkle',
  bank_deposit: 'arrowDown',
  bank_withdrawal: 'arrowUp',
};

export interface Lookups {
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  people: Map<string, Person>;
}

export function useLookups(): Lookups {
  const { accounts, categories, people } = useLedgerContext();
  return { accounts: new Map(accounts.map((a) => [a.id, a])), categories: new Map(categories.map((c) => [c.id, c])), people: new Map(people.map((p) => [p.id, p])) };
}

/** Signed amount from the viewer's perspective (perspective account, or net-worth effect). */
function perspectiveAmount(e: Entry, lookups: Lookups, accountId?: string): bigint {
  if (accountId) {
    const a = lookups.accounts.get(accountId);
    const s = e.postings.filter((p) => p.target === 'account' && p.accountId === accountId).reduce((t, p) => t + p.amount, 0n);
    // For both classes, a debit (+) is "money in / owed less" from the user's view.
    return a ? s : s;
  }
  const kindOf = (id: string) => lookups.categories.get(id)?.kind;
  const b = breakdown(e, kindOf);
  if (e.type === 'income' || e.type === 'interest' || e.type === 'bank_deposit') return b.income !== 0n ? b.income : e.amount;
  if (e.type === 'refund' || e.type === 'reimbursement_received') return e.amount;
  if (['transfer', 'card_repayment', 'cash_withdrawal', 'cash_deposit', 'loan_disbursement', 'opening_balance', 'adjustment'].includes(e.type)) return 0n;
  return -e.amount;
}

export function EntryRow({ entry, lookups, accountId, onClick }: { entry: Entry; lookups: Lookups; accountId?: string; onClick?: () => void }) {
  const t = useToday();
  const cat = entry.categoryId ? lookups.categories.get(entry.categoryId) : null;
  const acc = entry.instrumentId ? lookups.accounts.get(entry.instrumentId) : entry.primaryAccountId ? lookups.accounts.get(entry.primaryAccountId) : null;
  const signed = perspectiveAmount(entry, lookups, accountId);
  const kindOf = (id: string) => lookups.categories.get(id)?.kind;
  const b = breakdown(entry, kindOf);
  const shared = entry.postings.filter((p) => p.target === 'person' && p.amount > 0n);
  const neutral = signed === 0n;
  return (
    <button onClick={onClick} className={cx('group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-ink-2', entry.status === 'void' && 'opacity-45')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-ink-2 transition-colors group-hover:bg-ink-3" style={cat?.color ? { color: cat.color } : undefined}>
        <Icon name={cat?.icon ?? TYPE_ICON[entry.type] ?? 'dots'} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[15px] font-semibold', entry.status === 'void' && 'line-through')}>{entry.description}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-mute">
          <span>{relativeDay(entry.occurredOn, t)}</span>
          <span className="text-faint">·</span>
          <span className="truncate">{cat?.name ?? ENTRY_TYPE_LABEL[entry.type]}</span>
          {acc && (
            <>
              <span className="text-faint">·</span>
              <span className="truncate">{displayName(acc)}</span>
            </>
          )}
          {entry.source === 'watch' && <Icon name="watch" size={12} />}
        </span>
      </span>
      <span className="text-right">
        <Money value={neutral ? entry.amount : signed} showPlus={!neutral && signed > 0n} className={cx('block text-[15px] font-bold', neutral ? 'text-chalk-dim' : signed > 0n ? 'text-mint' : 'text-chalk')} />
        {shared.length > 0 && b.reimbursable > 0n && <span className="tnum block text-[11px] font-semibold text-mint/80">{formatMoney(b.reimbursable, { decimals: 0 })} owed to you</span>}
        {neutral && <span className="block text-[11px] text-faint">{ENTRY_TYPE_LABEL[entry.type]}</span>}
      </span>
    </button>
  );
}

export function EntryList({ entries, lookups, accountId, loading, empty, onMore, hasMore }: { entries: Entry[]; lookups: Lookups; accountId?: string; loading?: boolean; empty?: React.ReactNode; onMore?: () => void; hasMore?: boolean }) {
  const openEntry = useUi((s) => s.openEntry);
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-1 py-2">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (!entries.length) return <>{empty ?? <EmptyState icon="receipt" title="Nothing here yet" body="Entries you record will show up here." />}</>;
  // Group by date for rhythm.
  const groups: { date: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last && last.date === e.occurredOn) last.items.push(e);
    else groups.push({ date: e.occurredOn, items: [e] });
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.date} className="mb-2">
          <div className="sticky top-0 z-[1] bg-gradient-to-b from-ink-1 via-ink-1/95 to-transparent px-3 pt-3 pb-1 text-[11px] font-bold tracking-[0.16em] text-faint uppercase">{formatDate(g.date)}</div>
          {g.items.map((e) => (
            <EntryRow key={e.id} entry={e} lookups={lookups} accountId={accountId} onClick={() => openEntry(e.id!)} />
          ))}
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center py-4">
          <GhostButton icon="chevronDown" onClick={onMore}>
            Load more
          </GhostButton>
        </div>
      )}
    </div>
  );
}

function legLabel(p: Entry['postings'][number], l: Lookups): string {
  if (p.target === 'account') {
    const a = l.accounts.get(p.accountId!);
    return a ? displayName(a) : 'Account';
  }
  if (p.target === 'category') return l.categories.get(p.categoryId!)?.name ?? 'Category';
  if (p.target === 'person') return l.people.get(p.personId!)?.name ?? 'Person';
  return 'Opening equity';
}

function legMeaning(p: Entry['postings'][number], l: Lookups): string {
  if (p.target === 'account') {
    const a = l.accounts.get(p.accountId!);
    if (a?.class === 'liability') return p.amount < 0n ? 'Owed more' : 'Owed less';
    return p.amount > 0n ? 'Money in' : 'Money out';
  }
  if (p.target === 'category') {
    const c = l.categories.get(p.categoryId!);
    if (c?.kind === 'income') return p.amount < 0n ? 'Income' : 'Income reversed';
    return p.amount > 0n ? 'Your expense' : 'Expense reduced';
  }
  if (p.target === 'person') return p.amount > 0n ? 'Owes you' : 'Settled / you owe';
  return 'Balance correction';
}

export function EntryDetailSheet() {
  const id = useUi((s) => s.entryId);
  const close = () => useUi.getState().openEntry(null);
  const openComposer = useUi((s) => s.openComposer);
  const entry = useEntry(id);
  const revisions = useEntryRevisions(id);
  const lookups = useLookups();
  const voidEntry = useVoidEntry();
  const restore = useRestoreEntry();
  const [reason, setReason] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);
  const e = entry.data;
  const editable = e && e.status === 'posted' && e.type !== 'opening_balance' && e.type !== 'adjustment';

  return (
    <Sheet open={!!id} onClose={close} eyebrow={e ? ENTRY_TYPE_LABEL[e.type] : 'Entry'} title={e?.description ?? 'Loading…'} width={540}>
      {!e ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <Money value={e.amount} decimals={2} className="font-display text-5xl font-semibold" />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">
              <span>{formatDate(e.occurredOn)}</span>
              {e.status === 'void' && <Badge tone="coral">Void</Badge>}
              {e.recurringRuleId && <Badge tone="sky">Recurring</Badge>}
              <Badge>{e.source}</Badge>
              {(e.version ?? 1) > 1 && <Badge tone="gold">Edited ×{(e.version ?? 1) - 1}</Badge>}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-ink-2/50">
            <div className="border-b border-line px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-mute uppercase">Ledger legs · always sums to zero</div>
            {e.postings.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                <div>
                  <div className="text-sm font-semibold">{legLabel(p, lookups)}</div>
                  <div className="text-xs text-mute">
                    {legMeaning(p, lookups)}
                    {p.memo ? ` · ${p.memo}` : ''}
                  </div>
                </div>
                <span className={cx('tnum text-sm font-bold', p.amount > 0n ? 'text-chalk' : 'text-chalk-dim')}>{formatMoney(p.amount, { showPlus: true, decimals: 2 })}</span>
              </div>
            ))}
          </div>

          {e.notes && (
            <div>
              <div className="mb-1 text-[11px] font-bold tracking-[0.16em] text-mute uppercase">Note</div>
              <p className="text-sm text-chalk-dim">{e.notes}</p>
            </div>
          )}

          {!!revisions.data?.length && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-mute uppercase">
                <Icon name="history" size={14} /> Correction history
              </div>
              <ol className="space-y-2">
                {revisions.data.map((r) => {
                  const snap = r.snapshot as { amount?: string | number; description?: string };
                  return (
                    <li key={r.revision} className="rounded-xl border border-line px-3 py-2 text-xs">
                      <div className="flex justify-between">
                        <span className="font-bold capitalize">
                          #{r.revision} {r.action}
                        </span>
                        <span className="text-mute">{new Date(r.createdAt).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="mt-1 text-mute">
                        Before: {snap.description} · {snap.amount !== undefined ? formatMoney(BigInt(snap.amount)) : ''}
                        {r.reason ? ` — “${r.reason}”` : ''}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {editable && (
              <PopButton
                tone="chalk"
                icon="edit"
                onClick={() => {
                  close();
                  openComposer({ kind: 'expense', editEntryId: e.id });
                }}
              >
                Edit
              </PopButton>
            )}
            {e.status === 'posted' ? (
              confirmVoid ? (
                <div className="w-full space-y-3 rounded-2xl border border-coral/30 bg-coral/5 p-4">
                  <div className="text-sm font-semibold">Void this entry? Balances will ignore it; history is kept and you can restore it.</div>
                  <TextInput value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (optional)" />
                  <div className="flex gap-3">
                    <PopButton
                      tone="coral"
                      loading={voidEntry.isPending}
                      onClick={async () => {
                        await voidEntry.mutateAsync({ id: e.id!, reason });
                        toast('Entry voided');
                        setConfirmVoid(false);
                      }}
                    >
                      Void entry
                    </PopButton>
                    <GhostButton onClick={() => setConfirmVoid(false)}>Cancel</GhostButton>
                  </div>
                </div>
              ) : (
                <PopButton tone="dark" icon="trash" onClick={() => setConfirmVoid(true)}>
                  Void
                </PopButton>
              )
            ) : (
              <PopButton
                tone="dark"
                icon="history"
                loading={restore.isPending}
                onClick={async () => {
                  try {
                    await restore.mutateAsync(e.id!);
                    toast.success('Restored');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Could not restore');
                  }
                }}
              >
                Restore
              </PopButton>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
