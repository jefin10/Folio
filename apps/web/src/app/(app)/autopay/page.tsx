'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FREQUENCY_LABEL, RECURRING_KINDS, formatDate, formatMoney, groupOf, nextDue, relativeDay, tryParseAmount, upcomingObligations, type Frequency, type RecurringKind, type RecurringRule } from '@folio/core';
import { useDeleteRule, useLedgerContext, useOccurrences, useRules, useSaveRule, useSkipOccurrence, useToday } from '@folio/api';
import { Icon } from '@/components/ui/Icon';
import { AmountInput, Badge, EmptyState, Field, GhostButton, Money, Plate, PopButton, SectionTitle, Segmented, Select, Sheet, TextInput, Toggle } from '@/components/ui/primitives';
import { presetForDue } from '@/lib/obligations';
import { useUi } from '@/lib/store';

const KIND_LABEL: Record<RecurringKind, string> = {
  emi: 'Loan EMI', subscription: 'Subscription', insurance: 'Insurance premium', mobile: 'Mobile bill', electricity: 'Electricity', internet: 'Internet', rent: 'Rent', card_autopay: 'Credit card autopay', sip: 'SIP / investment', income: 'Recurring income', transfer: 'Transfer', other: 'Other',
};
const KIND_ICON: Partial<Record<RecurringKind, string>> = { emi: 'loan', subscription: 'repeat', insurance: 'shield', mobile: 'bolt', electricity: 'bolt', internet: 'link', rent: 'key', card_autopay: 'card', sip: 'chart', income: 'arrowDown', transfer: 'swap' };

function blank(t: string): Omit<RecurringRule, 'id'> & { id?: string } {
  return { name: '', kind: 'subscription', amount: null, isVariable: false, frequency: 'monthly', intervalDays: null, startOn: t, endOn: null, maxOccurrences: null, dayOfMonth: null, sourceAccountId: null, targetAccountId: null, categoryId: null, personId: null, reminderDaysBefore: 1, reminderTime: '09:00', isActive: true, bankAutopay: false, notes: null };
}

function RuleEditor({ rule, onClose }: { rule: (Omit<RecurringRule, 'id'> & { id?: string }) | null; onClose: () => void }) {
  const { accounts, categories } = useLedgerContext();
  const save = useSaveRule();
  const del = useDeleteRule();
  const [r, setR] = useState(rule);
  const [amount, setAmount] = useState('');
  useEffect(() => {
    setR(rule);
    setAmount(rule?.amount ? formatMoney(rule.amount, { symbol: '', decimals: 'auto' }).replace(/,/g, '') : '');
  }, [rule]);
  if (!r) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = <K extends keyof RecurringRule>(k: K, v: RecurringRule[K]) => setR({ ...r, [k]: v });
  const sources = accounts.filter((a) => a.status === 'active' && a.type !== 'debit_card' && (r.kind === 'income' ? a.class === 'asset' : true));
  const targets = accounts.filter((a) => a.status === 'active' && (r.kind === 'emi' ? groupOf(a) === 'loan' : r.kind === 'card_autopay' ? groupOf(a) === 'credit' : a.class === 'asset' && a.type !== 'debit_card'));
  const cats = categories.filter((c) => c.kind === (r.kind === 'income' ? 'income' : 'expense') && !c.archived);
  const needsTarget = r.kind === 'emi' || r.kind === 'card_autopay' || r.kind === 'transfer' || r.kind === 'sip' || r.kind === 'income';
  const needsCategory = !['emi', 'card_autopay', 'transfer', 'sip'].includes(r.kind);
  const parsed = tryParseAmount(amount);
  const valid = r.name.trim() && (r.isVariable || (parsed && parsed > 0n)) && (!needsTarget || r.targetAccountId) && (r.frequency !== 'custom_days' || (r.intervalDays ?? 0) > 0);

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={r.id ? 'Edit' : 'New recurring payment'}
      title={r.name || KIND_LABEL[r.kind]}
      width={600}
      footer={
        <div className="flex items-center justify-between gap-3">
          {r.id ? <GhostButton icon="trash" onClick={async () => { await del.mutateAsync(r.id!); toast('Removed'); onClose(); }}>Delete</GhostButton> : <span />}
          <PopButton tone="mint" size="lg" disabled={!valid} loading={save.isPending} onClick={async () => { await save.mutateAsync({ ...r, amount: r.isVariable && !parsed ? null : parsed }); toast.success('Saved'); onClose(); }}>Save</PopButton>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="What is it?">
          <div className="flex flex-wrap gap-1.5">
            {RECURRING_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setR({ ...r, kind: k, bankAutopay: k === 'emi' || k === 'card_autopay' ? true : r.bankAutopay })} className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${r.kind === k ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2 text-chalk-dim'}`}>
                <Icon name={KIND_ICON[k] ?? 'repeat'} size={13} />
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name"><TextInput value={r.name} onChange={(e) => set('name', e.target.value)} placeholder="Netflix, Jio postpaid, Rent…" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount"><AmountInput value={amount} onChange={setAmount} /></Field>
          <div className="pt-6"><Toggle checked={r.isVariable} onChange={(v) => set('isVariable', v)} label="Amount varies" description="Confirm the actual amount each time" /></div>
          <Field label="How often">
            <Select value={r.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          {r.frequency === 'custom_days' ? (
            <Field label="Every N days"><TextInput inputMode="numeric" value={r.intervalDays ?? ''} onChange={(e) => set('intervalDays', Number(e.target.value.replace(/\D/g, '')) || null)} /></Field>
          ) : (
            <Field label="Next due date"><TextInput type="date" value={r.startOn} onChange={(e) => setR({ ...r, startOn: e.target.value, dayOfMonth: Number(e.target.value.slice(8)) })} /></Field>
          )}
          {r.frequency === 'custom_days' && <Field label="First due date"><TextInput type="date" value={r.startOn} onChange={(e) => set('startOn', e.target.value)} /></Field>}
          <Field label="Ends (optional)"><TextInput type="date" value={r.endOn ?? ''} onChange={(e) => set('endOn', e.target.value || null)} /></Field>
        </div>
        <Field label={r.kind === 'income' ? 'Paid by (optional)' : 'Paid from'}>
          <Select value={r.sourceAccountId ?? ''} onChange={(e) => set('sourceAccountId', e.target.value || null)}>
            <option value="">—</option>
            {sources.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.name}</option>)}
          </Select>
        </Field>
        {needsTarget && (
          <Field label={r.kind === 'emi' ? 'Loan' : r.kind === 'card_autopay' ? 'Card' : r.kind === 'income' ? 'Received in' : 'To account'}>
            <Select value={r.targetAccountId ?? ''} onChange={(e) => set('targetAccountId', e.target.value || null)}>
              <option value="">Choose…</option>
              {targets.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.name}</option>)}
            </Select>
          </Field>
        )}
        {needsCategory && (
          <Field label="Category">
            <Select value={r.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Remind me (days before)"><TextInput inputMode="numeric" value={r.reminderDaysBefore} onChange={(e) => set('reminderDaysBefore', Math.min(30, Number(e.target.value.replace(/\D/g, '')) || 0))} /></Field>
          <Field label="At"><TextInput type="time" value={r.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} /></Field>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line px-4">
          <Toggle checked={r.bankAutopay} onChange={(v) => set('bankAutopay', v)} label="Auto-debited by my bank" description="Informational. Folio never moves money; you confirm once it's debited." />
          <Toggle checked={r.isActive} onChange={(v) => set('isActive', v)} label="Active" />
        </div>
        <Field label="Notes"><TextInput value={r.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} /></Field>
      </div>
    </Sheet>
  );
}

export default function AutopayPage() {
  const t = useToday();
  const rules = useRules().data ?? [];
  const occurrences = useOccurrences().data ?? [];
  const skip = useSkipOccurrence();
  const { accounts } = useLedgerContext();
  const openComposer = useUi((s) => s.openComposer);
  const [editing, setEditing] = useState<(Omit<RecurringRule, 'id'> & { id?: string }) | null>(null);
  const [horizon, setHorizon] = useState<'30' | '60' | '90'>('30');
  const items = upcomingObligations(rules, occurrences, t, Number(horizon));
  const open = items.filter((i) => i.state !== 'paid' && i.state !== 'skipped');
  const accName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.nickname || accounts.find((a) => a.id === id)?.name : null);
  const monthlyOut = rules.filter((r) => r.isActive && r.kind !== 'income' && r.amount).reduce((s, r) => {
    const per = r.frequency === 'monthly' ? r.amount! : r.frequency === 'yearly' ? r.amount! / 12n : r.frequency === 'quarterly' ? r.amount! / 3n : r.frequency === 'half_yearly' ? r.amount! / 6n : r.frequency === 'weekly' ? (r.amount! * 52n) / 12n : r.frequency === 'biweekly' ? (r.amount! * 26n) / 12n : r.frequency === 'bimonthly' ? r.amount! / 2n : 0n;
    return s + per;
  }, 0n);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Tracked & reminded — never auto-paid</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Bills & autopay</h1>
        </div>
        <PopButton tone="mint" icon="plus" onClick={() => setEditing(blank(t))}>Add recurring</PopButton>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Due in {horizon} days</div><Money value={open.filter((i) => i.kind !== 'income').reduce((s, i) => s + (i.amount ?? 0n), 0n)} className="mt-1 block font-display text-3xl font-semibold" /></Plate>
        <Plate className="p-5"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Per month, on average</div><Money value={monthlyOut} decimals={0} className="mt-1 block font-display text-3xl font-semibold" /></Plate>
        <Plate className="col-span-2 p-5 sm:col-span-1"><div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Overdue</div><div className="mt-1 font-display text-3xl font-semibold text-coral">{items.filter((i) => i.state === 'overdue').length}</div></Plate>
      </div>

      <Plate className="p-6">
        <SectionTitle title="Timeline" action={<Segmented size="sm" value={horizon} onChange={setHorizon} options={[{ value: '30', label: '30d' }, { value: '60', label: '60d' }, { value: '90', label: '90d' }]} />} />
        {items.length === 0 ? <EmptyState icon="calendar" title="Nothing scheduled" body="Add EMIs, subscriptions, insurance, bills, rent or card autopay." /> : (
          <ol className="relative space-y-1 border-l border-line pl-6">
            {items.map((i) => {
              const rule = rules.find((r) => r.id === i.ruleId);
              return (
                <li key={i.key} className="relative flex flex-wrap items-center gap-3 rounded-xl py-2.5 pr-2">
                  <span className={`absolute top-1/2 -left-[31px] size-3 -translate-y-1/2 rounded-full border-2 border-ink ${i.state === 'paid' ? 'bg-mint' : i.state === 'overdue' ? 'bg-coral' : i.state === 'due_today' ? 'bg-gold' : i.state === 'skipped' ? 'bg-faint' : 'bg-ink-4'}`} />
                  <div className="w-24 text-xs font-semibold text-mute">{formatDate(i.dueOn).slice(0, 5)}<div className="text-[11px] font-normal text-faint">{relativeDay(i.dueOn, t)}</div></div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${i.state === 'skipped' ? 'line-through opacity-50' : ''}`}>{i.name}</div>
                    <div className="text-xs text-mute">{KIND_LABEL[i.kind]}{accName(i.sourceAccountId) ? ` · from ${accName(i.sourceAccountId)}` : ''}{rule?.bankAutopay ? ' · bank autopay' : ''}</div>
                  </div>
                  {i.amount ? <Money value={i.amount} className="text-sm font-bold" /> : <Badge>Variable</Badge>}
                  {i.state === 'paid' ? <Badge tone="mint">Paid</Badge> : i.state === 'skipped' ? (
                    <GhostButton onClick={() => skip.mutate({ ruleId: i.ruleId, dueOn: i.dueOn, undo: true })}>Undo skip</GhostButton>
                  ) : (
                    <div className="flex gap-1">
                      <PopButton size="sm" tone={i.state === 'overdue' ? 'coral' : 'chalk'} onClick={() => openComposer(presetForDue(i, rule))}>{i.kind === 'income' ? 'Received' : 'Mark paid'}</PopButton>
                      <GhostButton onClick={() => skip.mutate({ ruleId: i.ruleId, dueOn: i.dueOn })}>Skip</GhostButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Plate>

      <Plate className="p-6">
        <SectionTitle title="All recurring" />
        {rules.length === 0 ? <EmptyState icon="repeat" title="None yet" /> : (
          <ul className="divide-y divide-line">
            {rules.map((r) => {
              const nd = nextDue(r, occurrences, t);
              return (
                <li key={r.id} className={`flex items-center gap-3 py-3 ${r.isActive ? '' : 'opacity-45'}`}>
                  <span className="grid size-9 place-items-center rounded-lg bg-ink-3"><Icon name={KIND_ICON[r.kind] ?? 'repeat'} size={17} /></span>
                  <button onClick={() => setEditing(r)} className="min-w-0 flex-1 cursor-pointer text-left">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="text-xs text-mute">{FREQUENCY_LABEL[r.frequency]}{nd ? ` · next ${relativeDay(nd, t)}` : ' · ended'}</div>
                  </button>
                  {r.bankAutopay && <Badge tone="sky">Autopay</Badge>}
                  {r.amount ? <Money value={r.amount} className="text-sm font-bold" /> : <Badge>Variable</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Plate>
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
