'use client';
import { EMPTY } from '@/lib/empty';
import { useMemo, useState } from 'react';
import { formatBps, formatMonth, incomeSources, monthlySeries, periodRange, periodTotals, type PeriodPreset } from '@folio/core';
import { useCategories, useEntries, useEntriesInRange, useObligations, useToday } from '@folio/api';
import { Donut, GroupedBars } from '@/components/charts/Charts';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { EmptyState, Money, Plate, PopButton, SectionTitle, Segmented } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

export default function IncomePage() {
  const t = useToday();
  const [period, setPeriod] = useState<PeriodPreset>('last_12_months');
  const range = periodRange(period, t);
  const categories = useCategories().data ?? EMPTY;
  const entries = useEntriesInRange({ from: range.from, to: range.to }).data ?? [];
  const list = useEntries({ types: ['income', 'interest', 'bank_deposit'] });
  const lookups = useLookups();
  const { items } = useObligations(45);
  const openComposer = useUi((s) => s.openComposer);
  const kindOf = useMemo(() => { const m = new Map(categories.map((c) => [c.id, c.kind])); return (id: string) => m.get(id); }, [categories]);
  const totals = periodTotals(entries, kindOf, range.from, range.to);
  const thisMonth = periodTotals(entries, kindOf, periodRange('this_month', t).from, t);
  const series = monthlySeries(entries, kindOf, range.from, range.to);
  const sources = incomeSources(entries, categories, range.from, range.to);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const expected = items.filter((i) => i.kind === 'income' && i.state !== 'paid');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Money earned — never transfers or paybacks</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Income</h1>
        </div>
        <div className="flex items-center gap-3">
          <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: 'this_month', label: 'Month' }, { value: 'financial_year', label: 'FY' }, { value: 'last_12_months', label: '12 mo' }, { value: 'this_year', label: 'Year' }]} />
          <PopButton tone="mint" icon="arrowDown" onClick={() => openComposer({ kind: 'income' })}>Record income</PopButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: 'This month', v: thisMonth.income },
          { l: range.label, v: totals.income },
          { l: 'Monthly average', v: series.length ? totals.income / BigInt(series.length) : 0n },
          { l: 'Savings rate', s: totals.income > 0n ? formatBps(totals.savingsRateBps, 0) : '—' },
        ].map((x) => (
          <Plate key={x.l} className="p-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{x.l}</div>
            {x.v !== undefined ? <Money value={x.v} decimals={0} className="mt-1 block font-display text-2xl font-semibold text-mint" /> : <div className="mt-1 font-display text-2xl font-semibold">{x.s}</div>}
          </Plate>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Plate className="p-6 lg:col-span-2">
          <SectionTitle eyebrow={range.label} title="By month" />
          {totals.income === 0n ? <EmptyState icon="arrowDown" title="No income recorded" /> : (
            <GroupedBars data={series.map((s) => ({ month: s.month, income: s.income }))} labelOf={(r) => formatMonth(r.month as string, false)} series={[{ key: 'income', label: 'Income', color: 'var(--color-mint)' }]} />
          )}
        </Plate>
        <Plate className="p-6">
          <SectionTitle eyebrow={range.label} title="Sources" />
          {sources.length === 0 ? <EmptyState icon="briefcase" title="No sources yet" /> : (
            <div className="flex flex-col items-center gap-5">
              <Donut slices={sources.map((s) => ({ label: catById.get(s.categoryId)?.name ?? '?', value: s.amount, color: catById.get(s.categoryId)?.color ?? '#3ddc97' }))} center={<Money value={totals.income} compact className="font-display text-lg font-semibold" />} />
              <ul className="w-full space-y-2 text-sm">
                {sources.map((s) => (
                  <li key={s.categoryId} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: catById.get(s.categoryId)?.color ?? '#3ddc97' }} />
                    <span className="flex-1 text-chalk-dim">{catById.get(s.categoryId)?.name}</span>
                    <Money value={s.amount} decimals={0} className="font-semibold" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Plate>
      </div>
      {expected.length > 0 && (
        <Plate className="p-6">
          <SectionTitle eyebrow="Recurring" title="Expected income" />
          <ul className="divide-y divide-line text-sm">
            {expected.map((i) => (
              <li key={i.key} className="flex items-center justify-between py-3"><span className="font-semibold">{i.name}</span><span className="text-mute">{i.dueOn}</span>{i.amount ? <Money value={i.amount} className="font-bold text-mint" /> : <span>Variable</span>}</li>
            ))}
          </ul>
        </Plate>
      )}
      <Plate className="p-2 sm:p-3"><EntryList entries={list.data?.pages.flat() ?? []} lookups={lookups} loading={list.isLoading} hasMore={list.hasNextPage} onMore={() => void list.fetchNextPage()} /></Plate>
    </div>
  );
}
