'use client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addMonths, amortizationSchedule, formatBps, formatDate, groupOf, makeDate, remainingTenure, splitEmi, totalInterestPayable, today } from '@folio/core';
import { useEntriesInRange, usePosition, useRules, useSaveRule } from '@folio/api';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { Badge, EmptyState, GhostButton, Meter, Money, Plate, PopButton, SectionTitle } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

export default function LoansPage() {
  const { accounts, balances, position } = usePosition();
  const rules = useRules().data ?? [];
  const saveRule = useSaveRule();
  const lookups = useLookups();
  const openEditor = useUi((s) => s.openAccountEditor);
  const openComposer = useUi((s) => s.openComposer);
  const loans = accounts.filter((a) => groupOf(a) === 'loan' && a.status === 'active');
  const [sel, setSel] = useState<string | null>(null);
  const loan = loans.find((l) => l.id === sel) ?? loans[0];
  const payments = useEntriesInRange({ accountId: loan?.id, types: ['loan_repayment', 'loan_disbursement'] }, !!loan);
  const out = loan ? balances.get(loan.id)?.balance ?? 0n : 0n;
  const rate = loan?.loan?.interestRateBps ?? 0;
  const emi = loan?.loan?.emiAmount ?? null;
  const schedule = useMemo(() => {
    if (!loan || !emi || out <= 0n) return [];
    const d = today();
    const day = loan.loan?.emiDay ?? Number(d.slice(8));
    let first = makeDate(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Math.min(day, 28));
    if (first <= d) first = addMonths(first, 1, day);
    const months = remainingTenure(out, rate, emi) ?? 0;
    return months ? amortizationSchedule(out, rate, months, first, emi) : [];
  }, [loan, emi, out, rate]);
  const hasRule = loan ? rules.some((r) => r.kind === 'emi' && r.targetAccountId === loan.id) : false;

  const createEmiRule = async () => {
    if (!loan || !emi) return;
    const d = today();
    const day = loan.loan?.emiDay ?? 5;
    let start = makeDate(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Math.min(day, 28));
    if (start < d) start = addMonths(start, 1, day);
    await saveRule.mutateAsync({ name: `${loan.nickname || loan.name} EMI`, kind: 'emi', amount: emi, isVariable: false, frequency: 'monthly', intervalDays: null, startOn: start, endOn: null, maxOccurrences: remainingTenure(out, rate, emi), dayOfMonth: day, sourceAccountId: loan.loan?.emiAccountId ?? null, targetAccountId: loan.id, categoryId: null, personId: null, reminderDaysBefore: 2, reminderTime: '09:00', isActive: true, bankAutopay: true, notes: null });
    toast.success('EMI reminder added', { description: 'Confirm each month when the EMI is debited.' });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Obligations</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Loans & EMIs</h1>
        </div>
        <PopButton tone="mint" icon="plus" onClick={() => openEditor({ type: 'vehicle_loan' })}>Add loan</PopButton>
      </div>
      {position && <Plate className="flex flex-wrap gap-8 p-5"><div><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Total principal outstanding</div><Money value={position.loanOutstanding} className="font-display text-3xl font-semibold text-coral" /></div><div><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Monthly EMIs</div><Money value={loans.reduce((s, l) => s + (l.loan?.emiAmount ?? 0n), 0n)} className="font-display text-3xl font-semibold" /></div></Plate>}
      {loans.length === 0 ? (
        <Plate><EmptyState icon="loan" title="No loans" body="Add two-wheeler, car, education, personal or home loans. EMIs split into principal and interest automatically." action={<PopButton tone="mint" icon="plus" onClick={() => openEditor({ type: 'vehicle_loan' })}>Add a loan</PopButton>} /></Plate>
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {loans.map((l) => (
              <div key={l.id} className="w-[300px] shrink-0"><FinanceCard account={l} balance={balances.get(l.id)?.balance ?? 0n} active={l.id === loan?.id} onClick={() => setSel(l.id)} /></div>
            ))}
          </div>
          {loan && (
            <div className="grid gap-6 lg:grid-cols-3">
              <Plate className="space-y-4 p-6">
                <SectionTitle eyebrow={loan.loan?.lender ?? loan.institutionName ?? 'Loan'} title={loan.nickname || loan.name} />
                {loan.loan?.principalAmount ? (
                  <div>
                    <Meter className="h-2" valueBps={Number(((loan.loan.principalAmount - out) * 10_000n) / loan.loan.principalAmount)} />
                    <div className="mt-1.5 flex justify-between text-xs text-mute"><span>Repaid <Money value={loan.loan.principalAmount - out} decimals={0} /></span><span>of <Money value={loan.loan.principalAmount} decimals={0} /></span></div>
                  </div>
                ) : null}
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-mute">Outstanding</dt><dd><Money value={out} className="font-bold" /></dd></div>
                  <div className="flex justify-between"><dt className="text-mute">Rate</dt><dd className="font-semibold">{rate ? `${formatBps(rate, 2)} p.a.` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-mute">EMI</dt><dd>{emi ? <Money value={emi} className="font-semibold" /> : '—'}</dd></div>
                  {emi && rate ? <div className="flex justify-between"><dt className="text-mute">Next EMI split</dt><dd className="text-xs">{(() => { const s = splitEmi(emi, out, rate); return <><Money value={s.principal} decimals={0} /> principal · <Money value={s.interest} decimals={0} /> interest</>; })()}</dd></div> : null}
                  <div className="flex justify-between"><dt className="text-mute">Months left</dt><dd className="font-semibold">{emi ? remainingTenure(out, rate, emi) ?? 'EMI too low' : '—'}</dd></div>
                  {emi ? <div className="flex justify-between"><dt className="text-mute">Interest still to pay</dt><dd>{(() => { const v = totalInterestPayable(out, rate, emi); return v === null ? '—' : <Money value={v} decimals={0} className="font-semibold text-coral" />; })()}</dd></div> : null}
                  <div className="flex justify-between"><dt className="text-mute">EMI day</dt><dd className="font-semibold">{loan.loan?.emiDay ?? '—'}</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2 pt-2">
                  <PopButton tone="mint" icon="check" onClick={() => openComposer({ kind: 'loan_payment', toAccountId: loan.id, accountId: loan.loan?.emiAccountId ?? undefined })}>Pay EMI</PopButton>
                  {!hasRule && emi && <PopButton tone="dark" icon="bell" onClick={createEmiRule} loading={saveRule.isPending}>Remind monthly</PopButton>}
                  {hasRule && <Badge tone="mint">Monthly reminder on</Badge>}
                  <GhostButton icon="settings" onClick={() => openEditor({ id: loan.id })}>Edit</GhostButton>
                </div>
              </Plate>
              <Plate className="p-6 lg:col-span-2">
                <SectionTitle eyebrow="Projection at current EMI" title="Repayment schedule" />
                {schedule.length === 0 ? <EmptyState icon="calendar" title="Set the EMI and rate to project the schedule" /> : (
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-ink-1 text-left text-[11px] tracking-[0.12em] text-mute uppercase"><tr><th className="py-2">#</th><th>Due</th><th className="text-right">EMI</th><th className="text-right">Interest</th><th className="text-right">Principal</th><th className="text-right">Left</th></tr></thead>
                      <tbody className="tnum">
                        {schedule.map((r) => (
                          <tr key={r.n} className="border-t border-line"><td className="py-2 text-faint">{r.n}</td><td>{formatDate(r.dueOn)}</td><td className="text-right"><Money value={r.emi} decimals={0} /></td><td className="text-right text-coral/80"><Money value={r.interest} decimals={0} /></td><td className="text-right"><Money value={r.principal} decimals={0} /></td><td className="text-right text-mute"><Money value={r.closing} decimals={0} /></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Plate>
              <Plate className="p-2 sm:p-3 lg:col-span-3">
                <div className="px-3 pt-3"><SectionTitle eyebrow="Payment history" title="Repayments" /></div>
                <EntryList entries={[...(payments.data ?? [])].reverse()} lookups={lookups} accountId={loan.id} loading={payments.isLoading} empty={<EmptyState icon="loan" title="No repayments recorded" />} />
              </Plate>
            </div>
          )}
        </>
      )}
    </div>
  );
}
