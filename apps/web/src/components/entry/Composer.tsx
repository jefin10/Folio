'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  accountMeta,
  addDays,
  canPayFrom,
  canReceiveInto,
  displayName,
  findDuplicates,
  formatMoney,
  groupOf,
  intentFromEntry,
  matchByHint,
  monthlyInterest,
  parseQuickEntry,
  splitEvenly,
  sum,
  tryParseAmount,
  type Account,
  type Category,
  type Paise,
} from '@folio/core';
import { useBalances, useEntriesInRange, useEntry, useLedgerContext, usePostIntent, useToday, useUpdateEntry } from '@folio/api';
import { cx } from '@/lib/cx';
import { useUi, type ComposerKind } from '@/lib/store';
import { Icon } from '../ui/Icon';
import { AmountInput, Avatar, Chip, Field, PopButton, Segmented, Select, Sheet, TextInput } from '../ui/primitives';

const KINDS: { value: ComposerKind; label: string; icon: string }[] = [
  { value: 'expense', label: 'Spend', icon: 'arrowUp' },
  { value: 'income', label: 'Income', icon: 'arrowDown' },
  { value: 'transfer', label: 'Move', icon: 'swap' },
  { value: 'card_payment', label: 'Pay card', icon: 'card' },
  { value: 'reimbursement', label: 'Settle', icon: 'users' },
  { value: 'loan_payment', label: 'EMI', icon: 'loan' },
  { value: 'more', label: 'More', icon: 'dots' },
];

type MoreKind = 'refund' | 'interest_earned' | 'interest_charged' | 'bank_charges' | 'adjustment' | 'loan_disbursement' | 'bank_deposit' | 'bank_withdrawal';

function AccountPicker({ accounts, value, onChange, label }: { accounts: Account[]; value: string | null; onChange: (id: string) => void; label: string }) {
  const { balances } = { balances: useBalances().data };
  return (
    <Field label={label}>
      <div className="-mx-1 flex flex-wrap gap-2 px-1">
        {accounts.map((a) => {
          const g = groupOf(a);
          const bal = balances?.get(a.type === 'debit_card' ? a.linkedAccountId ?? '' : a.id)?.balance;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange(a.id)}
              className={cx(
                'flex min-w-[140px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98]',
                value === a.id ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2 hover:border-line-strong',
              )}
            >
              <span className="size-7 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${a.theme?.colors[0] ?? a.color ?? '#333'}, ${a.theme?.colors[2] ?? a.color ?? '#555'})` }} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold">{displayName(a)}</span>
                <span className={cx('tnum block text-[11px]', value === a.id ? 'text-ink/60' : 'text-mute')}>
                  {g === 'credit' ? 'Card' : accountMeta(a.type).short}
                  {bal !== undefined && ` · ${formatMoney(bal, { decimals: 0 })}`}
                </span>
              </span>
            </button>
          );
        })}
        {accounts.length === 0 && <div className="text-sm text-mute">No matching accounts yet.</div>}
      </div>
    </Field>
  );
}

function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <Field label="Category">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <Chip key={c.id} active={value === c.id} onClick={() => onChange(c.id)} color={c.color}>
            {c.name}
          </Chip>
        ))}
      </div>
    </Field>
  );
}

export function Composer() {
  const preset = useUi((s) => s.composer);
  const close = useUi((s) => s.closeComposer);
  const open = preset !== null;
  const t = useToday();
  const { ctx, accounts, categories, people } = useLedgerContext();
  const balances = useBalances().data;
  const post = usePostIntent();
  const update = useUpdateEntry();
  const editing = useEntry(preset?.editEntryId ?? null).data ?? null;

  const [kind, setKind] = useState<ComposerKind>('expense');
  const [more, setMore] = useState<MoreKind>('refund');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(t);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [quick, setQuick] = useState('');
  const [interest, setInterest] = useState('');
  const [fee, setFee] = useState('');
  const [direction, setDirection] = useState<'received' | 'paid'>('received');
  const [targetBalance, setTargetBalance] = useState('');

  useEffect(() => {
    if (!preset) return;
    setKind(preset.kind);
    setAmount(preset.amount ?? '');
    setDescription(preset.description ?? '');
    setDate(t);
    setAccountId(preset.accountId ?? null);
    setToAccountId(preset.toAccountId ?? null);
    setPersonId(preset.personId ?? null);
    setCategoryId(preset.categoryId ?? null);
    setShares({});
    setNotes('');
    setQuick('');
    setInterest('');
    setFee('');
    setTargetBalance('');
  }, [preset, t]);

  const plain = (p: Paise) => formatMoney(p, { symbol: '', decimals: 'auto' }).replace(/,/g, '');
  useEffect(() => {
    if (!editing || !ctx || !preset?.editEntryId) return;
    const it = intentFromEntry(editing, ctx);
    if (!it) return;
    setDate(it.occurredOn);
    setDescription(editing.description);
    setNotes(editing.notes ?? '');
    switch (it.kind) {
      case 'expense':
        setKind('expense');
        setAmount(plain(it.amount));
        setAccountId(it.accountId ?? null);
        setCategoryId(it.categoryId);
        setShares(Object.fromEntries((it.shares ?? []).map((s) => [s.personId, plain(s.amount)])));
        break;
      case 'income':
        setKind('income');
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        setCategoryId(it.categoryId);
        break;
      case 'transfer': {
        const to = ctx.accounts.get(it.toAccountId);
        setKind(to && groupOf(to as Account) === 'credit' ? 'card_payment' : 'transfer');
        setAmount(plain(it.amount));
        setAccountId(it.fromAccountId);
        setToAccountId(it.toAccountId);
        setFee(it.fee ? plain(it.fee) : '');
        break;
      }
      case 'loan_repayment':
        setKind('loan_payment');
        setAmount(plain(it.amount));
        setAccountId(it.fromAccountId);
        setToAccountId(it.loanAccountId);
        setInterest(plain(it.interest));
        break;
      case 'reimbursement_received':
      case 'reimbursement_paid':
        setKind('reimbursement');
        setDirection(it.kind === 'reimbursement_received' ? 'received' : 'paid');
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        setPersonId(it.personId);
        break;
      case 'refund':
        setKind('more');
        setMore('refund');
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        setCategoryId(it.categoryId);
        break;
      case 'interest':
        setKind('more');
        setMore(it.direction === 'earned' ? 'interest_earned' : 'interest_charged');
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        break;
      case 'bank_charges':
        setKind('more');
        setMore('bank_charges');
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        break;
      case 'bank_deposit':
      case 'bank_withdrawal':
        setKind('more');
        setMore(it.kind);
        setAmount(plain(it.amount));
        setAccountId(it.accountId);
        setCategoryId(it.categoryId ?? null);
        break;
      case 'loan_disbursement':
        setKind('more');
        setMore('loan_disbursement');
        setAmount(plain(it.amount));
        setToAccountId(it.loanAccountId);
        setAccountId(it.toAccountId ?? null);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, ctx, preset?.editEntryId]);

  const active = accounts.filter((a) => a.status === 'active');
  const payFrom = active.filter(canPayFrom);
  const liquid = active.filter((a) => a.class === 'asset' && a.type !== 'debit_card' && canReceiveInto(a));
  const cards = active.filter((a) => groupOf(a) === 'credit');
  const loans = active.filter((a) => groupOf(a) === 'loan');
  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const incomeCats = categories.filter((c) => c.kind === 'income' && !c.archived);
  const activePeople = people.filter((p) => !p.archived);

  const total = tryParseAmount(amount) ?? 0n;
  const shareValues: Record<string, Paise> = Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, tryParseAmount(v) ?? 0n]));
  const shared = sum(Object.values(shareValues));
  const personal = total - shared;

  // Smart default for the EMI interest split.
  const loan = loans.find((l) => l.id === toAccountId);
  useEffect(() => {
    if (kind !== 'loan_payment' || !loan || interest) return;
    const outstanding = balances?.get(loan.id)?.balance ?? 0n;
    const rate = loan.loan?.interestRateBps ?? loan.interestRateBps;
    if (rate && outstanding > 0n) setInterest(formatMoney(monthlyInterest(outstanding, rate), { symbol: '', decimals: 2 }).replace(/,/g, ''));
    if (!amount && loan.loan?.emiAmount) setAmount(formatMoney(loan.loan.emiAmount, { symbol: '', decimals: 2 }).replace(/,/g, ''));
  }, [kind, loan, balances, interest, amount]);

  // Pay-card default: the card's outstanding.
  useEffect(() => {
    if (kind !== 'card_payment' || !toAccountId || amount) return;
    const out = balances?.get(toAccountId)?.balance;
    if (out && out > 0n) setAmount(formatMoney(out, { symbol: '', decimals: 2 }).replace(/,/g, ''));
  }, [kind, toAccountId, balances, amount]);

  const nearby = useEntriesInRange({ from: addDays(date, -2), to: addDays(date, 2) }, open && kind === 'expense' && total > 0n);
  const dupes = useMemo(() => {
    if (kind !== 'expense' || total <= 0n || !nearby.data) return [];
    return findDuplicates({ amount: total, occurredOn: date, accountId: accounts.find((a) => a.id === accountId)?.type === 'debit_card' ? accounts.find((a) => a.id === accountId)?.linkedAccountId ?? null : accountId, description }, nearby.data);
  }, [kind, total, nearby.data, date, accountId, description, accounts]);

  const applyQuick = () => {
    const p = parseQuickEntry(quick, { accountNames: payFrom.flatMap((a) => [a.name, a.nickname ?? '']) });
    if (p.amount) setAmount(formatMoney(p.amount, { symbol: '', decimals: 'auto' }).replace(/,/g, ''));
    if (p.description) setDescription(p.description);
    if (p.isIncome) setKind('income');
    const acc = matchByHint(p.accountHint, payFrom, (a) => [a.name, a.nickname, a.institutionName]);
    if (acc) setAccountId(acc.id);
    const cat = matchByHint(p.description.split(' ')[0] ?? null, p.isIncome ? incomeCats : expenseCats, (c) => [c.name]);
    if (cat) setCategoryId(cat.id);
    const next: Record<string, string> = {};
    for (const s of p.shares) {
      const person = matchByHint(s.nameHint, activePeople, (x) => [x.name]);
      if (person && s.amount) next[person.id] = formatMoney(s.amount, { symbol: '', decimals: 'auto' }).replace(/,/g, '');
    }
    if (Object.keys(next).length) setShares(next);
  };

  const splitEven = () => {
    const ids = Object.keys(shares);
    if (!ids.length || total <= 0n) return;
    const parts = splitEvenly(total, ids.length + 1);
    setShares(Object.fromEntries(ids.map((id, i) => [id, formatMoney(parts[i + 1]!, { symbol: '', decimals: 'auto' }).replace(/,/g, '')])));
  };

  const buildIntent = () => {
    const base = { occurredOn: date, description: description.trim() || undefined, notes: notes || null };
    switch (kind) {
      case 'expense':
        return {
          kind: 'expense' as const,
          accountId,
          amount: total,
          categoryId: categoryId!,
          shares: Object.entries(shareValues)
            .filter(([, v]) => v > 0n)
            .map(([personId, amount]) => ({ personId, amount })),
          ...base,
        };
      case 'income':
        return { kind: 'income' as const, accountId: accountId!, amount: total, categoryId: categoryId!, ...base };
      case 'transfer':
      case 'card_payment':
        return { kind: 'transfer' as const, fromAccountId: accountId!, toAccountId: toAccountId!, amount: total, fee: tryParseAmount(fee) ?? 0n, ...base };
      case 'reimbursement':
        return { kind: direction === 'received' ? ('reimbursement_received' as const) : ('reimbursement_paid' as const), accountId: accountId!, personId: personId!, amount: total, ...base };
      case 'loan_payment':
        return { kind: 'loan_repayment' as const, fromAccountId: accountId!, loanAccountId: toAccountId!, amount: total, interest: tryParseAmount(interest) ?? 0n, ...base };
      case 'more':
        if (more === 'refund') return { kind: 'refund' as const, accountId: accountId!, amount: total, categoryId: categoryId!, ...base };
        if (more === 'interest_earned') return { kind: 'interest' as const, direction: 'earned' as const, accountId: accountId!, amount: total, ...base };
        if (more === 'interest_charged') return { kind: 'interest' as const, direction: 'charged' as const, accountId: accountId!, amount: total, ...base };
        if (more === 'bank_charges') return { kind: 'bank_charges' as const, accountId: accountId!, amount: total, ...base };
        if (more === 'loan_disbursement') return { kind: 'loan_disbursement' as const, loanAccountId: toAccountId!, toAccountId: accountId, amount: total, processingFee: tryParseAmount(fee) ?? 0n, ...base };
        if (more === 'bank_deposit') return { kind: 'bank_deposit' as const, accountId: accountId!, amount: total, categoryId, ...base };
        if (more === 'bank_withdrawal') return { kind: 'bank_withdrawal' as const, accountId: accountId!, amount: total, categoryId, ...base };
        {
          const current = balances?.get(accountId!)?.balance ?? 0n;
          return { kind: 'adjustment' as const, accountId: accountId!, currentBalance: current, targetBalance: tryParseAmount(targetBalance) ?? current, ...base };
        }
    }
  };

  const submit = async () => {
    if (!ctx) return;
    const intent = buildIntent();
    try {
      if (editing) {
        await update.mutateAsync({ original: editing, intent, reason: 'Edited' });
        toast.success('Corrected', { description: 'The previous version is kept in the entry history.' });
        close();
        return;
      }
      const res = await post.mutateAsync({ ...intent, ...(preset?.recurring ? { recurring: preset.recurring } : {}) });
      if (res.queued) toast('Saved offline', { description: 'It will sync as soon as you are back online.' });
      else if (!res.created) toast('Already recorded', { description: 'This exact entry was saved before — nothing duplicated.' });
      else toast.success('Recorded', { description: `${res.entry.description} · ${formatMoney(res.entry.amount)}` });
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const fromList = kind === 'expense' ? payFrom : kind === 'income' ? liquid : kind === 'reimbursement' ? liquid : kind === 'card_payment' || kind === 'loan_payment' ? liquid : kind === 'more' ? active.filter((a) => a.type !== 'debit_card') : active.filter((a) => a.type !== 'debit_card');
  const toList = kind === 'card_payment' ? cards : kind === 'loan_payment' ? loans : active.filter((a) => a.id !== accountId && a.type !== 'debit_card');

  const valid = (() => {
    if (kind === 'more' && more === 'adjustment') return !!accountId && tryParseAmount(targetBalance) !== null;
    if (total <= 0n) return false;
    switch (kind) {
      case 'expense':
        return !!accountId && !!categoryId && personal >= 0n;
      case 'income':
        return !!accountId && !!categoryId;
      case 'transfer':
      case 'card_payment':
      case 'loan_payment':
        return !!accountId && !!toAccountId && accountId !== toAccountId;
      case 'reimbursement':
        return !!accountId && !!personId;
      case 'more':
        if (more === 'refund') return !!accountId && !!categoryId;
        if (more === 'loan_disbursement') return !!toAccountId;
        return !!accountId;
    }
  })();

  return (
    <Sheet
      open={open}
      onClose={close}
      eyebrow={editing ? 'Correct entry' : preset?.recurring ? 'Confirm payment' : 'New entry'}
      title={kind === 'expense' ? 'Where did it go?' : kind === 'income' ? 'Money in' : kind === 'transfer' ? 'Move money' : kind === 'card_payment' ? 'Pay a card' : kind === 'reimbursement' ? 'Settle up' : kind === 'loan_payment' ? 'Loan payment' : 'Something else'}
      width={600}
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-mute">
            {kind === 'expense' && total > 0n && (
              <span>
                Your share <span className="tnum font-bold text-chalk">{formatMoney(personal < 0n ? 0n : personal)}</span>
                {shared > 0n && (
                  <>
                    {' '}
                    · owed to you <span className="tnum font-bold text-mint">{formatMoney(shared)}</span>
                  </>
                )}
              </span>
            )}
          </div>
          <PopButton tone="mint" size="lg" onClick={submit} disabled={!valid} loading={post.isPending || update.isPending}>
            {editing ? 'Save correction' : preset?.recurring ? 'Mark paid' : 'Save'}
          </PopButton>
        </div>
      }
    >
      {!preset?.recurring && !editing && (
        <div className="-mx-6 mb-5 overflow-x-auto px-6">
          <Segmented value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} size="sm" />
        </div>
      )}

      {kind === 'expense' && !preset?.recurring && !editing && (
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <Icon name="flash" size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-mint" />
            <TextInput value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyQuick()} placeholder='Type it: "10000 groceries on elite, parents owe 7000"' className="pl-9 text-[13px]" />
          </div>
          <PopButton tone="dark" size="sm" onClick={applyQuick} disabled={!quick.trim()} className="h-11">
            Fill
          </PopButton>
        </div>
      )}

      {kind === 'more' && (
        <Field label="Type" className="mb-5">
          <Select value={more} onChange={(e) => setMore(e.target.value as MoreKind)}>
            <option value="refund">Refund (money back on a purchase)</option>
            <option value="interest_earned">Interest earned (savings / FD)</option>
            <option value="interest_charged">Interest charged (card / loan)</option>
            <option value="bank_charges">Bank charges & fees</option>
            <option value="bank_deposit">Deposit from outside</option>
            <option value="bank_withdrawal">Withdrawal to outside</option>
            <option value="loan_disbursement">Loan disbursed</option>
            <option value="adjustment">Correct a balance</option>
          </Select>
        </Field>
      )}

      <div className="space-y-5">
        {!(kind === 'more' && more === 'adjustment') && (
          <Field label="Amount">
            <AmountInput value={amount} onChange={setAmount} autoFocus size="xl" />
            {amount && tryParseAmount(amount) === null && <span className="mt-1 block text-xs text-coral">Use up to two decimal places, e.g. 1250.50</span>}
          </Field>
        )}

        {kind === 'more' && more === 'adjustment' && (
          <Field label="Actual balance right now" hint={accountId && balances ? `Folio shows ${formatMoney(balances.get(accountId)?.balance ?? 0n)}. A correction entry will bridge the difference.` : undefined}>
            <AmountInput value={targetBalance} onChange={setTargetBalance} size="xl" />
          </Field>
        )}

        {(kind === 'expense' || kind === 'income' || kind === 'more') && (
          <Field label="Description">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'income' ? 'November salary' : 'Household groceries'} maxLength={140} />
          </Field>
        )}

        {kind === 'reimbursement' && (
          <>
            <Segmented
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'received', label: 'They paid me back' },
                { value: 'paid', label: 'I paid them' },
              ]}
            />
            <Field label="Person">
              <div className="flex flex-wrap gap-2">
                {activePeople.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPersonId(p.id)} className={cx('flex cursor-pointer items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold', personId === p.id ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2')}>
                    <Avatar name={p.name} color={p.color} emoji={p.emoji} size={26} />
                    {p.name}
                  </button>
                ))}
                {activePeople.length === 0 && <span className="text-sm text-mute">Add people in Reimbursements first.</span>}
              </div>
            </Field>
          </>
        )}

        {kind === 'more' && more === 'loan_disbursement' ? (
          <>
            <AccountPicker accounts={loans} value={toAccountId} onChange={setToAccountId} label="Loan" />
            <AccountPicker accounts={liquid} value={accountId} onChange={setAccountId} label="Credited to" />
          </>
        ) : (
          <AccountPicker
            accounts={fromList}
            value={accountId}
            onChange={setAccountId}
            label={kind === 'expense' ? 'Paid with' : kind === 'income' || (kind === 'reimbursement' && direction === 'received') ? 'Received in' : kind === 'more' ? 'Account' : 'From'}
          />
        )}

        {(kind === 'transfer' || kind === 'card_payment' || kind === 'loan_payment') && <AccountPicker accounts={toList} value={toAccountId} onChange={setToAccountId} label={kind === 'card_payment' ? 'Card' : kind === 'loan_payment' ? 'Loan' : 'To'} />}

        {kind === 'loan_payment' && (
          <Field label="Interest portion" hint="Interest is an expense; the rest reduces your principal. Pre-filled from the loan's rate.">
            <AmountInput value={interest} onChange={setInterest} />
          </Field>
        )}

        {(kind === 'transfer' || (kind === 'more' && more === 'loan_disbursement')) && (
          <Field label={kind === 'transfer' ? 'Transfer fee (optional)' : 'Processing fee (optional)'}>
            <AmountInput value={fee} onChange={setFee} />
          </Field>
        )}

        {(kind === 'expense' || (kind === 'more' && (more === 'refund' || more === 'bank_withdrawal'))) && <CategoryPicker categories={expenseCats} value={categoryId} onChange={setCategoryId} />}
        {(kind === 'income' || (kind === 'more' && more === 'bank_deposit')) && <CategoryPicker categories={incomeCats} value={categoryId} onChange={setCategoryId} />}

        {kind === 'expense' && (
          <div className="rounded-2xl border border-line bg-ink-2/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Paid for others?</div>
                <div className="text-xs text-mute">Their share becomes money owed to you — not your expense.</div>
              </div>
              {Object.keys(shares).length > 0 && (
                <button onClick={splitEven} className="cursor-pointer text-xs font-bold text-mint hover:underline">
                  Split evenly
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activePeople.map((p) => (
                <Chip
                  key={p.id}
                  active={p.id in shares}
                  color={p.color}
                  onClick={() =>
                    setShares((s) => {
                      const n = { ...s };
                      if (p.id in n) delete n[p.id];
                      else n[p.id] = '';
                      return n;
                    })
                  }
                >
                  {p.name}
                </Chip>
              ))}
              {activePeople.length === 0 && <span className="text-xs text-mute">Add people (parents, friends, roommates) in Reimbursements.</span>}
            </div>
            {Object.keys(shares).length > 0 && (
              <div className="mt-4 space-y-2">
                {Object.keys(shares).map((pid) => {
                  const p = activePeople.find((x) => x.id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex items-center gap-3">
                      <Avatar name={p.name} color={p.color} emoji={p.emoji} size={30} />
                      <span className="flex-1 text-sm font-semibold">{p.name} owes</span>
                      <div className="w-40">
                        <AmountInput value={shares[pid] ?? ''} onChange={(v) => setShares((s) => ({ ...s, [pid]: v }))} />
                      </div>
                    </div>
                  );
                })}
                {personal < 0n && <div className="text-xs text-coral">Shares add up to more than the total.</div>}
              </div>
            )}
          </div>
        )}

        {dupes.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/8 p-3 text-sm">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-gold" />
            <div>
              <div className="font-bold text-gold">Looks like a possible duplicate</div>
              <div className="text-xs text-chalk-dim">{dupes[0]!.reason}. Save anyway if this is a separate purchase.</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <TextInput type="date" value={date} max={addDays(t, 365)} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
