import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { addMonths, categoryBreakdown, endOfMonth, formatBps, formatDate, formatMonth, monthRange, relativeDay, rewardEstimate, spendByAccount, startOfMonth, summariseCard } from '@folio/core';
import { useCategories, useEntriesInRange, usePosition, useStatements, useToday } from '@folio/api';
import { Bars } from '../../src/components/charts';
import { Screen } from '../../src/components/Screen';
import { CircleButton, Meter, Money, Plate, Section, Skeleton } from '../../src/components/ui';
import { CARD_FIELDS, VaultSection } from '../../src/components/VaultSection';
import { faceOf, WalletCard } from '../../src/components/wallet';
import { C, F } from '../../src/lib/theme';

const W = Dimensions.get('window').width;
const EMPTY: never[] = [];

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
      <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useToday();
  const { accounts, balances } = usePosition();
  const statements = useStatements(id).data ?? EMPTY;
  const categories = useCategories().data ?? EMPTY;
  const from = addMonths(startOfMonth(t), -5, 1);
  const q = useEntriesInRange({ accountId: id, from, to: t });
  const entries = useMemo(() => q.data ?? EMPTY, [q.data]);
  const card = accounts.find((a) => a.id === id);

  const stats = useMemo(() => {
    if (!card) return null;
    const months = monthRange(from, t).map((m) => ({ m, v: spendByAccount(entries, [card], `${m}-01`, endOfMonth(`${m}-01`)).get(card.id) ?? 0n }));
    const thisMonth = months.at(-1)?.v ?? 0n;
    const cats = categoryBreakdown(entries, categories, 'expense', startOfMonth(t), t).slice(0, 5);
    return { months, thisMonth, cats, year: months.reduce((s, x) => s + x.v, 0n) };
  }, [card, entries, categories, from, t]);

  if (!card || !stats) return <Screen back><Skeleton height={220} style={{ margin: 20 }} /></Screen>;
  const out = balances.get(id)?.balance ?? 0n;
  const s = summariseCard(card, out, entries, statements, t);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const maxCat = stats.cats[0]?.amount ?? 1n;

  return (
    <Screen back right={<CircleButton icon="settings" label="Edit card" onPress={() => router.push({ pathname: '/account-edit', params: { id } })} />} bottomPad={60}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <WalletCard face={faceOf(card)} />
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 22 }}>
        {[
          ['Outstanding', out, C.coral],
          ['Available', s.available ?? 0n, C.chalk],
        ].map(([l, v, c], i) => (
          <View key={l as string} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{(l as string).toUpperCase()}</Text>
            <Money value={v as bigint} decimals={0} style={{ color: c as string, fontFamily: F.extrabold, fontSize: 24, marginTop: 4 }} />
          </View>
        ))}
      </View>

      <Section title="This cycle">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
            {s.limit ? (
              <View style={{ paddingVertical: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>Limit used</Text>
                  <Text style={{ color: C.chalk, fontFamily: F.bold }}>{formatBps(s.utilisationBps)}</Text>
                </View>
                <Meter bps={s.utilisationBps} tone={s.utilisationBps > 6000 ? 'coral' : s.utilisationBps > 3000 ? 'gold' : 'mint'} />
              </View>
            ) : null}
            <Stat label="Statement due">
              <Money value={s.statementRemaining} decimals={0} style={{ fontSize: 15 }} />
            </Stat>
            <Stat label="Due date">
              <Text style={{ color: s.cycle.daysToDue !== null && s.cycle.daysToDue <= 3 && s.statementRemaining > 0n ? C.coral : C.chalk, fontFamily: F.bold }}>{s.cycle.dueOn ? `${formatDate(s.cycle.dueOn)} · ${relativeDay(s.cycle.dueOn, t)}` : '—'}</Text>
            </Stat>
            <Stat label="Minimum due">
              <Money value={s.minimumDue} decimals={0} style={{ fontSize: 15 }} />
            </Stat>
            <Stat label="Unbilled">
              <Money value={s.unbilled} decimals={0} style={{ fontSize: 15 }} />
            </Stat>
            <Stat label="Next statement">
              <Text style={{ color: C.chalk, fontFamily: F.bold }}>{s.cycle.nextStatementOn ? formatDate(s.cycle.nextStatementOn) : '—'}</Text>
            </Stat>
          </Plate>
        </View>
      </Section>

      <Section title="Spending">
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Plate style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>This month</Text>
              <Money value={stats.thisMonth} decimals={0} style={{ fontSize: 15 }} />
            </View>
            <Bars width={W - 74} height={140} data={stats.months.map((x) => ({ label: formatMonth(x.m, false), values: [x.v] }))} series={[{ color: C.chalk }]} />
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
          {card.card?.rewardRateBps ? (
            <Plate style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
              <Stat label={`Rewards (6 mo, ${formatBps(card.card.rewardRateBps)})`}>
                <Money value={rewardEstimate(stats.year, card.card.rewardRateBps)} decimals={0} style={{ fontSize: 15, color: C.mint }} />
              </Stat>
              <Stat label="Annual fee">
                <Text style={{ color: C.chalk, fontFamily: F.bold }}>{card.card.lifetimeFree ? 'Lifetime free' : card.card.annualFee ? `₹${Number(card.card.annualFee / 100n).toLocaleString('en-IN')}` : '—'}</Text>
              </Stat>
            </Plate>
          ) : null}
        </View>
      </Section>

      <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
        <VaultSection accountId={id} fields={CARD_FIELDS} />
      </View>
    </Screen>
  );
}
