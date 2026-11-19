import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { addMonths, categoryBreakdown, endOfMonth, formatMonth, groupOf, growGroupOf, growStats, monthRange, startOfMonth, formatDate, formatMoney } from '@folio/core';
import { useCategories, useEntriesInRange, useObligations, usePosition, useToday } from '@folio/api';
import { Bars } from '../../src/components/charts';
import { Screen } from '../../src/components/Screen';
import { CircleButton, Meter, Money, Plate, Section, Skeleton } from '../../src/components/ui';
import { BANK_FIELDS, BANK_WITH_DEBIT_FIELDS, VaultSection } from '../../src/components/VaultSection';
import { faceOf, WalletCard } from '../../src/components/wallet';
import { bankFace, debitCardsOf } from '../../src/lib/faces';
import { C, F } from '../../src/lib/theme';

const W = Dimensions.get('window').width;
const EMPTY: never[] = [];

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useToday();
  const { accounts, balances } = usePosition();
  const categories = useCategories().data ?? EMPTY;
  const { items: due } = useObligations(30);
  const a = accounts.find((x) => x.id === id);
  const ledgerId: string = (a?.type === 'debit_card' ? a.linkedAccountId : null) ?? id;
  const from = addMonths(startOfMonth(t), -5, 1);
  const q = useEntriesInRange({ accountId: ledgerId, from, to: t }, !!a);
  const entries = useMemo(() => q.data ?? EMPTY, [q.data]);

  const stats = (() => {
    const flow = (f: string, to: string) => {
      let inn = 0n;
      let out = 0n;
      for (const e of entries) {
        if (e.status === 'void' || e.occurredOn < f || e.occurredOn > to) continue;
        for (const p of e.postings) {
          if (p.target !== 'account' || p.accountId !== ledgerId) continue;
          if (p.amount > 0n) inn += p.amount;
          else out -= p.amount;
        }
      }
      return { inn, out };
    };
    const months = monthRange(from, t).map((m) => ({ m, ...flow(`${m}-01`, endOfMonth(`${m}-01`)) }));
    return { months, now: months.at(-1) ?? { inn: 0n, out: 0n }, cats: categoryBreakdown(entries, categories, 'expense', startOfMonth(t), t).slice(0, 5) };
  })();

  if (!a) return <Screen back><Skeleton height={220} style={{ margin: 20 }} /></Screen>;
  const owner = accounts.find((x) => x.id === ledgerId) ?? a;
  const isBank = groupOf(owner) === 'bank';
  const bal = balances.get(ledgerId)?.balance ?? 0n;
  const dueHere = due.filter((i) => i.sourceAccountId === ledgerId && i.state !== 'paid' && i.state !== 'skipped' && i.kind !== 'income').reduce((s, i) => s + (i.amount ?? 0n), 0n);
  const available = owner.class === 'asset' ? bal - dueHere : bal;
  const face = isBank ? bankFace(owner, accounts) : owner;
  const hasDebit = isBank && debitCardsOf(owner.id, accounts).length > 0;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const maxCat = stats.cats[0]?.amount ?? 1n;

  return (
    <Screen back right={<CircleButton icon="settings" label="Edit account" onPress={() => router.push({ pathname: '/account-edit', params: { id: owner.id } })} />} bottomPad={60}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <WalletCard face={faceOf(face)} />
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 22 }}>
        {[
          [owner.class === 'liability' ? 'Outstanding' : 'Balance', bal],
          ['Available', available],
        ].map(([l, v], i) => (
          <View key={l as string} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{(l as string).toUpperCase()}</Text>
            <Money value={v as bigint} decimals={0} style={{ fontFamily: F.extrabold, fontSize: 24, marginTop: 4 }} />
          </View>
        ))}
      </View>

      {growGroupOf(owner) && (
        <Section title={owner.type === 'fixed_deposit' || owner.type === 'recurring_deposit' ? 'Deposit' : 'Holdings'}>
          <View style={{ paddingHorizontal: 20 }}>
            <Plate style={{ padding: 16, gap: 10 }}>
              {(() => {
                const s = growStats(owner, bal);
                const Row = ({ l, v, tone }: { l: string; v: string; tone?: string }) => (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>{l}</Text>
                    <Text style={{ color: tone ?? C.chalk, fontFamily: F.extrabold, fontSize: 14, fontVariant: ['tabular-nums'] }}>{v}</Text>
                  </View>
                );
                const rows: { l: string; v: string; tone?: string }[] = [];
                if (s.group === 'market') {
                  rows.push({ l: 'Invested', v: formatMoney(s.invested, { decimals: 0 }) });
                  rows.push({ l: 'Now worth', v: formatMoney(s.value, { decimals: 0 }) });
                  if (s.gain !== 0n || s.invested > 0n) {
                    const pct = s.gainBps == null ? '' : ` (${s.gain >= 0n ? '+' : ''}${(s.gainBps / 100).toFixed(1)}%)`;
                    rows.push({ l: s.gain >= 0n ? 'Gain so far' : 'Down so far', v: `${s.gain >= 0n ? '+' : '−'}${formatMoney(s.gain < 0n ? -s.gain : s.gain, { decimals: 0 })}${pct}`, tone: s.gain >= 0n ? C.mint : C.coral });
                  }
                  if (owner.grow?.sipFrequency) rows.push({ l: 'SIP', v: `${formatMoney(owner.grow.sipAmount ?? 0n, { decimals: 0 })} · ${owner.grow.sipFrequency}` });
                } else {
                  rows.push({ l: 'Invested', v: formatMoney(s.invested, { decimals: 0 }) });
                  if (owner.grow?.interestRateBps != null) rows.push({ l: 'Rate', v: `${(owner.grow.interestRateBps / 100).toFixed(owner.grow.interestRateBps % 100 ? 2 : 0)}% p.a.` });
                  if (owner.type === 'recurring_deposit' && owner.grow?.principalAmount) rows.push({ l: 'Installment', v: `${formatMoney(owner.grow.principalAmount, { decimals: 0 })} / month` });
                  if (owner.grow?.tenureMonths) rows.push({ l: 'Tenure', v: `${owner.grow.tenureMonths} months` });
                  if (s.maturityOn) rows.push({ l: 'Matures on', v: formatDate(s.maturityOn) });
                  if (s.maturityValue != null) rows.push({ l: 'Maturity value', v: formatMoney(s.maturityValue, { decimals: 0 }) });
                  if (s.interestTotal != null) rows.push({ l: 'Interest at maturity', v: `+${formatMoney(s.interestTotal, { decimals: 0 })}`, tone: C.mint });
                }
                return rows.map((r, i) => <Row key={i} {...r} />);
              })()}
            </Plate>
          </View>
        </Section>
      )}

      <Section title="This month">
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Plate style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 12 }}>Money in</Text>
                <Money value={stats.now.inn} decimals={0} style={{ fontSize: 17, color: C.mint, marginTop: 2 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 12 }}>Money out</Text>
                <Money value={stats.now.out} decimals={0} style={{ fontSize: 17, marginTop: 2 }} />
              </View>
            </View>
            <Bars width={W - 74} height={140} data={stats.months.map((x) => ({ label: formatMonth(x.m, false), values: [x.inn, x.out] }))} series={[{ color: C.mint }, { color: C.chalk }]} />
          </Plate>
          {stats.cats.length > 0 && (
            <Plate style={{ padding: 16, gap: 12 }}>
              {stats.cats.map((c) => (
                <View key={c.categoryId} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: C.chalkDim, fontFamily: F.semibold }}>{catById.get(c.categoryId)?.name}</Text>
                    <Money value={c.amount} decimals={0} style={{ fontSize: 14 }} />
                  </View>
                  <Meter bps={Number((c.amount * 10_000n) / maxCat)} tone="gold" />
                </View>
              ))}
            </Plate>
          )}
        </View>
      </Section>

      <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
        <VaultSection accountId={owner.id} fields={hasDebit ? BANK_WITH_DEBIT_FIELDS : isBank ? BANK_FIELDS : ['accountNumber', 'notes']} />
      </View>
    </Screen>
  );
}
