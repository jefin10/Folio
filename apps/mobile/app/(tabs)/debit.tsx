import { router } from 'expo-router';
import { useMemo } from 'react';
import { groupOf, sortAccounts } from '@folio/core';
import { useObligations, usePosition } from '@folio/api';
import { Empty, PopButton } from '../../src/components/ui';
import { faceOf, WalletHeader, WalletList } from '../../src/components/wallet';
import { bankFace } from '../../src/lib/faces';

/** Bank accounts, each wearing its debit card as its face. */
export default function Debit() {
  const { accounts, position } = usePosition();
  const { items } = useObligations(30);
  const banks = sortAccounts(accounts.filter((a) => a.status === 'active' && groupOf(a) === 'bank'));
  const bankIds = useMemo(() => new Set(banks.map((b) => b.id)), [banks]);
  // Available = bank money minus what's due from these accounts in the next 30 days.
  const dueFromBanks = items.filter((i) => i.state !== 'paid' && i.state !== 'skipped' && i.kind !== 'income' && i.sourceAccountId && bankIds.has(i.sourceAccountId)).reduce((s, i) => s + (i.amount ?? 0n), 0n);
  const balance = position?.bankBalance ?? 0n;
  const add = () => router.push({ pathname: '/account-edit', params: { type: 'savings' } });
  return (
    <WalletList
      header={<WalletHeader title="Debit" onAdd={add} left={{ label: 'Balance', value: balance }} right={{ label: 'Available', value: balance - dueFromBanks }} />}
      items={banks.map((b) => ({
        id: b.id,
        face: faceOf(bankFace(b, accounts)),
        onDetails: () => router.push(`/account/${b.id}`),
      }))}
      addLabel="Add account"
      onAdd={add}
      empty={<Empty icon="bank" title="No bank accounts yet" action={<PopButton tone="mint" label="Add bank account" icon="plus" onPress={add} />} />}
    />
  );
}
