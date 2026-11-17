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
  const rows = people.filter((p) => !p.archived).map((p) => ({ p, b: balances?.get(p.id) }));
  const owed = rows.reduce((s, r) => s + ((r.b?.outstanding ?? 0n) > 0n ? r.b!.outstanding : 0n), 0n);
  return (
    <Screen back title="Owed to you" eyebrow="Reimbursements" right={<PopButton size="sm" tone="mint" label="Settle" icon="users" onPress={() => router.push({ pathname: '/add', params: { kind: 'settle' } })} />}>
      <View style={{ paddingHorizontal: 20, marginTop: 6 }}>
        <Money value={owed} style={{ fontFamily: F.display, fontSize: 38, color: C.mint }} />
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
        {rows.length === 0 && <Empty icon="users" title="Nobody yet" body="Add parents, friends or roommates you pay for." />}
        {rows.map(({ p, b }) => (
          <Pressable key={p.id} onPress={() => router.push(`/person/${p.id}`)}>
            <Plate style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <Avatar name={p.name} color={p.color} emoji={p.emoji} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 15 }}>{p.name}</Text>
                <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12, textTransform: 'capitalize' }}>{p.relation}</Text>
              </View>
              {(b?.outstanding ?? 0n) === 0n ? <Badge label="Settled" tone="mint" /> : <Money value={(b?.outstanding ?? 0n) < 0n ? -b!.outstanding : b!.outstanding} decimals={0} style={{ fontSize: 16, color: (b?.outstanding ?? 0n) > 0n ? C.mint : C.coral }} />}
            </Plate>
          </Pressable>
        ))}
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
