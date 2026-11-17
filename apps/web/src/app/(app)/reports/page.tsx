'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { entriesToCsv, financialYear, formatMonth, monthlySeries, periodRange, periodTotals, toJsonSafe, type PeriodPreset } from '@folio/core';
import { repo, useCategories, useEntriesInRange, useFolio, useLedgerContext, usePosition, useToday } from '@folio/api';
import { Field, Money, Plate, PopButton, SectionTitle, Select } from '@/components/ui/primitives';

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const t = useToday();
  const { sb } = useFolio();
  const [period, setPeriod] = useState<PeriodPreset>('financial_year');
  const range = periodRange(period, t);
  const categories = useCategories().data ?? [];
  const { accounts, people } = useLedgerContext();
  const { position } = usePosition();
  const entries = useEntriesInRange({ from: range.from, to: range.to, includeVoid: false }).data ?? [];
  const kindOf = (id: string) => categories.find((c) => c.id === id)?.kind;
  const totals = periodTotals(entries, kindOf, range.from, range.to);
  const series = monthlySeries(entries, kindOf, range.from, range.to < t ? range.to : t);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Your data, portable</div>
        <h1 className="mt-1 font-display text-4xl font-semibold">Reports & export</h1>
      </div>
      <Plate className="space-y-6 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Period" className="w-60">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodPreset)}>
              <option value="financial_year">{financialYear(t).label} (financial year)</option>
              <option value="this_year">This calendar year</option>
              <option value="last_12_months">Last 12 months</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="all_time">All time</option>
            </Select>
          </Field>
          <PopButton tone="mint" icon="download" onClick={() => download(`folio-ledger-${range.from}-to-${range.to}.csv`, entriesToCsv(entries, { accounts, categories, people }), 'text/csv')}>Ledger CSV</PopButton>
          <PopButton
            tone="dark"
            icon="download"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const all = await repo.exportEverything(sb);
                download(`folio-backup-${t}.json`, JSON.stringify(toJsonSafe(all), null, 2), 'application/json');
                toast.success('Full backup downloaded');
              } finally {
                setBusy(false);
              }
            }}
          >
            Full backup (JSON)
          </PopButton>
        </div>
        <SectionTitle eyebrow={range.label} title="Summary" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><div className="text-xs text-mute">Income</div><Money value={totals.income} className="text-xl font-bold text-mint" /></div>
          <div><div className="text-xs text-mute">Your spending</div><Money value={totals.personalExpense} className="text-xl font-bold" /></div>
          <div><div className="text-xs text-mute">Paid for others</div><Money value={totals.reimbursable} className="text-xl font-bold" /></div>
          <div><div className="text-xs text-mute">Saved</div><Money value={totals.saved} className="text-xl font-bold" /></div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] tracking-[0.12em] text-mute uppercase"><tr><th className="py-2">Month</th><th className="text-right">Income</th><th className="text-right">Spending</th><th className="text-right">For others</th><th className="text-right">Paid back</th><th className="text-right">Saved</th></tr></thead>
          <tbody className="tnum">
            {series.map((s) => (
              <tr key={s.month} className="border-t border-line"><td className="py-2 font-semibold">{formatMonth(s.month)}</td><td className="text-right"><Money value={s.income} /></td><td className="text-right"><Money value={s.personalExpense} /></td><td className="text-right"><Money value={s.reimbursable} /></td><td className="text-right"><Money value={s.reimbursementsReceived} /></td><td className={`text-right font-bold ${s.saved < 0n ? 'text-coral' : ''}`}><Money value={s.saved} /></td></tr>
            ))}
          </tbody>
        </table>
      </Plate>
      {position && (
        <Plate className="p-6">
          <SectionTitle eyebrow="Today" title="Balance sheet" />
          <div className="grid gap-6 sm:grid-cols-2">
            <dl className="space-y-2 text-sm">
              {[['Bank', position.bankBalance], ['Cash', position.cash], ['Wallets', position.wallets], ['Deposits', position.deposits], ['Other assets', position.otherAssets], ['Owed to you', position.receivables]].map(([l, v]) => <div key={l as string} className="flex justify-between"><dt className="text-mute">{l as string}</dt><dd><Money value={v as bigint} /></dd></div>)}
            </dl>
            <dl className="space-y-2 text-sm">
              {[['Credit cards', position.creditOutstanding], ['Loans', position.loanOutstanding], ['Other liabilities', position.otherLiabilities], ['You owe people', position.payables]].map(([l, v]) => <div key={l as string} className="flex justify-between"><dt className="text-mute">{l as string}</dt><dd><Money value={v as bigint} className="text-coral" /></dd></div>)}
              <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Net worth</dt><dd><Money value={position.netWorth} /></dd></div>
            </dl>
          </div>
        </Plate>
      )}
    </div>
  );
}
