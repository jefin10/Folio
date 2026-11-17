'use client';
import { EMPTY } from '@/lib/empty';
import { useMemo, useState } from 'react';
import { categoryBreakdown, formatBps, formatMonth, monthlySeries, periodRange, periodTotals, spendByAccount, type PeriodPreset } from '@folio/core';
import { useCategories, useEntries, useEntriesInRange, useLedgerContext, useToday } from '@folio/api';
import { Donut, GroupedBars } from '@/components/charts/Charts';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { EmptyState, Money, Plate, PopButton, SectionTitle, Segmented } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

export default function ExpensesPage() {
  const t = useToday();
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const range = periodRange(period, t);
  const categories = useCategories().data ?? EMPTY;
  const { accounts } = useLedgerContext();
  const entries = useEntriesInRange({ from: periodRange('last_12_months', t).from, to: t }).data ?? [];
  const list = useEntries({ types: ['expense', 'card_purchase', 'refund', 'bank_charges'] });
  const lookups = useLookups();
  const openComposer = useUi((s) => s.openComposer);
  const kindOf = useMemo(() => { const m = new Map(categories.map((c) => [c.id, c.kind])); return (id: string) => m.get(id); }, [categories]);
  const totals = periodTotals(entries, kindOf, range.from, range.to);
  const series = monthlySeries(entries, kindOf, periodRange('last_6_months', t).from, t);
  const slices = categoryBreakdown(entries, categories, 'expense', range.from, range.to);
  const byAccount = [...spendByAccount(entries, accounts, range.from, range.to).entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">What you actually spent</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Spending</h1>
        </div>
        <div className="flex items-center gap-3">
          <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: 'this_month', label: 'Month' }, { value: 'last_month', label: 'Last' }, { value: 'last_3_months', label: '3 mo' }, { value: 'financial_year', label: 'FY' }]} />
          <PopButton tone="mint" icon="arrowUp" onClick={() => openComposer({ kind: 'expense' })}>Add expense</PopButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Plate className="p-4"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Total paid out</div><Money value={totals.grossSpend} decimals={0} className="mt-1 block font-display text-2xl font-semibold" /><div className="text-[11px] text-faint">at shops, incl. others&apos; shares</div></Plate>
        <Plate className="p-4"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Your own spending</div><Money value={totals.personalExpense} decimals={0} className="mt-1 block font-display text-2xl font-semibold text-gold" /></Plate>
        <Plate className="p-4"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Reimbursable</div><Money value={totals.reimbursable} decimals={0} className="mt-1 block font-display text-2xl font-semibold text-mint" /><div className="text-[11px] text-faint">owed back to you</div></Plate>
        <Plate className="p-4"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Of income</div><div className="mt-1 font-display text-2xl font-semibold">{totals.income > 0n ? formatBps(Number((totals.personalExpense * 10_000n) / totals.income), 0) : '—'}</div></Plate>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Plate className="p-6 lg:col-span-3">
          <SectionTitle eyebrow="6 months" title="Trend" />
          <GroupedBars data={series.map((s) => ({ month: s.month, own: s.personalExpense, others: s.reimbursable }))} labelOf={(r) => formatMonth(r.month as string, false)} series={[{ key: 'own', label: 'Yours', color: 'var(--color-gold)' }, { key: 'others', label: 'For others', color: 'var(--color-mint)' }]} />
        </Plate>
        <Plate className="p-6 lg:col-span-2">
          <SectionTitle eyebrow={range.label} title="By category" />
          {slices.length === 0 ? <EmptyState icon="pie" title="Nothing spent" /> : (
            <div className="flex flex-col items-center gap-5">
              <Donut slices={slices.map((s) => ({ label: catById.get(s.categoryId)?.name ?? '?', value: s.amount, color: catById.get(s.categoryId)?.color ?? '#888' }))} center={<Money value={totals.personalExpense} compact className="font-display text-lg font-semibold" />} />
              <ul className="w-full space-y-1.5 text-sm">
                {slices.map((s) => (
                  <li key={s.categoryId} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: catById.get(s.categoryId)?.color ?? '#888' }} /><span className="flex-1 truncate text-chalk-dim">{catById.get(s.categoryId)?.name}</span><span className="text-xs text-faint">{s.count}×</span><Money value={s.amount} decimals={0} className="w-24 text-right font-semibold" /></li>
                ))}
              </ul>
            </div>
          )}
        </Plate>
      </div>
      {byAccount.length > 0 && (
        <Plate className="p-6">
          <SectionTitle eyebrow={range.label} title="Paid with" />
          <ul className="grid gap-3 sm:grid-cols-3">
            {byAccount.map(([id, v]) => (<li key={id} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm"><span className="font-semibold">{accById.get(id)?.nickname || accById.get(id)?.name}</span><Money value={v} decimals={0} className="font-bold" /></li>))}
          </ul>
        </Plate>
      )}
      <Plate className="p-2 sm:p-3"><EntryList entries={list.data?.pages.flat() ?? []} lookups={lookups} loading={list.isLoading} hasMore={list.hasNextPage} onMore={() => void list.fetchNextPage()} /></Plate>
    </div>
  );
}
