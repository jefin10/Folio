import { router } from 'expo-router';
import { groupOf, sortAccounts } from '@folio/core';
import { usePosition } from '@folio/api';
import { Empty, PopButton } from '../../src/components/ui';
import { faceOf, WalletHeader, WalletList } from '../../src/components/wallet';

export default function Cards() {
  const { accounts, position } = usePosition();
  const cards = sortAccounts(accounts.filter((a) => groupOf(a) === 'credit' && a.status === 'active'));
  const add = () => router.push({ pathname: '/account-edit', params: { type: 'credit_card' } });
  return (
    <WalletList
      header={<WalletHeader title="Cards" onAdd={add} left={{ label: 'Outstanding', value: position?.creditOutstanding ?? 0n }} right={{ label: 'Available', value: position?.availableCredit ?? 0n }} />}
      items={cards.map((c) => ({
        id: c.id,
        face: faceOf(c),
        onDetails: () => router.push(`/card/${c.id}`),
      }))}
      addLabel="Add card"
      onAdd={add}
      empty={<Empty icon="card" title="No cards yet" action={<PopButton tone="mint" label="Add a card" icon="plus" onPress={add} />} />}
    />
  );
}
