'use client';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { relativeDay, type PersonRelation } from '@folio/core';
import { usePeople, usePersonBalances, useSavePerson, useToday } from '@folio/api';
import { Avatar, Badge, EmptyState, Field, GhostButton, Money, Plate, PopButton, Select, Sheet, TextInput } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

const RELATIONS: PersonRelation[] = ['parent', 'family', 'friend', 'roommate', 'partner', 'colleague', 'other'];
const COLORS = ['#7cf2c4', '#f5c26b', '#6aa8ff', '#c38bff', '#ff7a59', '#ff6b9a', '#2dd4bf', '#e8e8e8'];

export default function PeoplePage() {
  const t = useToday();
  const people = usePeople().data ?? [];
  const balances = usePersonBalances().data;
  const save = useSavePerson();
  const openComposer = useUi((s) => s.openComposer);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<PersonRelation>('friend');
  const [color, setColor] = useState(COLORS[0]!);
  const [showArchived, setShowArchived] = useState(false);

  const rows = people.filter((p) => showArchived || !p.archived).map((p) => ({ p, b: balances?.get(p.id) })).sort((a, b) => ((b.b?.outstanding ?? 0n) > (a.b?.outstanding ?? 0n) ? 1 : -1));
  const owed = rows.reduce((s, r) => s + ((r.b?.outstanding ?? 0n) > 0n ? r.b!.outstanding : 0n), 0n);
  const iOwe = rows.reduce((s, r) => s + ((r.b?.outstanding ?? 0n) < 0n ? -r.b!.outstanding : 0n), 0n);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Reimbursements</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Owed to you</h1>
        </div>
        <div className="flex gap-3">
          <PopButton tone="dark" icon="plus" onClick={() => setAdding(true)}>Person</PopButton>
          <PopButton tone="mint" icon="users" onClick={() => openComposer({ kind: 'reimbursement' })}>Record payback</PopButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Owed to you</div><Money value={owed} className="mt-1 block font-display text-3xl font-semibold text-mint" /></Plate>
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">You owe</div><Money value={iOwe} className="mt-1 block font-display text-3xl font-semibold text-coral" /></Plate>
        <Plate className="col-span-2 p-5 sm:col-span-1"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Net</div><Money value={owed - iOwe} className="mt-1 block font-display text-3xl font-semibold" /></Plate>
      </div>
      {rows.length === 0 ? (
        <Plate><EmptyState icon="users" title="Nobody yet" body="Add parents, friends or roommates. When you pay for them, their share is tracked here — not as your expense." action={<PopButton tone="mint" icon="plus" onClick={() => setAdding(true)}>Add a person</PopButton>} /></Plate>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ p, b }) => (
            <Link key={p.id} href={`/people/view?id=${p.id}`} className="plate group p-5 transition-colors hover:border-line-strong">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} color={p.color} emoji={p.emoji} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs capitalize text-mute">{p.relation}{p.archived ? ' · archived' : ''}</div>
                </div>
                {b && b.outstanding === 0n && <Badge tone="mint">Settled</Badge>}
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="text-xs text-mute">{(b?.outstanding ?? 0n) >= 0n ? 'Owes you' : 'You owe'}</div>
                  <Money value={(b?.outstanding ?? 0n) < 0n ? -b!.outstanding : b?.outstanding ?? 0n} className={`font-display text-2xl font-semibold ${(b?.outstanding ?? 0n) < 0n ? 'text-coral' : (b?.outstanding ?? 0n) > 0n ? 'text-mint' : ''}`} />
                </div>
                <div className="text-right text-[11px] text-faint">
                  <div>Paid for them <Money value={b?.paidOnBehalf ?? 0n} decimals={0} /></div>
                  <div>Got back <Money value={b?.reimbursed ?? 0n} decimals={0} /></div>
                  {b?.lastActivityOn && <div>{relativeDay(b.lastActivityOn, t)}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <GhostButton onClick={() => setShowArchived((s) => !s)}>{showArchived ? 'Hide archived' : 'Show archived'}</GhostButton>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a person" footer={<PopButton tone="mint" size="lg" disabled={!name.trim()} loading={save.isPending} onClick={async () => { await save.mutateAsync({ name, relation, color }); toast.success(`${name} added`); setName(''); setAdding(false); }}>Add</PopButton>}>
        <div className="space-y-5">
          <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Parents, Rahul…" autoFocus /></Field>
          <Field label="Relation"><Select value={relation} onChange={(e) => setRelation(e.target.value as PersonRelation)}>{RELATIONS.map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}</Select></Field>
          <Field label="Colour"><div className="flex gap-2">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={`size-8 cursor-pointer rounded-full border-2 ${color === c ? 'border-chalk' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />)}</div></Field>
        </div>
      </Sheet>
    </div>
  );
}
