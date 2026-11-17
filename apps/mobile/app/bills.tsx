import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { FREQUENCY_LABEL, relativeDay, tryParseAmount, type Frequency, type RecurringKind } from '@folio/core';
import { useLedgerContext, useObligations, useSaveRule, useSkipOccurrence, useToday } from '@folio/api';
import { Screen } from '../src/components/Screen';
import { AmountInput, Badge, Chip, Empty, Field, Ghost, Icon, Input, Money, Plate, PopButton, Section } from '../src/components/ui';
import { success } from '../src/lib/haptics';
import { presetForDue } from '../src/lib/presets';
import { C, F } from '../src/lib/theme';

const KINDS: { k: RecurringKind; l: string }[] = [
  { k: 'subscription', l: 'Subscription' }, { k: 'emi', l: 'EMI' }, { k: 'rent', l: 'Rent' }, { k: 'mobile', l: 'Mobile' }, { k: 'electricity', l: 'Electricity' }, { k: 'internet', l: 'Internet' }, { k: 'insurance', l: 'Insurance' }, { k: 'card_autopay', l: 'Card autopay' }, { k: 'income', l: 'Income' }, { k: 'other', l: 'Other' },
];
const FREQS: Frequency[] = ['monthly', 'quarterly', 'yearly', 'weekly'];

export default function Bills() {
  const t = useToday();
  const { items, rules } = useObligations(60);
  const { accounts, categories } = useLedgerContext();
  const save = useSaveRule();
  const skip = useSkipOccurrence();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<RecurringKind>('subscription');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [start, setStart] = useState(t);
  const [src, setSrc] = useState<string | null>(null);
  const [dst, setDst] = useState<string | null>(null);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const needsTarget = kind === 'emi' || kind === 'card_autopay' || kind === 'income';
  const targets = accounts.filter((a) => a.status === 'active' && (kind === 'emi' ? a.class === 'liability' && a.loan : kind === 'card_autopay' ? a.card : a.class === 'asset' && a.type !== 'debit_card'));
  const cat = categories.find((c) => c.kind === (kind === 'income' ? 'income' : 'expense') && (kind === 'subscription' ? c.name === 'Subscriptions' : kind === 'rent' ? c.name === 'Rent' : kind === 'insurance' ? c.name === 'Insurance' : ['mobile', 'electricity', 'internet'].includes(kind) ? c.name === 'Bills & utilities' : kind === 'income' ? c.systemKey === 'salary' : c.systemKey === 'other_expense'));

  return (
    <Screen back title="Bills & autopay" eyebrow="Tracked and reminded — never auto-paid" right={<PopButton size="sm" tone="mint" label="Add" icon="plus" onPress={() => setAdding(true)} />}>
      {adding && (
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <Plate style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{KINDS.map((x) => <Chip key={x.k} label={x.l} active={kind === x.k} onPress={() => setKind(x.k)} />)}</View>
            <Field label="Name"><Input value={name} onChangeText={setName} placeholder="Netflix, rent, Jio…" /></Field>
            <Field label="Amount (blank if it varies)"><AmountInput value={amount} onChange={setAmount} /></Field>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{FREQS.map((f) => <Chip key={f} label={FREQUENCY_LABEL[f]} active={freq === f} onPress={() => setFreq(f)} />)}</View>
            <Field label="Next due date (YYYY-MM-DD)"><Input value={start} onChangeText={setStart} /></Field>
            <Field label={kind === 'income' ? 'Paid by' : 'Paid from'}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{accounts.filter((a) => a.status === 'active' && a.type !== 'debit_card').map((a) => <Chip key={a.id} label={a.nickname || a.name} active={src === a.id} onPress={() => setSrc(a.id)} />)}</View></Field>
            {needsTarget && <Field label={kind === 'emi' ? 'Loan' : kind === 'card_autopay' ? 'Card' : 'Received in'}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{targets.map((a) => <Chip key={a.id} label={a.nickname || a.name} active={dst === a.id} onPress={() => setDst(a.id)} />)}</View></Field>}
            <PopButton tone="mint" label="Save" disabled={!name.trim() || (needsTarget && !dst) || !/^\d{4}-\d{2}-\d{2}$/.test(start)} loading={save.isPending} onPress={async () => {
              const amt = tryParseAmount(amount);
              await save.mutateAsync({ name, kind, amount: amt, isVariable: !amt, frequency: freq, intervalDays: null, startOn: start, endOn: null, maxOccurrences: null, dayOfMonth: Number(start.slice(8)), sourceAccountId: src, targetAccountId: dst, categoryId: needsTarget && kind !== 'income' ? null : cat?.id ?? null, personId: null, reminderDaysBefore: 2, reminderTime: '09:00', isActive: true, bankAutopay: kind === 'emi' || kind === 'card_autopay', notes: null });
              success();
              setAdding(false);
              setName('');
              setAmount('');
            }} />
          </Plate>
        </View>
      )}
      <Section title="Timeline" eyebrow="Next 60 days">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ paddingHorizontal: 14 }}>
            {items.length === 0 ? <Empty icon="calendar" title="Nothing scheduled" /> : items.map((i, idx) => (
              <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: idx ? 1 : 0, borderTopColor: C.line }}>
                <Icon name={i.kind === 'emi' ? 'loan' : i.kind === 'income' ? 'arrowDown' : 'repeat'} size={18} color={i.state === 'overdue' ? C.coral : i.state === 'paid' ? C.mint : C.chalkDim} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.semibold, textDecorationLine: i.state === 'skipped' ? 'line-through' : 'none' }}>{i.name}</Text>
                  <Text style={{ color: i.state === 'overdue' ? C.coral : C.mute, fontFamily: F.sans, fontSize: 12 }}>{relativeDay(i.dueOn, t)}{ruleById.get(i.ruleId)?.bankAutopay ? ' · bank autopay' : ''}</Text>
                </View>
                {i.amount ? <Money value={i.amount} decimals={0} style={{ fontSize: 14 }} /> : <Badge label="Varies" />}
                {i.state === 'paid' ? <Badge label="Paid" tone="mint" /> : i.state === 'skipped' ? <Ghost label="Undo" onPress={() => skip.mutate({ ruleId: i.ruleId, dueOn: i.dueOn, undo: true })} /> : (
                  <View style={{ flexDirection: 'row' }}>
                    <Ghost label="Paid" color={C.mint} onPress={() => router.push({ pathname: '/add', params: presetForDue(i, ruleById.get(i.ruleId)) })} />
                    <Ghost label="Skip" onPress={() => skip.mutate({ ruleId: i.ruleId, dueOn: i.dueOn })} />
                  </View>
                )}
              </View>
            ))}
          </Plate>
        </View>
      </Section>
    </Screen>
  );
}
