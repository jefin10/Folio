import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  addDays,
  categoryBreakdown,
  dailySpend,
  formatBps,
  formatMonth,
  groupOf,
  monthlySeries,
  normaliseDescription,
  periodRange,
  periodTotals,
  ratioBps,
  spendByAccount,
  startOfMonth,
  type PeriodPreset,
} from '@folio/core';
import { useCategories, useEntriesInRange, useObligations, usePosition, useToday } from '@folio/api';
import { Bars } from '../../src/components/charts';
import { Screen } from '../../src/components/Screen';
import { CircleButton, Eyebrow, HeroMoney, Icon, Meter, Money, Plate, PopButton, Section, Segmented, Skeleton } from '../../src/components/ui';
import { useUi } from '../../src/lib/store';
import { C, F } from '../../src/lib/theme';

const W = Dimensions.get('window').width;
const EMPTY: never[] = [];

/** Pure analytics: where you stand and where the money goes. No carousels, no lists to manage. */
export default function Analytics() {
  const qc = useQueryClient();
  const t = useToday();
  const [period, setPeriod] = useState<PeriodPreset>('this_month');
  const range = periodRange(period, t);
  const from = range.from;
  const to = range.to < t ? range.to : t;
  const { position, accounts, isLoading } = usePosition();
  const categories = useCategories().data ?? EMPTY;
  const q = useEntriesInRange({ from: period === 'this_month' ? addDays(startOfMonth(t), -150) : from, to: t });
  const entries = useMemo(() => q.data ?? EMPTY, [q.data]);
  const { items } = useObligations(30);
  const hide = useUi((s) => s.hideBalances);
  const setHide = useUi((s) => s.setHideBalances);

  const kindOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.kind]));
    return (id: string) => m.get(id);
  }, [categories]);

  const a = useMemo(() => {
    const totals = periodTotals(entries, kindOf, from, to);
    const seriesFrom = period === 'this_month' ? addDays(startOfMonth(t), -150) : from;
    const series = monthlySeries(entries, kindOf, seriesFrom, to).slice(-6);
    const cats = categoryBreakdown(entries, categories, 'expense', from, to);
    const byAccount = [...spendByAccount(entries, accounts, from, to).entries()].sort((x, y) => (y[1] > x[1] ? 1 : -1));
    const days = dailySpend(entries, kindOf, startOfMonth(t), t);
    const rhythm: { label: string; values: bigint[] }[] = [];
    for (let d = startOfMonth(t); d <= t; d = addDays(d, 1)) rhythm.push({ label: Number(d.slice(8)) % 5 === 1 ? String(Number(d.slice(8))) : '', values: [days.get(d) ?? 0n] });
    const places = new Map<string, { label: string; amount: bigint; count: number }>();
    for (const e of entries) {
      if (e.status === 'void' || e.occurredOn < from || e.occurredOn > to) continue;
      if (e.type !== 'expense' && e.type !== 'card_purchase') continue;
      const key = normaliseDescription(e.counterparty ?? e.description).slice(0, 2).join(' ') || e.description.toLowerCase();
      const cur = places.get(key) ?? { label: e.counterparty ?? e.description, amount: 0n, count: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      places.set(key, cur);
    }
    const topPlaces = [...places.values()].sort((x, y) => (y.amount > x.amount ? 1 : -1)).slice(0, 5);
    const dayCount = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
    return { totals, series, cats, byAccount, rhythm, topPlaces, perDay: totals.grossSpend / BigInt(dayCount) };
  }, [entries, kindOf, categories, accounts, from, to, period, t]);

  const catById = new Map(categories.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((x) => [x.id, x]));
  const due = items.filter((i) => i.state !== 'paid' && i.state !== 'skipped' && i.kind !== 'income');
  const dueTotal = due.reduce((s, i) => s + (i.amount ?? 0n), 0n);
  const overdue = due.filter((i) => i.state === 'overdue').length;
  const cards = accounts.filter((x) => groupOf(x) === 'credit' && x.status === 'active');
  const maxCat = a.cats[0]?.amount ?? 1n;
  const maxAcc = a.byAccount[0]?.[1] ?? 1n;

  return (
    <Screen onRefresh={() => void qc.invalidateQueries({ queryKey: ['folio'] })} refreshing={false}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: C.chalk, fontFamily: F.display, fontSize: 34 }}>Analytics</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CircleButton icon={hide ? 'eyeOff' : 'eye'} label="Hide balances" onPress={() => setHide(!hide)} />
          <CircleButton icon="layout" label="More" onPress={() => router.push('/more')} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'this_month', label: 'Month' }, { value: 'last_3_months', label: '3M' }, { value: 'last_6_months', label: '6M' }, { value: 'financial_year', label: 'FY' }, { value: 'last_12_months', label: '12M' }]} />
      </View>

      {!isLoading && accounts.length === 0 ? (
        <View style={{ paddingHorizontal: 20, marginTop: 30, gap: 16 }}>
          <Eyebrow color={C.mint}>Welcome to Folio</Eyebrow>
          <Text style={{ fontFamily: F.display, fontSize: 32, color: C.chalk, lineHeight: 38 }}>Add an account and the numbers start here.</Text>
          <PopButton tone="mint" label="Add bank account" icon="bank" onPress={() => router.push({ pathname: '/account-edit', params: { type: 'savings' } })} />
          <PopButton tone="dark" label="Add credit card" icon="card" onPress={() => router.push({ pathname: '/account-edit', params: { type: 'credit_card' } })} />
        </View>
      ) : (
        <>
          <Animated.View entering={FadeInDown.springify().damping(18)} style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <Plate style={{ padding: 20, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(61,220,151,0.07)' }} />
              <Eyebrow>Net worth</Eyebrow>
              {position ? <HeroMoney value={position.netWorth} size={40} /> : <Skeleton height={46} width="65%" style={{ marginTop: 8 }} />}
              {position && (
                <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                  {[
                    ['Spendable', position.liquid, C.chalk],
                    ['Owed to you', position.receivables, C.mint],
                    ['You owe', position.totalLiabilities + position.payables, C.coral],
                  ].map(([l, v, c]) => (
                    <View key={l as string} style={{ flex: 1 }}>
                      <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 11 }}>{l as string}</Text>
                      <Money value={v as bigint} decimals={0} style={{ color: c as string, fontSize: 14, marginTop: 2 }} />
                    </View>
                  ))}
                </View>
              )}
            </Plate>
          </Animated.View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginTop: 12 }}>
            {[
              { l: 'Income', v: a.totals.income, c: C.mint },
              { l: 'Your spending', v: a.totals.personalExpense, c: C.gold },
              { l: 'Paid for others', v: a.totals.reimbursable, c: C.sky },
              { l: 'Saved', v: a.totals.saved, c: a.totals.saved < 0n ? C.coral : C.mint },
            ].map((k, i) => (
              <Animated.View key={k.l} entering={FadeInDown.delay(50 + i * 40).springify().damping(18)} style={{ width: (W - 50) / 2 }}>
                <Plate style={{ padding: 14 }}>
                  <Eyebrow>{k.l}</Eyebrow>
                  <Money value={k.v} decimals={0} style={{ fontFamily: F.display, fontSize: 21, marginTop: 4, color: k.c }} />
                </Plate>
              </Animated.View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 10 }}>
            <Plate style={{ flex: 1, padding: 14 }}>
              <Eyebrow>Savings rate</Eyebrow>
              <Text style={{ color: C.chalk, fontFamily: F.display, fontSize: 21, marginTop: 4 }}>{a.totals.income > 0n ? formatBps(a.totals.savingsRateBps, 0) : '—'}</Text>
            </Plate>
            <Plate style={{ flex: 1, padding: 14 }}>
              <Eyebrow>Per day</Eyebrow>
              <Money value={a.perDay} decimals={0} style={{ fontFamily: F.display, fontSize: 21, marginTop: 4 }} />
            </Plate>
          </View>

          <Section eyebrow="Last 6 months" title="Cash flow">
            <View style={{ paddingHorizontal: 20 }}>
              <Plate style={{ padding: 14 }}>
                <Bars width={W - 70} data={a.series.map((s) => ({ label: formatMonth(s.month, false), values: [s.income, s.personalExpense, s.reimbursable] }))} series={[{ color: C.mint }, { color: C.gold }, { color: C.sky }]} />
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                  <Text style={{ color: C.mint, fontFamily: F.bold, fontSize: 11 }}>● Income</Text>
                  <Text style={{ color: C.gold, fontFamily: F.bold, fontSize: 11 }}>● Yours</Text>
                  <Text style={{ color: C.sky, fontFamily: F.bold, fontSize: 11 }}>● For others</Text>
                </View>
              </Plate>
            </View>
          </Section>

          <Section eyebrow="This month, day by day" title="Spending rhythm">
            <View style={{ paddingHorizontal: 20 }}>
              <Plate style={{ padding: 14 }}>
                <Bars width={W - 70} height={130} data={a.rhythm} series={[{ color: C.chalk }]} />
              </Plate>
            </View>
          </Section>

          <Section eyebrow={range.label} title="Where it went">
            <View style={{ paddingHorizontal: 20 }}>
              <Plate style={{ padding: 16, gap: 14 }}>
                {a.cats.length === 0 && <Text style={{ color: C.mute, fontFamily: F.sans }}>No spending in this period.</Text>}
                {a.cats.slice(0, 8).map((c) => (
                  <View key={c.categoryId} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon name={catById.get(c.categoryId)?.icon ?? 'dots'} size={15} color={catById.get(c.categoryId)?.color ?? C.mute} />
                      <Text style={{ flex: 1, color: C.chalkDim, fontFamily: F.semibold }}>{catById.get(c.categoryId)?.name}</Text>
                      <Text style={{ color: C.faint, fontFamily: F.sans, fontSize: 11 }}>{formatBps(c.shareBps, 0)}</Text>
                      <Money value={c.amount} decimals={0} style={{ fontSize: 14, width: 86, textAlign: 'right' }} />
                    </View>
                    <Meter bps={ratioBps(c.amount, maxCat)} tone="gold" />
                  </View>
                ))}
              </Plate>
            </View>
          </Section>

          {a.byAccount.length > 0 && (
            <Section eyebrow={range.label} title="Paid with">
              <View style={{ paddingHorizontal: 20 }}>
                <Plate style={{ padding: 16, gap: 14 }}>
                  {a.byAccount.slice(0, 6).map(([id, v]) => (
                    <View key={id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: C.chalkDim, fontFamily: F.semibold }}>{accById.get(id)?.nickname || accById.get(id)?.name}</Text>
                        <Money value={v} decimals={0} style={{ fontSize: 14 }} />
                      </View>
                      <Meter bps={ratioBps(v, maxAcc)} />
                    </View>
                  ))}
                </Plate>
              </View>
            </Section>
          )}

          {a.topPlaces.length > 0 && (
            <Section eyebrow={range.label} title="Top places">
              <View style={{ paddingHorizontal: 20 }}>
                <Plate style={{ paddingHorizontal: 16 }}>
                  {a.topPlaces.map((p, i) => (
                    <View key={p.label + i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: C.chalk, fontFamily: F.semibold }}>{p.label}</Text>
                      <Text style={{ color: C.faint, fontFamily: F.sans, fontSize: 12, marginRight: 10 }}>{p.count}×</Text>
                      <Money value={p.amount} decimals={0} style={{ fontSize: 14 }} />
                    </View>
                  ))}
                </Plate>
              </View>
            </Section>
          )}

          {position && (
            <Section eyebrow="Right now" title="Credit & obligations">
              <View style={{ paddingHorizontal: 20, gap: 10 }}>
                {position.creditLimit > 0n && (
                  <Plate style={{ padding: 16, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.chalkDim, fontFamily: F.semibold }}>Card usage · {cards.length} card{cards.length === 1 ? '' : 's'}</Text>
                      <Text style={{ color: C.chalk, fontFamily: F.bold }}>{formatBps(ratioBps(position.creditOutstanding, position.creditLimit))}</Text>
                    </View>
                    <Meter bps={ratioBps(position.creditOutstanding, position.creditLimit)} tone={ratioBps(position.creditOutstanding, position.creditLimit) > 3000 ? 'gold' : 'mint'} />
                    <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>
                      <Money value={position.creditOutstanding} decimals={0} style={{ fontSize: 12, color: C.chalkDim }} /> of <Money value={position.creditLimit} decimals={0} style={{ fontSize: 12, color: C.chalkDim }} />
                    </Text>
                  </Plate>
                )}
                <Pressable onPress={() => router.push('/bills')}>
                  <Plate style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Icon name="calendar" size={20} color={overdue ? C.coral : C.mint} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.chalk, fontFamily: F.semibold }}>Due in 30 days</Text>
                      <Text style={{ color: overdue ? C.coral : C.mute, fontFamily: F.sans, fontSize: 12 }}>{due.length} bill{due.length === 1 ? '' : 's'}{overdue ? ` · ${overdue} overdue` : ''} · after them <Money value={position.afterObligations} decimals={0} style={{ fontSize: 12, color: C.chalkDim }} /></Text>
                    </View>
                    <Money value={dueTotal} decimals={0} style={{ fontSize: 15 }} />
                  </Plate>
                </Pressable>
                <Pressable onPress={() => router.push('/people')}>
                  <Plate style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Icon name="users" size={20} color={C.mint} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.chalk, fontFamily: F.semibold }}>Owed to you</Text>
                      <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{position.payables > 0n ? 'You also owe people' : 'Pending reimbursements'}</Text>
                    </View>
                    <Money value={position.receivables} decimals={0} style={{ fontSize: 15, color: C.mint }} />
                  </Plate>
                </Pressable>
              </View>
            </Section>
          )}
        </>
      )}
      <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
        <PopButton tone="dark" label="Ledger" icon="receipt" onPress={() => router.push('/ledger')} />
      </View>
    </Screen>
  );
}
