import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { amortizationSchedule, formatBps, formatDate, remainingTenure, totalInterestPayable } from '@folio/core';
import { useObligations, useOccurrences, usePosition, useToday } from '@folio/api';
import { Screen } from '../../src/components/Screen';
import { CircleButton, Money, Plate, PopButton, Section, Skeleton } from '../../src/components/ui';
import { VaultSection } from '../../src/components/VaultSection';
import { faceOf, WalletCard } from '../../src/components/wallet';
import { loanDates } from '../../src/lib/emis';
import { presetForDue } from '../../src/lib/presets';
import { C, F } from '../../src/lib/theme';

const EMPTY: never[] = [];

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
      <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>{label}</Text>
      {typeof value === 'string' ? <Text style={{ color: C.chalk, fontFamily: F.bold }}>{value}</Text> : value}
    </View>
  );
}

export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useToday();
  const { accounts, balances } = usePosition();
  const { items, rules } = useObligations(45);
  const occurrences = useOccurrences().data ?? EMPTY;
  const loan = accounts.find((a) => a.id === id);
  if (!loan) return <Screen back><Skeleton height={220} style={{ margin: 20 }} /></Screen>;
  const rule = rules.find((r) => r.kind === 'emi' && r.targetAccountId === id && r.isActive);
  const { next, end } = loanDates(loan, rule, occurrences, t);
  const out = balances.get(id)?.balance ?? 0n;
  const emi = rule?.amount ?? loan.loan?.emiAmount ?? null;
  const rate = loan.loan?.interestRateBps ?? 0;
  const left = emi ? remainingTenure(out, rate, emi) : null;
  const interestLeft = emi ? totalInterestPayable(out, rate, emi) : null;
  const schedule = emi && next && out > 0n && left ? amortizationSchedule(out, rate, Math.min(left, 12), next, emi) : [];
  const dueItem = rule ? items.find((i) => i.ruleId === rule.id && i.state !== 'paid' && i.state !== 'skipped' && i.dueOn <= t) : undefined;

  return (
    <Screen back right={<CircleButton icon="settings" label="Edit loan" onPress={() => router.push({ pathname: '/account-edit', params: { id } })} />} bottomPad={60}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <WalletCard face={faceOf(loan)} />
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 22 }}>
        {[
          ['Principal left', out],
          ['EMI', emi ?? 0n],
        ].map(([l, v], i) => (
          <View key={l as string} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{(l as string).toUpperCase()}</Text>
            <Money value={v as bigint} decimals={0} style={{ fontFamily: F.extrabold, fontSize: 24, marginTop: 4, color: i ? C.chalk : C.coral }} />
          </View>
        ))}
      </View>

      <Section title="Schedule">
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Plate style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
            <Stat label="Next due" value={next ? formatDate(next) : '—'} />
            <Stat label="Last EMI" value={end ? formatDate(end) : '—'} />
            <Stat label="Months left" value={left !== null ? String(left) : '—'} />
            <Stat label="Interest still to pay" value={interestLeft !== null ? <Money value={interestLeft} decimals={0} style={{ fontSize: 15 }} /> : '—'} />
            <Stat label="Rate" value={rate ? `${formatBps(rate, 2)} p.a.` : '—'} />
          </Plate>
          {schedule.length > 0 && (
            <Plate style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
              {schedule.map((r) => (
                <View key={r.n} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 }}>
                  <Text style={{ width: 86, color: C.mute, fontFamily: F.semibold, fontSize: 12.5 }}>{formatDate(r.dueOn)}</Text>
                  <Money value={r.principal} decimals={0} style={{ flex: 1, fontSize: 13 }} />
                  <Money value={r.interest} decimals={0} style={{ fontSize: 13, color: C.coral }} />
                </View>
              ))}
            </Plate>
          )}
          {dueItem ? (
            <PopButton tone="mint" label="Mark EMI paid" icon="check" onPress={() => router.push({ pathname: '/add', params: presetForDue(dueItem, rule) })} />
          ) : (
            <PopButton tone="mint" label="Pay EMI" icon="check" onPress={() => router.push({ pathname: '/add', params: { kind: 'loan_payment', toAccountId: id, ...(loan.loan?.emiAccountId ? { accountId: loan.loan.emiAccountId } : {}) } })} />
          )}
        </View>
      </Section>

      <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
        <VaultSection accountId={id} fields={['accountNumber', 'customerId', 'notes']} />
      </View>
    </Screen>
  );
}
