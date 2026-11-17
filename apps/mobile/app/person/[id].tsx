import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { formatDate, personLedger } from '@folio/core';
import { useAllocations, useEntriesInRange, usePeople, usePersonBalances } from '@folio/api';
import { Screen } from '../../src/components/Screen';
import { Avatar, Badge, Empty, Money, Plate, PopButton, Section, Skeleton } from '../../src/components/ui';
import { C, F } from '../../src/lib/theme';

const EMPTY: never[] = [];

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = (usePeople().data ?? []).find((p) => p.id === id);
  const b = usePersonBalances().data?.get(id);
  const entries = useEntriesInRange({ personId: id });
  const allocations = useAllocations().data ?? EMPTY;
  const ledger = useMemo(() => (entries.data ? personLedger(id, entries.data, allocations) : null), [entries.data, allocations, id]);
  if (!person) return <Screen back><Skeleton height={200} style={{ margin: 20 }} /></Screen>;
  return (
    <Screen back>
      <View style={{ alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Avatar name={person.name} color={person.color} emoji={person.emoji} size={72} />
        <Text style={{ color: C.chalk, fontFamily: F.display, fontSize: 30 }}>{person.name}</Text>
        <Money value={(b?.outstanding ?? 0n) < 0n ? -b!.outstanding : b?.outstanding ?? 0n} style={{ fontFamily: F.display, fontSize: 40, color: (b?.outstanding ?? 0n) > 0n ? C.mint : (b?.outstanding ?? 0n) < 0n ? C.coral : C.chalk }} />
        <Text style={{ color: C.mute, fontFamily: F.sans }}>{(b?.outstanding ?? 0n) < 0n ? 'you owe them' : 'outstanding'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20 }}>
        <Plate style={{ flex: 1, padding: 14 }}><Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>Paid for them</Text><Money value={b?.paidOnBehalf ?? 0n} decimals={0} style={{ fontSize: 17 }} /></Plate>
        <Plate style={{ flex: 1, padding: 14 }}><Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>Paid back</Text><Money value={b?.reimbursed ?? 0n} decimals={0} style={{ fontSize: 17 }} /></Plate>
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <PopButton tone="mint" label="Record payback" icon="check" onPress={() => router.push({ pathname: '/add', params: { kind: 'settle', personId: id } })} />
      </View>
      <Section title="Purchases you covered">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ paddingHorizontal: 14 }}>
            {!ledger ? <Skeleton height={80} style={{ marginVertical: 14 }} /> : ledger.claims.length === 0 ? <Empty title="Nothing yet" /> : [...ledger.claims].reverse().map((c, i) => (
              <View key={c.entryId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.semibold }}>{c.description}</Text>
                  <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{formatDate(c.occurredOn)}</Text>
                </View>
                <Badge label={c.status} tone={c.status === 'settled' ? 'mint' : c.status === 'partial' ? 'gold' : 'neutral'} />
                <Money value={c.outstanding} decimals={0} style={{ fontSize: 14, width: 80, textAlign: 'right' }} />
              </View>
            ))}
          </Plate>
        </View>
      </Section>
    </Screen>
  );
}
