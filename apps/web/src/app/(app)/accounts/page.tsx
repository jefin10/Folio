'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { accountMeta, displayName, groupOf, sortAccounts, type Account } from '@folio/core';
import { usePatchAccount, usePosition, useReorderAccounts } from '@folio/api';
import { AddCardFace, CardCarousel } from '@/components/cards/CardCarousel';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { InstitutionBadge } from '@/components/cards/InstitutionBadge';
import { Badge, GhostButton, IconButton, Money, Plate, PopButton, SectionTitle, Segmented, Skeleton } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

const GROUPS: { key: string; title: string; match: (a: Account) => boolean }[] = [
  { key: 'bank', title: 'Bank accounts', match: (a) => groupOf(a) === 'bank' },
  { key: 'cash', title: 'Cash & wallets', match: (a) => groupOf(a) === 'cash' || groupOf(a) === 'wallet' },
  { key: 'debit', title: 'Debit cards', match: (a) => groupOf(a) === 'debit' },
  { key: 'deposit', title: 'Deposits & other assets', match: (a) => groupOf(a) === 'deposit' || (a.class === 'asset' && groupOf(a) === 'other') },
  { key: 'credit', title: 'Credit lines', match: (a) => groupOf(a) === 'credit' },
  { key: 'loan', title: 'Loans & liabilities', match: (a) => groupOf(a) === 'loan' || (a.class === 'liability' && groupOf(a) === 'other') },
];

export default function AccountsPage() {
  const router = useRouter();
  const { accounts, balances, position, isLoading } = usePosition();
  const openEditor = useUi((s) => s.openAccountEditor);
  const reorder = useReorderAccounts();
  const patch = usePatchAccount();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const list = sortAccounts(accounts.filter((a) => (view === 'active' ? a.status === 'active' : a.status !== 'active')));
  const spendable = list.filter((a) => a.class === 'asset' && a.type !== 'debit_card');

  const move = (a: Account, dir: -1 | 1, peers: Account[]) => {
    const ids = sortAccounts(accounts).map((x) => x.id);
    const peerIds = peers.map((p) => p.id);
    const idx = peerIds.indexOf(a.id);
    const swap = peerIds[idx + dir];
    if (!swap) return;
    const i = ids.indexOf(a.id);
    const j = ids.indexOf(swap);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Everything you own and owe</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Accounts</h1>
        </div>
        <div className="flex items-center gap-3">
          <Segmented value={view} onChange={setView} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} size="sm" />
          <PopButton tone="mint" icon="plus" onClick={() => openEditor({ type: 'savings' })}>
            Add
          </PopButton>
        </div>
      </div>

      {view === 'active' && position && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: 'Bank', v: position.bankBalance },
            { l: 'Cash & wallets', v: position.cash + position.wallets },
            { l: 'Deposits', v: position.deposits },
            { l: 'Other assets', v: position.otherAssets },
          ].map((x) => (
            <Plate key={x.l} className="p-4">
              <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{x.l}</div>
              <Money value={x.v} decimals={0} className="mt-1 block font-display text-2xl font-semibold" />
            </Plate>
          ))}
        </div>
      )}

      {view === 'active' && spendable.length > 0 && (
        <CardCarousel
          items={spendable}
          keyOf={(a) => a.id}
          itemWidth={360}
          render={(a, active) => <FinanceCard account={a} balance={balances.get(a.id)?.balance ?? 0n} active={active} onClick={() => router.push(`/accounts/view?id=${a.id}`)} />}
          trailing={<AddCardFace label="Add account" onClick={() => openEditor({ type: 'savings' })} />}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-72" />
      ) : (
        GROUPS.map((g) => {
          const items = list.filter(g.match);
          if (!items.length) return null;
          return (
            <section key={g.key}>
              <SectionTitle title={g.title} />
              <Plate className="divide-y divide-line">
                {items.map((a, i) => {
                  const bal = a.type === 'debit_card' ? balances.get(a.linkedAccountId ?? '')?.balance ?? 0n : balances.get(a.id)?.balance ?? 0n;
                  return (
                    <div key={a.id} className="flex items-center gap-4 px-4 py-3.5">
                      <div className="flex flex-col">
                        <IconButton icon="chevronUp" label="Move up" size={24} disabled={i === 0} onClick={() => move(a, -1, items)} className="border-0" />
                        <IconButton icon="chevronDown" label="Move down" size={24} disabled={i === items.length - 1} onClick={() => move(a, 1, items)} className="border-0" />
                      </div>
                      <span className="h-9 w-14 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${(a.theme?.colors ?? ['#333', '#111']).join(', ')})` }} />
                      {(a.institutionName || a.institutionId) && <InstitutionBadge institutionId={a.institutionId} name={a.institutionName} size={30} />}
                      <button onClick={() => router.push(groupOf(a) === 'credit' ? `/cards/view?id=${a.id}` : `/accounts/view?id=${a.id}`)} className="min-w-0 flex-1 cursor-pointer text-left">
                        <div className="truncate font-semibold">{displayName(a)}</div>
                        <div className="truncate text-xs text-mute">
                          {a.institutionName ? `${a.institutionName} · ` : ''}
                          {a.customTypeLabel ?? accountMeta(a.type).label}
                          {a.last4 ? ` · •••• ${a.last4}` : ''}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        {!a.includeInNetWorth && <Badge>Not in net worth</Badge>}
                        {a.type === 'debit_card' && <Badge tone="sky">Linked</Badge>}
                      </div>
                      <Money value={bal} className={`w-32 text-right font-bold ${a.class === 'liability' ? 'text-coral' : ''}`} />
                      <div className="hidden gap-1 sm:flex">
                        <GhostButton onClick={() => patch.mutate({ id: a.id, patch: { include_in_net_worth: !a.includeInNetWorth } })}>{a.includeInNetWorth ? 'Exclude' : 'Include'}</GhostButton>
                        <IconButton icon="edit" label="Edit" onClick={() => openEditor({ id: a.id })} />
                      </div>
                    </div>
                  );
                })}
              </Plate>
            </section>
          );
        })
      )}
      {!isLoading && list.length === 0 && (
        <Plate className="p-10 text-center text-mute">{view === 'archived' ? 'No archived accounts.' : 'No accounts yet — add your first one.'}</Plate>
      )}
    </div>
  );
}
