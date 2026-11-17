'use client';
import { EMPTY } from '@/lib/empty';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildEntry, formatDate, formatMoney, newIdempotencyKey, personLedger, planAllocations, today, tryParseAmount, type Claim } from '@folio/core';
import { repo, useAllocations, useEntriesInRange, useFolio, useLedgerContext, usePersonBalances, useSavePerson, useSetAllocations } from '@folio/api';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateLedger } from '@folio/api';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { Icon } from '@/components/ui/Icon';
import { AmountInput, Avatar, Badge, EmptyState, Field, GhostButton, Money, Plate, PopButton, SectionTitle, Select, Sheet, Skeleton, TextInput } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

function PersonDetailInner() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { sb } = useFolio();
  const qc = useQueryClient();
  const { ctx, accounts, people } = useLedgerContext();
  const person = people.find((p) => p.id === id);
  const balance = usePersonBalances().data?.get(id);
  const entries = useEntriesInRange({ personId: id });
  const allocations = useAllocations().data ?? EMPTY;
  const setAlloc = useSetAllocations();
  const savePerson = useSavePerson();
  const lookups = useLookups();
  const ledger = useMemo(() => (entries.data ? personLedger(id, entries.data, allocations) : null), [entries.data, allocations, id]);
  const [settling, setSettling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const receivers = accounts.filter((a) => a.class === 'asset' && a.type !== 'debit_card' && a.status === 'active');

  if (!person) return <Skeleton className="h-96" />;
  const open = ledger?.claims.filter((c) => c.status !== 'settled') ?? [];
  const selectedClaims = open.filter((c) => selected.has(c.entryId));
  const selectedTotal = selectedClaims.reduce((s, c) => s + c.outstanding, 0n);

  const startSettle = (claims: Claim[]) => {
    setSelected(new Set(claims.map((c) => c.entryId)));
    const sum = claims.reduce((s, c) => s + c.outstanding, 0n);
    setAmount(formatMoney(sum, { symbol: '', decimals: 'auto' }).replace(/,/g, ''));
    setAccountId(receivers[0]?.id ?? '');
    setSettling(true);
  };

  const settle = async () => {
    if (!ctx) return;
    const amt = tryParseAmount(amount);
    if (!amt || amt <= 0n || !accountId) return;
    setBusy(true);
    try {
      const entry = buildEntry({ kind: 'reimbursement_received', accountId, personId: id, amount: amt, occurredOn: date, description: `${person.name} paid back`, idempotencyKey: newIdempotencyKey(), source: 'web' }, ctx);
      const res = await repo.postEntry(sb, entry);
      const plan = planAllocations(res.id, id, amt, selectedClaims);
      if (plan.length) await setAlloc.mutateAsync({ settlementEntryId: res.id, allocations: plan });
      invalidateLedger(qc);
      toast.success('Settlement recorded', { description: `${formatMoney(amt)} from ${person.name} — not counted as income.` });
      setSettling(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <GhostButton icon="arrowLeft" onClick={() => router.push('/people')}>People</GhostButton>
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={person.name} color={person.color} emoji={person.emoji} size={72} />
        <div className="flex-1">
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase capitalize">{person.relation}</div>
          <h1 className="font-display text-4xl font-semibold">{person.name}</h1>
        </div>
        <div className="flex gap-3">
          <PopButton tone="mint" icon="check" disabled={open.length === 0} onClick={() => startSettle(open)}>Settle up</PopButton>
          <PopButton tone="dark" icon="archive" onClick={() => savePerson.mutate({ ...person, archived: !person.archived })}>{person.archived ? 'Unarchive' : 'Archive'}</PopButton>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Paid on their behalf</div><Money value={balance?.paidOnBehalf ?? 0n} className="mt-1 block font-display text-2xl font-semibold" /></Plate>
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Reimbursed</div><Money value={balance?.reimbursed ?? 0n} className="mt-1 block font-display text-2xl font-semibold" /></Plate>
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{(balance?.outstanding ?? 0n) < 0n ? 'You owe' : 'Outstanding'}</div><Money value={(balance?.outstanding ?? 0n) < 0n ? -balance!.outstanding : balance?.outstanding ?? 0n} className={`mt-1 block font-display text-2xl font-semibold ${(balance?.outstanding ?? 0n) > 0n ? 'text-mint' : (balance?.outstanding ?? 0n) < 0n ? 'text-coral' : ''}`} /></Plate>
      </div>

      <Plate className="p-6">
        <SectionTitle eyebrow="Purchases you covered" title="Claims" action={selected.size > 0 && !settling ? <PopButton tone="mint" size="sm" onClick={() => startSettle(selectedClaims)}>Settle {selected.size} · {formatMoney(selectedTotal, { decimals: 0 })}</PopButton> : undefined} />
        {!ledger ? <Skeleton className="h-40" /> : ledger.claims.length === 0 ? <EmptyState icon="receipt" title="Nothing paid for them yet" /> : (
          <ul className="divide-y divide-line">
            {[...ledger.claims].reverse().map((c) => (
              <li key={c.entryId} className="flex items-center gap-3 py-3">
                <button disabled={c.status === 'settled'} onClick={() => setSelected((s) => { const n = new Set(s); if (n.has(c.entryId)) n.delete(c.entryId); else n.add(c.entryId); return n; })} className={cx('grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border', selected.has(c.entryId) ? 'border-mint bg-mint text-ink' : 'border-line-strong', c.status === 'settled' && 'cursor-default opacity-30')}>
                  {(selected.has(c.entryId) || c.status === 'settled') && <Icon name="check" size={14} strokeWidth={2.4} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.description}</div>
                  <div className="text-xs text-mute">{formatDate(c.occurredOn)}{c.settledBy.length > 0 ? ` · settled by ${c.settledBy.length} payment${c.settledBy.length > 1 ? 's' : ''}` : ''}</div>
                </div>
                <Badge tone={c.status === 'settled' ? 'mint' : c.status === 'partial' ? 'gold' : 'neutral'}>{c.status}</Badge>
                <div className="w-28 text-right">
                  <Money value={c.outstanding} className="block text-sm font-bold" />
                  {c.status !== 'open' && <span className="text-[11px] text-faint">of <Money value={c.amount} decimals={0} /></span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Plate>

      <Plate className="p-2 sm:p-3">
        <div className="px-3 pt-3"><SectionTitle eyebrow="Everything with them" title="History" /></div>
        <EntryList entries={[...(entries.data ?? [])].reverse()} lookups={lookups} loading={entries.isLoading} />
      </Plate>

      <Sheet open={settling} onClose={() => setSettling(false)} eyebrow={person.name} title="Record what they paid back" footer={<PopButton tone="mint" size="lg" onClick={settle} loading={busy} disabled={!tryParseAmount(amount) || !accountId}>Record</PopButton>}>
        <div className="space-y-5">
          <Field label="Amount received" hint={selectedClaims.length ? `Applied to ${selectedClaims.length} selected purchase(s), oldest first. Anything extra stays as credit.` : 'Applied oldest-first to open purchases.'}><AmountInput value={amount} onChange={setAmount} size="xl" autoFocus /></Field>
          <Field label="Received in"><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{receivers.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.name}</option>)}</Select></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <p className="text-xs text-faint">This increases your bank balance and clears what {person.name} owes. It never counts as income, and your own spending stays the same.</p>
        </div>
      </Sheet>
    </div>
  );
}

export default function PersonDetail() {
  return (
    <Suspense>
      <PersonDetailInner />
    </Suspense>
  );
}
