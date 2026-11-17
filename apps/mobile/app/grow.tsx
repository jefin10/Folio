import { router } from 'expo-router';
import { useState } from 'react';
import { sortAccounts, type Account } from '@folio/core';
import { usePosition } from '@folio/api';
import { ActionSheet, Empty, PopButton } from '../src/components/ui';
import { faceOf, WalletHeader, WalletList } from '../src/components/wallet';

const GROW_TYPES: Account['type'][] = ['fixed_deposit', 'recurring_deposit', 'stocks', 'mutual_funds'];
const DEPOSIT_TYPES = new Set<Account['type']>(['fixed_deposit', 'recurring_deposit']);

/** Money that's locked away or in the market: FDs, RDs, stocks and mutual funds. */
export default function Grow() {
  const { accounts, balances } = usePosition();
  const [sheet, setSheet] = useState(false);
  const items = sortAccounts(accounts.filter((a) => a.status === 'active' && GROW_TYPES.includes(a.type)));
  const bal = (a: Account) => balances.get(a.id)?.balance ?? 0n;
  const deposits = items.filter((a) => DEPOSIT_TYPES.has(a.type)).reduce((s, a) => s + bal(a), 0n);
  const market = items.filter((a) => !DEPOSIT_TYPES.has(a.type)).reduce((s, a) => s + bal(a), 0n);
  const add = () => setSheet(true);

  return (
    <>
      <WalletList
        header={<WalletHeader title="Grow" onAdd={add} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} left={{ label: 'Deposits', value: deposits }} right={{ label: 'Market', value: market }} />}
        items={items.map((a) => ({
          id: a.id,
          face: faceOf(a),
          onDetails: () => router.push(`/account/${a.id}`),
        }))}
        addLabel="Add"
        onAdd={add}
        empty={<Empty icon="sparkle" title="Nothing growing yet" body="Fixed deposits, RDs, stocks and mutual funds live here." action={<PopButton tone="mint" label="Add deposit" icon="plus" onPress={add} />} />}
      />
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Add to Grow"
        options={[
          { label: 'Fixed deposit', icon: 'lock', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'fixed_deposit' } }) },
          { label: 'Recurring deposit', icon: 'repeat', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'recurring_deposit' } }) },
          { label: 'Stocks', icon: 'chart', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'stocks' } }) },
          { label: 'Mutual funds', icon: 'pie', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'mutual_funds' } }) },
        ]}
        cancelLabel="Cancel"
      />
    </>
  );
}
