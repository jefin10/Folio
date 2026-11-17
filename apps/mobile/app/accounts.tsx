import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { accountMeta, displayName, groupOf, sortAccounts } from '@folio/core';
import { usePosition, useReorderAccounts } from '@folio/api';
import { AddCardFace, Carousel, FinanceCard } from '../src/components/cards';
import { Screen } from '../src/components/Screen';
import { CircleButton, InstitutionBadge, Money, Plate, PopButton, Section } from '../src/components/ui';
import { C, F } from '../src/lib/theme';

export default function Accounts() {
  const { accounts, balances, position } = usePosition();
  const reorder = useReorderAccounts();
  const active = sortAccounts(accounts.filter((a) => a.status === 'active'));
  const spendable = active.filter((a) => a.class === 'asset' && a.type !== 'debit_card');
  const move = (id: string, dir: -1 | 1) => {
    const ids = sortAccounts(accounts).map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  return (
    <Screen back title="Accounts" eyebrow="Everything you own and owe" right={<PopButton size="sm" tone="mint" label="Add" icon="plus" onPress={() => router.push({ pathname: '/account-edit', params: { type: 'savings' } })} />}>
      {position && (
        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <Text style={{ color: C.mute, fontFamily: F.sans }}>
            Bank <Money value={position.bankBalance} decimals={0} style={{ fontSize: 14 }} /> · Spendable <Money value={position.liquid} decimals={0} style={{ fontSize: 14 }} />
          </Text>
        </View>
      )}
      <View style={{ marginTop: 16 }}>
        <Carousel items={spendable} keyOf={(a) => a.id} render={(a) => <FinanceCard account={a} balance={balances.get(a.id)?.balance ?? 0n} onPress={() => router.push(`/account/${a.id}`)} />} trailing={<AddCardFace label="Add account" onPress={() => router.push({ pathname: '/account-edit', params: { type: 'savings' } })} />} />
      </View>
      <Section title="All accounts" eyebrow="Reorder with the arrows">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate>
            {active.map((a, i) => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View>
                  <CircleButton icon="chevronUp" label="Up" size={26} onPress={() => move(a.id, -1)} />
                  <CircleButton icon="chevronDown" label="Down" size={26} onPress={() => move(a.id, 1)} />
                </View>
                <InstitutionBadge institutionId={a.institutionId} name={a.institutionName ?? a.name} size={32} />
                <Pressable style={{ flex: 1 }} onPress={() => router.push(groupOf(a) === 'credit' ? `/card/${a.id}` : `/account/${a.id}`)}>
                  <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.semibold }}>{displayName(a)}</Text>
                  <Text numberOfLines={1} style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{accountMeta(a.type).label}{a.last4 ? ` · ${a.last4}` : ''}{a.includeInNetWorth ? '' : ' · not in net worth'}</Text>
                </Pressable>
                <Money value={a.type === 'debit_card' ? balances.get(a.linkedAccountId ?? '')?.balance ?? 0n : balances.get(a.id)?.balance ?? 0n} decimals={0} style={{ fontSize: 14, color: a.class === 'liability' ? C.coral : C.chalk }} />
              </View>
            ))}
          </Plate>
        </View>
      </Section>
    </Screen>
  );
}
