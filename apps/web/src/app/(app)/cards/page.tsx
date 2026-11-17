'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatBps, groupOf, relativeDay, sortAccounts, summariseCard, utilisationTone } from '@folio/core';
import { useEntriesInRange, usePosition, useStatements, useToday } from '@folio/api';
import { AddCardFace, CardCarousel } from '@/components/cards/CardCarousel';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { Badge, EmptyState, Meter, Money, Plate, PopButton, Skeleton } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';
import { addMonths, startOfMonth } from '@folio/core';

export default function CardsPage() {
  const router = useRouter();
  const t = useToday();
  const { accounts, balances, position, isLoading } = usePosition();
  const statements = useStatements().data ?? [];
  const entries = useEntriesInRange({ from: addMonths(startOfMonth(t), -3, 1), to: t }).data ?? [];
  const openEditor = useUi((s) => s.openAccountEditor);
  const openComposer = useUi((s) => s.openComposer);
  const cards = sortAccounts(accounts.filter((a) => groupOf(a) === 'credit' && a.status === 'active'));
  const [active, setActive] = useState(0);
  const current = cards[active];
  const summary = current ? summariseCard(current, balances.get(current.id)?.balance ?? 0n, entries, statements, t) : null;

  if (isLoading) return <Skeleton className="h-[480px]" />;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Credit</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Your cards</h1>
        </div>
        <PopButton tone="mint" icon="plus" onClick={() => openEditor({ type: 'credit_card' })}>
          Add card
        </PopButton>
      </div>

      {position && cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Plate className="p-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Total outstanding</div>
            <Money value={position.creditOutstanding} decimals={0} className="mt-1 block font-display text-2xl font-semibold text-coral" />
          </Plate>
          <Plate className="p-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Available credit</div>
            <Money value={position.availableCredit} decimals={0} className="mt-1 block font-display text-2xl font-semibold" />
          </Plate>
          <Plate className="p-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Total limit</div>
            <Money value={position.creditLimit} decimals={0} className="mt-1 block font-display text-2xl font-semibold" />
          </Plate>
          <Plate className="p-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Overall usage</div>
            <div className="mt-1 font-display text-2xl font-semibold">{position.creditLimit > 0n ? formatBps(Number((position.creditOutstanding * 10_000n) / position.creditLimit)) : '—'}</div>
          </Plate>
        </div>
      )}

      {cards.length === 0 ? (
        <Plate>
          <EmptyState icon="card" title="No credit cards yet" body="Add each card with its limit, statement day and due day. Folio tracks outstanding, dues and utilisation from your entries." action={<PopButton tone="mint" icon="plus" onClick={() => openEditor({ type: 'credit_card' })}>Add a card</PopButton>} />
        </Plate>
      ) : (
        <>
          <CardCarousel
            items={cards}
            keyOf={(a) => a.id}
            itemWidth={380}
            onActiveChange={setActive}
            render={(a, isActive) => <FinanceCard account={a} balance={balances.get(a.id)?.balance ?? 0n} available={a.card?.creditLimit ? a.card.creditLimit - (balances.get(a.id)?.balance ?? 0n) : null} active={isActive} size="lg" onClick={() => router.push(`/cards/view?id=${a.id}`)} />}
            trailing={<AddCardFace label="Add card" onClick={() => openEditor({ type: 'credit_card' })} />}
          />
          {current && summary && (
            <Plate className="grid gap-6 p-6 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{current.nickname || current.name}</div>
                {summary.limit ? (
                  <>
                    <Meter className="mt-3 h-2" valueBps={summary.utilisationBps} tone={utilisationTone(summary.utilisationBps) === 'good' ? 'mint' : utilisationTone(summary.utilisationBps) === 'watch' ? 'gold' : 'coral'} />
                    <div className="mt-2 flex justify-between text-xs text-mute">
                      <span>{formatBps(summary.utilisationBps)} used</span>
                      <span>
                        <Money value={summary.available ?? 0n} decimals={0} /> of <Money value={summary.limit} decimals={0} /> free
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-mute">Set a credit limit to see utilisation.</div>
                )}
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Statement due</div>
                <Money value={summary.statementRemaining} decimals={0} className="mt-1 block font-display text-2xl font-semibold" />
                <div className="text-xs text-mute">
                  {summary.cycle.dueOn ? relativeDay(summary.cycle.dueOn, t) : 'Set a due day'} · min <Money value={summary.minimumDue} decimals={0} />
                  {summary.minimumDueEstimated && <Badge className="ml-1">est.</Badge>}
                </div>
              </div>
              <div className="flex items-end justify-end">
                <PopButton tone="mint" icon="check" onClick={() => openComposer({ kind: 'card_payment', toAccountId: current.id })}>
                  Pay bill
                </PopButton>
              </div>
            </Plate>
          )}
        </>
      )}
    </div>
  );
}
