import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatBps, groupOf, remainingTenure, splitEmi, totalInterestPayable } from '@folio/core';
import { usePosition } from '@folio/api';
import { FinanceCard } from '../src/components/cards';
import { Screen } from '../src/components/Screen';
import { Empty, Meter, Money, Plate, PopButton } from '../src/components/ui';
import { C, F } from '../src/lib/theme';

export default function Loans() {
  const { accounts, balances, position } = usePosition();
  const loans = accounts.filter((a) => groupOf(a) === 'loan' && a.status === 'active');
  return (
    <Screen back title="Loans & EMIs" eyebrow="Obligations" right={<PopButton size="sm" tone="mint" label="Add" icon="plus" onPress={() => router.push({ pathname: '/account-edit', params: { type: 'vehicle_loan' } })} />}>
      {position && <View style={{ paddingHorizontal: 20 }}><Money value={position.loanOutstanding} style={{ fontFamily: F.display, fontSize: 34, color: C.coral }} /><Text style={{ color: C.mute, fontFamily: F.sans }}>Principal outstanding</Text></View>}
      {loans.length === 0 && <Empty icon="loan" title="No loans" body="Add your two-wheeler, car, education or personal loans." />}
      <View style={{ gap: 22, marginTop: 20 }}>
        {loans.map((l) => {
          const out = balances.get(l.id)?.balance ?? 0n;
          const rate = l.loan?.interestRateBps ?? 0;
          const emi = l.loan?.emiAmount;
          const principal = l.loan?.principalAmount ?? 0n;
          return (
            <View key={l.id} style={{ paddingHorizontal: 20, gap: 12 }}>
              <View style={{ alignItems: 'center' }}><FinanceCard account={l} balance={out} onPress={() => router.push(`/account/${l.id}`)} /></View>
              <Plate style={{ padding: 16, gap: 10 }}>
                {principal > 0n && <><Meter bps={Number(((principal - out) * 10_000n) / principal)} /><Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{formatBps(Number(((principal - out) * 10_000n) / principal), 0)} repaid</Text></>}
                <Text style={{ color: C.chalkDim, fontFamily: F.sans }}>Rate {rate ? formatBps(rate, 2) : '—'} · EMI {emi ? <Money value={emi} decimals={0} style={{ fontSize: 14 }} /> : '—'}</Text>
                {emi && rate ? (() => { const s = splitEmi(emi, out, rate); return <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>Next EMI: <Money value={s.principal} decimals={0} style={{ fontSize: 12 }} /> principal + <Money value={s.interest} decimals={0} style={{ fontSize: 12, color: C.coral }} /> interest</Text>; })() : null}
                {emi ? <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{remainingTenure(out, rate, emi) ?? '—'} months left · interest to go {(() => { const v = totalInterestPayable(out, rate, emi); return v === null ? '—' : <Money value={v} decimals={0} style={{ fontSize: 12 }} />; })()}</Text> : null}
                <PopButton tone="mint" size="sm" label="Pay EMI" icon="check" onPress={() => router.push({ pathname: '/add', params: { kind: 'loan_payment', toAccountId: l.id, ...(l.loan?.emiAccountId ? { accountId: l.loan.emiAccountId } : {}) } })} />
              </Plate>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
