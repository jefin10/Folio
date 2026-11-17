import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accountMeta, canPayFrom, displayName, formatMoney, groupOf, intentFromEntry, matchByHint, monthlyInterest, parseQuickEntry, splitEvenly, sum, tryParseAmount, type Account, type Paise } from '@folio/core';
import { useBalances, useEntry, useLedgerContext, usePostIntent, useToday, useUpdateEntry } from '@folio/api';
import { AccountThumb } from '../src/components/cards';
import { payableAccounts } from '../src/lib/faces';
import { AmountInput, Avatar, Chip, CircleButton, Eyebrow, Field, Icon, Input, PopButton, Segmented } from '../src/components/ui';
import { success, warn } from '../src/lib/haptics';
import { C, F } from '../src/lib/theme';

type Kind = 'expense' | 'income' | 'transfer' | 'card_payment' | 'settle' | 'loan_payment';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'expense', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Move' },
  { value: 'card_payment', label: 'Pay card' },
  { value: 'settle', label: 'Settle' },
  { value: 'loan_payment', label: 'EMI' },
];
const plain = (p: Paise) => formatMoney(p, { symbol: '', decimals: 'auto' }).replace(/,/g, '');

function AccountChips({ accounts, value, onChange }: { accounts: Account[]; value: string | null; onChange: (id: string) => void }) {
  const balances = useBalances().data;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
      {accounts.map((a) => {
        const active = value === a.id;
        const bal = balances?.get(a.type === 'debit_card' && a.linkedAccountId ? a.linkedAccountId : a.id)?.balance;
        return (
          <Pressable key={a.id} onPress={() => onChange(a.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: active ? C.chalk : C.line, backgroundColor: active ? C.chalk : C.ink2 }}>
            <AccountThumb account={a} width={34} />
            <View>
              <Text style={{ color: active ? C.ink : C.chalk, fontFamily: F.bold, fontSize: 13 }}>{displayName(a)}</Text>
              <Text style={{ color: active ? 'rgba(0,0,0,0.55)' : C.mute, fontFamily: F.sans, fontSize: 11 }}>
                {groupOf(a) === 'credit' ? 'Card' : accountMeta(a.type).short}
                {bal !== undefined ? ` · ${formatMoney(bal, { decimals: 0 })}` : ''}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function Add() {
  const params = useLocalSearchParams<Record<string, string>>();
  const insets = useSafeAreaInsets();
  const t = useToday();
  const { ctx, accounts, categories, people } = useLedgerContext();
  const balances = useBalances().data;
  const post = usePostIntent();
  const update = useUpdateEntry();
  const editing = useEntry(params.editId ?? null).data ?? null;

  const [kind, setKind] = useState<Kind>((params.kind as Kind) ?? 'expense');
  const [amount, setAmount] = useState(params.amount ?? '');
  const [description, setDescription] = useState(params.description ?? '');
  const [accountId, setAccountId] = useState<string | null>(params.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(params.toAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [personId, setPersonId] = useState<string | null>(params.personId ?? null);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [interest, setInterest] = useState('');
  const [direction, setDirection] = useState<'received' | 'paid'>('received');
  const [quick, setQuick] = useState('');
  const [date, setDate] = useState(t);
  const [error, setError] = useState<string | null>(null);

  const active = accounts.filter((a) => a.status === 'active');
  // Each bank appears once, wearing its debit card as its face.
  const payFrom = payableAccounts(active).filter(canPayFrom);
  const liquid = active.filter((a) => a.class === 'asset' && a.type !== 'debit_card');
  const cards = active.filter((a) => groupOf(a) === 'credit');
  const loans = active.filter((a) => groupOf(a) === 'loan');
  const expenseCats = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const incomeCats = categories.filter((c) => c.kind === 'income' && !c.archived);
  const activePeople = people.filter((p) => !p.archived);

  // Sensible defaults: last-used style — first payable account.
  useEffect(() => {
    if (!accountId && !editing) {
      const first = kind === 'expense' ? payFrom[0] : liquid[0];
      if (first) setAccountId(first.id);
    }
  }, [kind, accountId, payFrom, liquid, editing]);

  useEffect(() => {
    if (!editing || !ctx) return;
    const it = intentFromEntry(editing, ctx);
    if (!it) return;
    setDescription(editing.description);
    setDate(editing.occurredOn);
    if (it.kind === 'expense') {
      setKind('expense');
      setAmount(plain(it.amount));
      setAccountId(it.accountId ?? null);
      setCategoryId(it.categoryId);
      setShares(Object.fromEntries((it.shares ?? []).map((s) => [s.personId, plain(s.amount)])));
    } else if (it.kind === 'income') {
      setKind('income');
      setAmount(plain(it.amount));
      setAccountId(it.accountId);
      setCategoryId(it.categoryId);
    } else if (it.kind === 'transfer') {
      setKind(ctx.accounts.get(it.toAccountId) && groupOf(ctx.accounts.get(it.toAccountId)!) === 'credit' ? 'card_payment' : 'transfer');
      setAmount(plain(it.amount));
      setAccountId(it.fromAccountId);
      setToAccountId(it.toAccountId);
    } else if (it.kind === 'loan_repayment') {
      setKind('loan_payment');
      setAmount(plain(it.amount));
      setAccountId(it.fromAccountId);
      setToAccountId(it.loanAccountId);
      setInterest(plain(it.interest));
    } else if (it.kind === 'reimbursement_received' || it.kind === 'reimbursement_paid') {
      setKind('settle');
      setDirection(it.kind === 'reimbursement_received' ? 'received' : 'paid');
      setAmount(plain(it.amount));
      setAccountId(it.accountId);
      setPersonId(it.personId);
    }
  }, [editing, ctx]);

  // EMI interest + card-due prefills.
  useEffect(() => {
    if (kind === 'loan_payment' && toAccountId && !interest) {
      const loan = loans.find((l) => l.id === toAccountId);
      const out = balances?.get(toAccountId)?.balance ?? 0n;
      const rate = loan?.loan?.interestRateBps;
      if (rate && out > 0n) setInterest(plain(monthlyInterest(out, rate)));
      if (!amount && loan?.loan?.emiAmount) setAmount(plain(loan.loan.emiAmount));
    }
    if (kind === 'card_payment' && toAccountId && !amount) {
      const out = balances?.get(toAccountId)?.balance;
      if (out && out > 0n) setAmount(plain(out));
    }
  }, [kind, toAccountId, balances, loans, interest, amount]);

  const total = tryParseAmount(amount) ?? 0n;
  const shareVals: Record<string, Paise> = Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, tryParseAmount(v) ?? 0n]));
  const shared = sum(Object.values(shareVals));
  const personal = total - shared;

  const fill = () => {
    const p = parseQuickEntry(quick, { accountNames: payFrom.flatMap((a) => [a.name, a.nickname ?? '']) });
    if (p.amount) setAmount(plain(p.amount));
    if (p.description) setDescription(p.description);
    if (p.isIncome) setKind('income');
    const acc = matchByHint(p.accountHint, payFrom, (a) => [a.name, a.nickname, a.institutionName]);
    if (acc) setAccountId(acc.id);
    const cat = matchByHint(p.description.split(' ')[0] ?? null, p.isIncome ? incomeCats : expenseCats, (c) => [c.name]);
    if (cat) setCategoryId(cat.id);
    const next: Record<string, string> = {};
    for (const s of p.shares) {
      const person = matchByHint(s.nameHint, activePeople, (x) => [x.name]);
      if (person && s.amount) next[person.id] = plain(s.amount);
    }
    if (Object.keys(next).length) setShares(next);
  };

  const valid = (() => {
    if (total <= 0n) return false;
    if (kind === 'expense') return !!accountId && !!categoryId && personal >= 0n;
    if (kind === 'income') return !!accountId && !!categoryId;
    if (kind === 'settle') return !!accountId && !!personId;
    return !!accountId && !!toAccountId && accountId !== toAccountId;
  })();

  const save = async () => {
    setError(null);
    const base = { occurredOn: date, description: description.trim() || undefined };
    const intent =
      kind === 'expense'
        ? { kind: 'expense' as const, accountId, amount: total, categoryId: categoryId!, shares: Object.entries(shareVals).filter(([, v]) => v > 0n).map(([personId, amount]) => ({ personId, amount })), ...base }
        : kind === 'income'
          ? { kind: 'income' as const, accountId: accountId!, amount: total, categoryId: categoryId!, ...base }
          : kind === 'settle'
            ? { kind: direction === 'received' ? ('reimbursement_received' as const) : ('reimbursement_paid' as const), accountId: accountId!, personId: personId!, amount: total, ...base }
            : kind === 'loan_payment'
              ? { kind: 'loan_repayment' as const, fromAccountId: accountId!, loanAccountId: toAccountId!, amount: total, interest: tryParseAmount(interest) ?? 0n, ...base }
              : { kind: 'transfer' as const, fromAccountId: accountId!, toAccountId: toAccountId!, amount: total, ...base };
    try {
      if (editing) await update.mutateAsync({ original: editing, intent, reason: 'Edited on phone' });
      else await post.mutateAsync({ ...intent, ...(params.ruleId && params.dueOn ? { recurring: { ruleId: params.ruleId, dueOn: params.dueOn } } : {}) });
      success();
      router.back();
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const fromList = kind === 'expense' ? payFrom : liquid;
  const toList = kind === 'card_payment' ? cards : kind === 'loan_payment' ? loans : active.filter((a) => a.id !== accountId && a.type !== 'debit_card');

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.ink1 }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow>{editing ? 'Correct entry' : params.ruleId ? 'Confirm payment' : 'New entry'}</Eyebrow>
        <CircleButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {!editing && !params.ruleId && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} active={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </ScrollView>
        )}

        {kind === 'expense' && !editing && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Input value={quick} onChangeText={setQuick} onSubmitEditing={fill} placeholder="Type it: 250 lunch on hdfc, rahul owes 125" returnKeyType="done" style={{ fontSize: 13 }} />
            </View>
            <PopButton size="sm" tone="dark" label="Fill" icon="flash" onPress={fill} disabled={!quick.trim()} />
          </View>
        )}

        <AmountInput value={amount} onChange={setAmount} big autoFocus={!editing && !params.amount} />

        {(kind === 'expense' || kind === 'income') && <Input value={description} onChangeText={setDescription} placeholder={kind === 'income' ? 'What was it for?' : 'What was it?'} maxLength={140} />}

        {kind === 'settle' && (
          <>
            <Segmented value={direction} onChange={setDirection} options={[{ value: 'received', label: 'They paid me' }, { value: 'paid', label: 'I paid them' }]} />
            <Field label="Person">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {activePeople.map((p) => (
                  <Pressable key={p.id} onPress={() => setPersonId(p.id)} style={{ alignItems: 'center', gap: 6, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: personId === p.id ? C.chalk : C.line, backgroundColor: personId === p.id ? C.ink3 : C.ink2 }}>
                    <Avatar name={p.name} color={p.color} emoji={p.emoji} size={40} />
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 12 }}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Field>
          </>
        )}

        <Field label={kind === 'expense' ? 'Paid with' : kind === 'income' || (kind === 'settle' && direction === 'received') ? 'Received in' : 'From'}>
          <AccountChips accounts={fromList} value={accountId} onChange={setAccountId} />
        </Field>

        {(kind === 'transfer' || kind === 'card_payment' || kind === 'loan_payment') && (
          <Field label={kind === 'card_payment' ? 'Card' : kind === 'loan_payment' ? 'Loan' : 'To'}>
            <AccountChips accounts={toList} value={toAccountId} onChange={setToAccountId} />
          </Field>
        )}

        {kind === 'loan_payment' && (
          <Field label="Interest portion" hint="Interest is an expense; the rest reduces principal.">
            <AmountInput value={interest} onChange={setInterest} />
          </Field>
        )}

        {(kind === 'expense' || kind === 'income') && (
          <Field label="Category">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(kind === 'income' ? incomeCats : expenseCats).map((c) => (
                <Chip key={c.id} label={c.name} color={c.color} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
              ))}
            </View>
          </Field>
        )}

        {kind === 'expense' && activePeople.length > 0 && (
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold }}>Paid for others?</Text>
              </View>
              {Object.keys(shares).length > 0 && total > 0n && (
                <Pressable
                  onPress={() => {
                    const ids = Object.keys(shares);
                    const parts = splitEvenly(total, ids.length + 1);
                    setShares(Object.fromEntries(ids.map((id, i) => [id, plain(parts[i + 1]!)])));
                  }}
                >
                  <Text style={{ color: C.mint, fontFamily: F.bold, fontSize: 12 }}>Split evenly</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activePeople.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  color={p.color}
                  active={p.id in shares}
                  onPress={() =>
                    setShares((s) => {
                      const n = { ...s };
                      if (p.id in n) delete n[p.id];
                      else n[p.id] = '';
                      return n;
                    })
                  }
                />
              ))}
            </View>
            {Object.keys(shares).map((pid) => {
              const p = activePeople.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={p.name} color={p.color} size={30} />
                  <Text style={{ flex: 1, color: C.chalk, fontFamily: F.semibold }}>{p.name} owes</Text>
                  <View style={{ width: 150 }}>
                    <AmountInput value={shares[pid] ?? ''} onChange={(v) => setShares((s) => ({ ...s, [pid]: v }))} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Field label="Date">
          <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        </Field>
        {error && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="alert" size={16} color={C.coral} />
            <Text style={{ color: C.coral, fontFamily: F.semibold, flex: 1 }}>{error}</Text>
          </View>
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 14, backgroundColor: C.ink1, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          {kind === 'expense' && total > 0n && (
            <>
              <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>Your share</Text>
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 15 }}>
                {formatMoney(personal < 0n ? 0n : personal)}
                {shared > 0n ? <Text style={{ color: C.mint }}> · {formatMoney(shared)} owed</Text> : null}
              </Text>
            </>
          )}
        </View>
        <PopButton tone="mint" size="lg" label={editing ? 'Save' : params.ruleId ? 'Mark paid' : 'Save'} onPress={save} disabled={!valid} loading={post.isPending || update.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}
