'use client';
import { EMPTY } from '@/lib/empty';
import { useMemo, useState } from 'react';
import { categoryBreakdown, formatBps, formatMonth, liquidFlow, monthlySeries, periodRange, periodTotals, spendByAccount, dailySpend, type PeriodPreset } from '@folio/core';
import { useCategories, useEntriesInRange, useLedgerContext, usePosition, useToday } from '@folio/api';
import { AreaLine, Donut, GroupedBars } from '@/components/charts/Charts';
import { EmptyState, Money, Plate, SectionTitle, Segmented } from '@/components/ui/primitives';

export default function AnalyticsPage() {
  const t = useToday();
  const [period, setPeriod] = useState<PeriodPreset>('last_6_months');
  const range = periodRange(period, t);
  const categories = useCategories().data ?? EMPTY;
  const { accounts } = useLedgerContext();
  const { position } = usePosition();
  const q = useEntriesInRange({ from: range.from, to: range.to });
  const entries = useMemo(() => q.data ?? [], [q.data]);
  const kindOf = useMemo(() => { const m = new Map(categories.map((c) => [c.id, c.kind])); return (id: string) => m.get(id); }, [categories]);
  const totals = periodTotals(entries, kindOf, range.from, range.to);
  const series = monthlySeries(entries, kindOf, range.from, range.to < t ? range.to : t);
  const flow = liquidFlow(entries, accounts, range.from, range.to);
  const expenseCats = categoryBreakdown(entries, categories, 'expense', range.from, range.to);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byAcc = [...spendByAccount(entries, accounts, range.from, range.to).entries()];
  const accById = new Map(accounts.map((a) => [a.id, a]));
  // Cumulative savings line.
  let run = 0n;
  const cumulative = series.map((s) => (run += s.saved));
  const daily = dailySpend(entries, kindOf, range.from, range.to);
  const days = Math.max(1, Math.round((Date.parse(range.to < t ? range.to : t) - Date.parse(range.from)) / 86_400_000) + 1);
  const avgDaily = totals.grossSpend / BigInt(days);
  const busiest = [...daily.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1))[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">{range.label}</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Analytics</h1>
        </div>
        <Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: 'this_month', label: 'Month' }, { value: 'last_3_months', label: '3M' }, { value: 'last_6_months', label: '6M' }, { value: 'last_12_months', label: '12M' }, { value: 'financial_year', label: 'FY' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { l: 'Income', v: totals.income, c: 'text-mint' },
          { l: 'Your spending', v: totals.personalExpense, c: 'text-gold' },
          { l: 'Paid for others', v: totals.reimbursable, c: '' },
          { l: 'Saved', v: totals.saved, c: totals.saved < 0n ? 'text-coral' : 'text-mint' },
          { l: 'Avg / day (gross)', v: avgDaily, c: '' },
        ].map((x) => (
          <Plate key={x.l} className="p-4"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{x.l}</div><Money value={x.v} decimals={0} className={`mt-1 block font-display text-2xl font-semibold ${x.c}`} /></Plate>
        ))}
      </div>
      {entries.length === 0 && !q.isLoading ? <Plate><EmptyState icon="chart" title="No data in this period" /></Plate> : (
        <>
          <Plate className="p-6">
            <SectionTitle eyebrow="Monthly" title="Income vs spending" />
            <GroupedBars data={series.map((s) => ({ month: s.month, income: s.income, own: s.personalExpense, others: s.reimbursable }))} labelOf={(r) => formatMonth(r.month as string, false)} series={[{ key: 'income', label: 'Income', color: 'var(--color-mint)' }, { key: 'own', label: 'Your spending', color: 'var(--color-gold)' }, { key: 'others', label: 'For others', color: 'var(--color-sky)' }]} height={260} />
          </Plate>
          <div className="grid gap-6 lg:grid-cols-2">
            <Plate className="p-6">
              <SectionTitle eyebrow="Running total" title="Cumulative savings" />
              <AreaLine points={cumulative} labels={series.map((s) => formatMonth(s.month, false))} />
            </Plate>
            <Plate className="space-y-4 p-6">
              <SectionTitle eyebrow="Bank, cash & wallets" title="Real cash flow" />
              <div className="flex justify-between text-sm"><span className="text-mute">Came in</span><Money value={flow.inflow} className="font-bold text-mint" /></div>
              <div className="flex justify-between text-sm"><span className="text-mute">Went out</span><Money value={flow.outflow} className="font-bold" /></div>
              <div className="flex justify-between border-t border-line pt-3 text-sm"><span className="text-mute">Net</span><Money value={flow.net} className={`font-bold ${flow.net < 0n ? 'text-coral' : 'text-mint'}`} /></div>
              <p className="text-xs text-faint">Moves between your own accounts are excluded. Card spends show up here when you pay the bill.</p>
              <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                <div><div className="text-xs text-mute">Savings rate</div><div className="font-bold">{totals.income > 0n ? formatBps(totals.savingsRateBps, 0) : '—'}</div></div>
                <div><div className="text-xs text-mute">Biggest day</div><div className="font-bold">{busiest ? <><Money value={busiest[1]} decimals={0} /> <span className="text-xs font-normal text-faint">{busiest[0]}</span></> : '—'}</div></div>
                <div><div className="text-xs text-mute">Card payments</div><Money value={totals.cardRepayments} decimals={0} className="font-bold" /></div>
                <div><div className="text-xs text-mute">Paid back to you</div><Money value={totals.reimbursementsReceived} decimals={0} className="font-bold" /></div>
              </div>
            </Plate>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Plate className="p-6">
              <SectionTitle eyebrow="Your spending" title="Categories" />
              {expenseCats.length === 0 ? <EmptyState icon="pie" title="No spending" /> : (
                <div className="flex flex-col items-center gap-5 sm:flex-row">
                  <Donut slices={expenseCats.slice(0, 10).map((s) => ({ label: catById.get(s.categoryId)?.name ?? '?', value: s.amount, color: catById.get(s.categoryId)?.color ?? '#888' }))} center={<Money value={totals.personalExpense} compact className="font-display text-lg font-semibold" />} />
                  <ul className="w-full flex-1 space-y-1.5 text-sm">{expenseCats.slice(0, 10).map((s) => <li key={s.categoryId} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: catById.get(s.categoryId)?.color ?? '#888' }} /><span className="flex-1 truncate text-chalk-dim">{catById.get(s.categoryId)?.name}</span><span className="text-xs text-faint">{formatBps(s.shareBps, 0)}</span><Money value={s.amount} decimals={0} className="w-24 text-right font-semibold" /></li>)}</ul>
                </div>
              )}
            </Plate>
            <Plate className="p-6">
              <SectionTitle eyebrow="Where purchases were paid from" title="By account" />
              {byAcc.length === 0 ? <EmptyState icon="card" title="No purchases" /> : (
                <ul className="space-y-3">{byAcc.sort((a, b) => (b[1] > a[1] ? 1 : -1)).map(([id, v]) => <li key={id} className="flex items-center justify-between text-sm"><span className="font-semibold">{accById.get(id)?.nickname || accById.get(id)?.name}</span><Money value={v} decimals={0} className="font-bold" /></li>)}</ul>
              )}
              {position && <div className="mt-6 border-t border-line pt-4 text-xs text-faint">Net worth today: <Money value={position.netWorth} decimals={0} className="font-bold text-chalk" /></div>}
            </Plate>
          </div>
        </>
      )}
    </div>
  );
}
