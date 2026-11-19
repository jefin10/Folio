import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PersonRelation } from '@folio/core';
import { usePeople, usePersonBalances, useSavePerson } from '@folio/api';
import { Screen } from '../src/components/Screen';
import { Avatar, Badge, Chip, Empty, Field, Input, Money, Plate, PopButton } from '../src/components/ui';
import { success } from '../src/lib/haptics';
import { C, F } from '../src/lib/theme';

const REL: PersonRelation[] = ['parent', 'family', 'friend', 'roommate', 'partner', 'colleague', 'other'];
const COLORS = ['#7cf2c4', '#f5c26b', '#6aa8ff', '#c38bff', '#ff7a59', '#ff6b9a'];

export default function People() {
  const people = usePeople().data ?? [];
  const balances = usePersonBalances().data;
  const save = useSavePerson();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<PersonRelation>('friend');
  const rows = people.filter((p) => !p.archived).map((p) => ({ p, out: balances?.get(p.id)?.outstanding ?? 0n }));
  // outstanding > 0: they owe you. < 0: you owe them.
  const theyOwe = rows.filter((r) => r.out > 0n).sort((a, b) => (b.out > a.out ? 1 : -1));
  const youOwe = rows.filter((r) => r.out < 0n).sort((a, b) => (a.out > b.out ? 1 : -1));
  const settled = rows.filter((r) => r.out === 0n);
  const totalIn = theyOwe.reduce((s, r) => s + r.out, 0n);
  const totalOut = youOwe.reduce((s, r) => s - r.out, 0n);

  const row = ({ p, out }: (typeof rows)[number]) => (
    <Pressable key={p.id} onPress={() => router.push(`/person/${p.id}`)}>
      <Plate style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
        <Avatar name={p.name} color={p.color} emoji={p.emoji} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.bold, fontSize: 15 }}>{p.name}</Text>
          <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12, textTransform: 'capitalize' }}>{p.relation}</Text>
        </View>
        {out === 0n ? <Badge label="Settled" tone="mint" /> : <Money value={out < 0n ? -out : out} decimals={0} style={{ fontSize: 16, color: out > 0n ? C.mint : C.coral }} />}
      </Plate>
    </Pressable>
  );
  const group = (title: string, list: typeof rows) =>
    list.length > 0 && (
      <View style={{ gap: 10 }}>
        <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6, marginTop: 8 }}>{title.toUpperCase()}</Text>
        {list.map(row)}
      </View>
    );

  return (
    <Screen back title="People" right={<PopButton size="sm" tone="mint" label="Settle" icon="users" onPress={() => router.push({ pathname: '/add', params: { kind: 'settle' } })} />}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 8 }}>
        {[
          ['Owed to you', totalIn, C.mint],
          ['You owe', totalOut, C.coral],
        ].map(([l, v, c], i) => (
          <View key={l as string} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{(l as string).toUpperCase()}</Text>
            <Money value={v as bigint} decimals={0} style={{ color: c as string, fontFamily: F.extrabold, fontSize: 26, marginTop: 4 }} />
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 10 }}>
        {rows.length === 0 && <Empty icon="users" title="Nobody yet" body="Add parents, friends or roommates you pay for or borrow from." />}
        {group('They owe you', theyOwe)}
        {group('You owe', youOwe)}
        {group('Settled', settled)}
        {adding ? (
          <Plate style={{ padding: 16, gap: 14 }}>
            <Field label="Name"><Input value={name} onChangeText={setName} autoFocus placeholder="Parents, Rahul…" /></Field>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{REL.map((r) => <Chip key={r} label={r} active={relation === r} onPress={() => setRelation(r)} />)}</View>
            <PopButton tone="mint" label="Add person" disabled={!name.trim()} loading={save.isPending} onPress={async () => { await save.mutateAsync({ name, relation, color: COLORS[people.length % COLORS.length] }); success(); setName(''); setAdding(false); }} />
          </Plate>
        ) : (
          <PopButton tone="dark" label="Add a person" icon="plus" onPress={() => setAdding(true)} />
        )}
      </View>
    </Screen>
  );
}
