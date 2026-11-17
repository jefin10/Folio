'use client';
import { EMPTY } from '@/lib/empty';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { accountMeta, addMonths, displayName, formatBps, groupOf, monthlySeries, monthKey, periodTotals, runningBalance, startOfMonth, formatMonth, type Entry } from '@folio/core';
import { useCategories, useEntries, useEntriesInRange, usePosition, useToday } from '@folio/api';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { AreaLine } from '@/components/charts/Charts';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { EmptyState, GhostButton, Money, Plate, PopButton, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

function AccountDetailInner() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const t = useToday();
  const { accounts, balances } = usePosition();
  const categories = useCategories().data ?? EMPTY;
  const lookups = useLookups();
  const openComposer = useUi((s) => s.openComposer);
  const openEditor = useUi((s) => s.openAccountEditor);
  const account = accounts.find((a) => a.id === id);
  const ledgerId = account?.type === 'debit_card' ? account.linkedAccountId ?? id : id;
  const page = useEntries({ accountId: ledgerId });
  const history = useEntriesInRange({ accountId: ledgerId, from: addMonths(startOfMonth(t), -11, 1), to: t }, !!account);
  const all = useEntriesInRange({ accountId: ledgerId }, !!account);

  const kindOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.kind]));
    return (cid: string) => m.get(cid);
  }, [categories]);

  const trend = useMemo(() => {
    if (!account || !all.data) return null;
    const rows = runningBalance(account.type === 'debit_card' ? { id: ledgerId, class: 'asset' } : account, all.data as (Entry & { id: string })[]);
    // End-of-month balances for the last 12 months.
    const byMonth = new Map<string, bigint>();
    const byId = new Map(all.data.map((e) => [e.id!, e]));
    for (const r of [...rows].reverse()) byMonth.set(monthKey(byId.get(r.entryId)!.occurredOn), r.balanceAfter);
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) months.push(monthKey(addMonths(startOfMonth(t), -i, 1)));
    let last = 0n;
    const firstKnown = [...byMonth.keys()].sort()[0];
    return months.map((m) => {
      if (byMonth.has(m)) last = byMonth.get(m)!;
      else if (firstKnown && m < firstKnown) last = 0n;
      return { m, v: last };
    });
  }, [account, all.data, ledgerId, t]);

  if (!account) return <Skeleton className="h-96" />;
  const bal = balances.get(ledgerId)?.balance ?? 0n;
  const meta = accountMeta(account.type);
  const month = periodTotals(history.data ?? [], kindOf, startOfMonth(t), t);
  const series = monthlySeries(history.data ?? [], kindOf, addMonths(startOfMonth(t), -5, 1), t);
  const entries = page.data?.pages.flat() ?? [];

  return (
    <div className="space-y-10">
      <GhostButton icon="arrowLeft" onClick={() => router.back()}>
        Back
      </GhostButton>
      <div className="grid items-center gap-8 lg:grid-cols-[440px_1fr]">
        <FinanceCard account={account} balance={bal} size="lg" />
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">{account.institutionName ?? meta.label}</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">{displayName(account)}</h1>
          <Money value={bal} decimals={2} className="mt-3 block font-display text-5xl font-semibold" />
          <div className="mt-1 text-sm text-mute">
            {account.class === 'liability' ? 'Outstanding' : 'Current balance'} · opening + credits − debits
            {account.interestRateBps ? ` · ${formatBps(account.interestRateBps, 2)} p.a.` : ''}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {groupOf(account) !== 'loan' && (
              <PopButton tone="mint" icon="arrowUp" onClick={() => openComposer({ kind: 'expense', accountId: account.id })}>
                Spend
              </PopButton>
            )}
            {account.class === 'asset' && account.type !== 'debit_card' && (
              <>
                <PopButton tone="chalk" icon="arrowDown" onClick={() => openComposer({ kind: 'income', accountId: account.id })}>
                  Money in
                </PopButton>
                <PopButton tone="dark" icon="swap" onClick={() => openComposer({ kind: 'transfer', accountId: account.id })}>
                  Move
                </PopButton>
              </>
            )}
            <PopButton tone="dark" icon="edit" onClick={() => openComposer({ kind: 'more', accountId: ledgerId })}>
              Correct balance
            </PopButton>
            <PopButton tone="dark" icon="settings" onClick={() => openEditor({ id: account.id })}>
              Settings
            </PopButton>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Plate className="p-6 lg:col-span-2">
          <SectionTitle eyebrow="Last 12 months" title="Balance trend" />
          {trend && trend.some((x) => x.v !== 0n) ? <AreaLine points={trend.map((x) => x.v)} labels={trend.map((x) => formatMonth(x.m, false))} /> : <EmptyState icon="chart" title="Not enough history yet" />}
        </Plate>
        <Plate className="space-y-4 p-6">
          <SectionTitle eyebrow="This month" title="Flow" />
          <div className="flex justify-between text-sm">
            <span className="text-mute">Income here</span>
            <Money value={month.income} className="font-bold text-mint" />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-mute">Your spending</span>
            <Money value={month.personalExpense} className="font-bold" />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-mute">Paid for others</span>
            <Money value={month.reimbursable} className="font-bold text-gold" />
          </div>
          <div className="border-t border-line pt-4 text-xs text-faint">
            6-month spend:{' '}
            {series.map((s) => (
              <span key={s.month} className="mr-2 inline-block">
                {formatMonth(s.month, false)} <Money value={s.personalExpense} compact />
              </span>
            ))}
          </div>
        </Plate>
      </div>

      <Plate className="p-3 sm:p-4">
        <div className="px-3 pt-3">
          <SectionTitle eyebrow="Ledger" title="Entries" />
        </div>
        <EntryList entries={entries} lookups={lookups} accountId={ledgerId} loading={page.isLoading} hasMore={page.hasNextPage} onMore={() => void page.fetchNextPage()} />
      </Plate>
    </div>
  );
}

export default function AccountDetail() {
  return (
    <Suspense>
      <AccountDetailInner />
    </Suspense>
  );
}
