import { router } from 'expo-router';
import { Alert } from 'react-native';
import { sortAccounts, type Account } from '@folio/core';
import { usePosition } from '@folio/api';
import { Empty, PopButton } from '../../src/components/ui';
import { faceOf, WalletHeader, WalletList } from '../../src/components/wallet';

const GROW_TYPES: Account['type'][] = ['fixed_deposit', 'recurring_deposit', 'stocks', 'mutual_funds'];
const DEPOSIT_TYPES = new Set<Account['type']>(['fixed_deposit', 'recurring_deposit']);

/** Money that's locked away or in the market: FDs, RDs, stocks and mutual funds. */
export default function Grow() {
  const { accounts, balances } = usePosition();
  const items = sortAccounts(accounts.filter((a) => a.status === 'active' && GROW_TYPES.includes(a.type)));
  const bal = (a: Account) => balances.get(a.id)?.balance ?? 0n;
  const deposits = items.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((s, a) => s + bal(a), 0n);
  const market = items.filter((a) => !DEPOSIT_TYPES.has(a.type)).reduce((s, a) => s + bal(a), 0n);
  const add = () =>
    Alert.alert('Add', undefined, [
      { text: 'Fixed deposit', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'fixed_deposit' } }) },
      { text: 'Recurring deposit', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'recurring_deposit' } }) },
      { text: 'Stocks', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'stocks' } }) },
      { text: 'Mutual funds', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'mutual_funds' } }) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <WalletList
      header={<WalletHeader title="Grow" onAdd={add} left={{ label: 'Deposits', value: deposits }} right={{ label: 'Market', value: market }} />}
      items={items.map((a) => ({
        id: a.id,
        face: faceOf(a),
        onDetails: () => router.push(`/account/${a.id}`),
      }))}
      addLabel="Add"
      onAdd={add}
      empty={<Empty icon="sparkle" title="Nothing growing yet" body="Fixed deposits, RDs, stocks and mutual funds live here." action={<PopButton tone="mint" label="Add deposit" icon="plus" onPress={add} />} />}
    />
  );
}
