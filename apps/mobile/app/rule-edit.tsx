import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDate, formatMoney, FREQUENCY_LABEL, parseFlexibleDate, today, tryParseAmount, type Frequency, type RecurringKind } from '@folio/core';
import { useLedgerContext, useRules, useSaveRule } from '@folio/api';
import { AmountInput, Chip, CircleButton, Field, Input, PopButton } from '../src/components/ui';
import { success, warn } from '../src/lib/haptics';
import { C, F } from '../src/lib/theme';

const FREQS: Frequency[] = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'weekly'];

/** Add or edit a subscription (or any recurring payment). Tracked and reminded, never auto-paid. */
export default function RuleEdit() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const insets = useSafeAreaInsets();
  const { accounts, categories } = useLedgerContext();
  const rules = useRules().data ?? [];
  const save = useSaveRule();
  const existing = params.id ? rules.find((r) => r.id === params.id) : undefined;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [next, setNext] = useState(formatDate(today()));
  const [end, setEnd] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setAmount(existing.amount ? formatMoney(existing.amount, { symbol: '', decimals: 'auto' }).replace(/,/g, '') : '');
    setFrequency(existing.frequency);
    setNext(formatDate(existing.startOn));
    setEnd(existing.endOn ? formatDate(existing.endOn) : '');
    setSource(existing.sourceAccountId);
  }, [existing]);

  const payFrom = accounts.filter((a) => a.status === 'active' && a.type !== 'debit_card' && ['savings', 'current', 'salary', 'wallet', 'cash', 'credit_card', 'secured_credit_card', 'bnpl'].includes(a.type));
  const kind = (existing?.kind ?? params.kind ?? 'subscription') as RecurringKind;
  const category = categories.find((c) => c.kind === 'expense' && c.name === 'Subscriptions') ?? categories.find((c) => c.systemKey === 'other_expense');

  const submit = async () => {
    setError(null);
    const start = parseFlexibleDate(next);
    const endOn = end.trim() ? parseFlexibleDate(end) : null;
    const amt = tryParseAmount(amount);
    if (!name.trim()) return setError('Name it');
    if (!amt || amt <= 0n) return setError('Enter the amount');
    if (!start) return setError('Next due date as DD/MM/YYYY');
    if (end.trim() && !endOn) return setError('End date as DD/MM/YYYY');
    if (endOn && endOn < start) return setError('End date is before the next due date');
    try {
      await save.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        kind,
        amount: amt,
        isVariable: false,
        frequency,
        intervalDays: null,
        startOn: start,
        endOn,
        maxOccurrences: null,
        dayOfMonth: Number(start.slice(8)),
        sourceAccountId: source,
        targetAccountId: existing?.targetAccountId ?? null,
        categoryId: existing?.categoryId ?? category?.id ?? null,
        personId: null,
        reminderDaysBefore: existing?.reminderDaysBefore ?? 2,
        reminderTime: existing?.reminderTime ?? '09:00',
        isActive: true,
        bankAutopay: existing?.bankAutopay ?? false,
        notes: existing?.notes ?? null,
      });
      success();
      router.back();
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.ink1 }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.chalk, fontFamily: F.extrabold, fontSize: 22 }}>{existing ? 'Edit' : 'New subscription'}</Text>
        <CircleButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="Netflix" maxLength={60} />
        </Field>
        <Field label="Amount">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="How often">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FREQS.map((f) => (
              <Chip key={f} label={FREQUENCY_LABEL[f]} active={frequency === f} onPress={() => setFrequency(f)} />
            ))}
          </View>
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Next due">
              <Input value={next} onChangeText={setNext} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Ends">
              <Input value={end} onChangeText={setEnd} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
            </Field>
          </View>
        </View>
        <Field label="Paid from">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {payFrom.map((a) => (
              <Chip key={a.id} label={a.nickname || a.name} active={source === a.id} onPress={() => setSource(a.id)} />
            ))}
          </View>
        </Field>
        {error && <Text style={{ color: C.coral, fontFamily: F.semibold }}>{error}</Text>}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 14, backgroundColor: C.ink1, borderTopWidth: 1, borderTopColor: C.line }}>
        <PopButton tone="mint" size="lg" label="Save" onPress={submit} loading={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}
