'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { addMonths, displayName, formatBps, formatDate, formatMonth, rewardEstimate, relativeDay, spendByAccount, startOfMonth, summariseCard, utilisationTone, monthRange, endOfMonth } from '@folio/core';
import { useEntries, useEntriesInRange, usePosition, useStatements, useToday } from '@folio/api';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { GroupedBars } from '@/components/charts/Charts';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { Badge, EmptyState, GhostButton, Meter, Money, Plate, PopButton, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

function CardDetailInner() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const t = useToday();
  const { accounts, balances } = usePosition();
  const statements = useStatements(id).data ?? [];
  const lookups = useLookups();
  const openComposer = useUi((s) => s.openComposer);
  const openEditor = useUi((s) => s.openAccountEditor);
  const card = accounts.find((a) => a.id === id);
  const year = useEntriesInRange({ accountId: id, from: addMonths(startOfMonth(t), -11, 1), to: t }, !!card);
  const recent = useEntries({ accountId: id });
  const payments = useEntries({ accountId: id, types: ['card_repayment', 'refund'] });

  const monthly = useMemo(() => {
    if (!card || !year.data) return [];
    const months = monthRange(addMonths(startOfMonth(t), -11, 1), t);
    return months.map((m) => {
      const spend = spendByAccount(year.data!, [card], `${m}-01`, endOfMonth(`${m}-01`)).get(card.id) ?? 0n;
      const paid = year.data!.filter((e) => e.type === 'card_repayment' && e.occurredOn.startsWith(m)).reduce((s, e) => s + e.amount, 0n);
      return { month: m, spend, paid };
    });
  }, [card, year.data, t]);

  if (!card) return <Skeleton className="h-96" />;
  const out = balances.get(id)?.balance ?? 0n;
  const s = summariseCard(card, out, year.data ?? [], statements, t);
  const thisMonth = monthly.at(-1)?.spend ?? 0n;
  const yearSpend = monthly.reduce((x, m) => x + m.spend, 0n);

  return (
    <div className="space-y-10">
      <GhostButton icon="arrowLeft" onClick={() => router.back()}>
        Cards
      </GhostButton>
      <div className="grid items-center gap-8 lg:grid-cols-[460px_1fr]">
        <FinanceCard account={card} balance={out} available={s.available} size="lg" />
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">
            {card.institutionName ?? 'Credit card'}
            {card.card?.variant ? ` · ${card.card.variant}` : ''}
          </div>
          <h1 className="mt-1 font-display text-4xl font-semibold">{displayName(card)}</h1>
          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
            <div>
              <div className="text-xs text-mute">Outstanding</div>
              <Money value={out} className="font-display text-3xl font-semibold text-coral" />
            </div>
            <div>
              <div className="text-xs text-mute">Available</div>
              <Money value={s.available ?? 0n} decimals={0} className="font-display text-3xl font-semibold" />
            </div>
            <div>
              <div className="text-xs text-mute">Unbilled</div>
              <Money value={s.unbilled} decimals={0} className="font-display text-3xl font-semibold" />
            </div>
          </div>
          {s.limit && (
            <div className="mt-5 max-w-md">
              <Meter className="h-2" valueBps={s.utilisationBps} tone={utilisationTone(s.utilisationBps) === 'good' ? 'mint' : utilisationTone(s.utilisationBps) === 'watch' ? 'gold' : 'coral'} />
              <div className="mt-1.5 text-xs text-mute">
                {formatBps(s.utilisationBps)} of <Money value={s.limit} decimals={0} /> used
              </div>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <PopButton tone="mint" icon="check" onClick={() => openComposer({ kind: 'card_payment', toAccountId: card.id })}>
              Pay bill
            </PopButton>
            <PopButton tone="chalk" icon="arrowUp" onClick={() => openComposer({ kind: 'expense', accountId: card.id })}>
              Add spend
            </PopButton>
            <PopButton tone="dark" icon="doc" onClick={() => router.push(`/statements?account=${card.id}`)}>
              Statements
            </PopButton>
            <PopButton tone="dark" icon="settings" onClick={() => openEditor({ id: card.id })}>
              Card settings
            </PopButton>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Plate className="p-6">
          <SectionTitle eyebrow="Billing" title="This cycle" />
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-mute">Last statement</dt>
              <dd className="font-semibold">{s.statement ? formatDate(s.statement.statementDate) : s.cycle.lastStatementOn ? formatDate(s.cycle.lastStatementOn) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Statement balance</dt>
              <dd>
                <Money value={s.statement?.statementBalance ?? s.statementRemaining + s.statementPaid} className="font-semibold" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Paid since</dt>
              <dd>
                <Money value={s.statementPaid} className="font-semibold text-mint" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Still due</dt>
              <dd>
                <Money value={s.statementRemaining} className="font-bold" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Minimum due</dt>
              <dd className="flex items-center gap-1.5">
                <Money value={s.minimumDue} className="font-semibold" />
                {s.minimumDueEstimated && <Badge>est.</Badge>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Due date</dt>
              <dd className={`font-semibold ${s.cycle.daysToDue !== null && s.cycle.daysToDue <= 3 && s.statementRemaining > 0n ? 'text-coral' : ''}`}>{s.cycle.dueOn ? `${formatDate(s.cycle.dueOn)} · ${relativeDay(s.cycle.dueOn, t)}` : 'Set due day'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Next statement</dt>
              <dd className="font-semibold">{s.cycle.nextStatementOn ? formatDate(s.cycle.nextStatementOn) : '—'}</dd>
            </div>
          </dl>
        </Plate>
        <Plate className="p-6 lg:col-span-2">
          <SectionTitle eyebrow="12 months" title="Spend and payments" />
          {monthly.some((m) => m.spend > 0n || m.paid > 0n) ? (
            <GroupedBars
              data={monthly.map((m) => ({ month: m.month, spend: m.spend, paid: m.paid }))}
              labelOf={(r) => formatMonth(r.month as string, false)}
              series={[
                { key: 'spend', label: 'Spent', color: 'var(--color-chalk)' },
                { key: 'paid', label: 'Paid', color: 'var(--color-mint)' },
              ]}
            />
          ) : (
            <EmptyState icon="chart" title="No card activity yet" />
          )}
        </Plate>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Plate className="space-y-3 p-6">
          <SectionTitle eyebrow="Value" title="Rewards & fees" />
          <div className="flex justify-between text-sm">
            <span className="text-mute">This month&apos;s spend</span>
            <Money value={thisMonth} className="font-semibold" />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-mute">12-month spend</span>
            <Money value={yearSpend} className="font-semibold" />
          </div>
          {card.card?.rewardRateBps ? (
            <div className="flex justify-between text-sm">
              <span className="text-mute">Est. rewards (12 mo, {formatBps(card.card.rewardRateBps)})</span>
              <Money value={rewardEstimate(yearSpend, card.card.rewardRateBps)} className="font-semibold text-mint" />
            </div>
          ) : null}
          <div className="flex justify-between text-sm">
            <span className="text-mute">Annual fee</span>
            <span className="font-semibold">{card.card?.lifetimeFree ? <Badge tone="mint">Lifetime free</Badge> : card.card?.annualFee ? <Money value={card.card.annualFee} /> : '—'}</span>
          </div>
          {card.card?.rewardsInfo && <p className="border-t border-line pt-3 text-sm text-chalk-dim">{card.card.rewardsInfo}</p>}
        </Plate>
        <Plate className="p-6 lg:col-span-2">
          <SectionTitle eyebrow="History" title="Statements" action={<GhostButton icon="plus" onClick={() => router.push(`/statements?account=${card.id}`)}>Add</GhostButton>} />
          {statements.length === 0 ? (
            <EmptyState icon="doc" title="No statements recorded" body="Record each month's statement (and attach the PDF) to track dues exactly and reconcile." />
          ) : (
            <ul className="divide-y divide-line">
              {statements.slice(0, 8).map((st) => (
                <li key={st.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-semibold">{formatDate(st.statementDate)}</div>
                    <div className="text-xs text-mute">Due {st.dueDate ? formatDate(st.dueDate) : '—'}</div>
                  </div>
                  <Badge tone={st.status === 'paid' || st.status === 'reconciled' ? 'mint' : st.status === 'partially_paid' ? 'gold' : 'neutral'}>{st.status.replace('_', ' ')}</Badge>
                  <Money value={st.statementBalance} className="font-bold" />
                </li>
              ))}
            </ul>
          )}
        </Plate>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Plate className="p-3 sm:p-4">
          <div className="px-3 pt-3">
            <SectionTitle eyebrow="Ledger" title="Recent transactions" />
          </div>
          <EntryList entries={recent.data?.pages.flat() ?? []} lookups={lookups} accountId={id} loading={recent.isLoading} hasMore={recent.hasNextPage} onMore={() => void recent.fetchNextPage()} />
        </Plate>
        <Plate className="p-3 sm:p-4">
          <div className="px-3 pt-3">
            <SectionTitle eyebrow="Ledger" title="Payments & refunds" />
          </div>
          <EntryList entries={payments.data?.pages.flat() ?? []} lookups={lookups} accountId={id} loading={payments.isLoading} empty={<EmptyState icon="check" title="No payments yet" />} />
        </Plate>
      </div>
    </div>
  );
}

export default function CardDetail() {
  return (
    <Suspense>
      <CardDetailInner />
    </Suspense>
  );
}
