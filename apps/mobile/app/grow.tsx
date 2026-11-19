import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { formatDate, formatMoney, growStats, sortAccounts, type Account } from '@folio/core';
import { usePosition } from '@folio/api';
import { ActionSheet, Empty, PopButton } from '../src/components/ui';
import { faceOf, WalletHeader, WalletList } from '../src/components/wallet';

const GROW_TYPES: Account['type'][] = ['fixed_deposit', 'recurring_deposit', 'stocks', 'mutual_funds'];

/** One short line under each card: where it stands in one glance. */
function metaFor(a: Account, value: bigint): string | undefined {
  const s = growStats(a, value);
  const bits: string[] = [];
  if (s.group === 'deposit') {
    if (a.grow?.interestRateBps != null) bits.push(`${(a.grow.interestRateBps / 100).toFixed(a.grow.interestRateBps % 100 ? 2 : 0)}%`);
    if (a.type === 'recurring_deposit' && a.grow?.principalAmount) bits.push(`${formatMoney(a.grow.principalAmount, { decimals: 0 })}/mo`);
    if (s.maturityOn) bits.push(`matures ${formatDate(s.maturityOn)}`);
    if (s.maturityValue != null) bits.push(`→ ${formatMoney(s.maturityValue, { decimals: 0 })}`);
  } else {
    if (a.grow?.sipFrequency) bits.push(`SIP ${formatMoney(a.grow.sipAmount ?? 0n, { decimals: 0 })} ${a.grow.sipFrequency}`);
    if (a.grow?.investedAmount != null) {
      const pct = s.gainBps == null ? '' : ` (${s.gain >= 0n ? '+' : ''}${(s.gainBps / 100).toFixed(1)}%)`;
      bits.push(`${formatMoney(s.invested, { decimals: 0 })} in${s.gain !== 0n ? `, ${s.gain >= 0n ? '+' : '−'}${formatMoney(s.gain < 0n ? -s.gain : s.gain, { decimals: 0 })}${pct}` : ''}`);
    }
  }
  return bits.length ? bits.join(' · ') : undefined;
}

/** Money that's locked away or in the market: FDs, RDs, stocks and mutual funds. */
export default function Grow() {
  const { accounts, balances } = usePosition();
  const [sheet, setSheet] = useState(false);
  const items = useMemo(() => sortAccounts(accounts.filter((a) => a.status === 'active' && GROW_TYPES.includes(a.type))), [accounts]);
  const stats = useMemo(() => {
    let invested = 0n;
    let value = 0n;
    for (const a of items) {
      const s = growStats(a, balances.get(a.id)?.balance ?? 0n);
      invested += s.invested;
      value += s.value;
    }
    return { invested, value, gain: value - invested };
  }, [items, balances]);
  const add = () => setSheet(true);

  return (
    <>
      <WalletList
        header={
          <WalletHeader
            title="Grow"
            onAdd={add}
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            left={{ label: 'Total invested', value: stats.invested }}
            right={{ label: 'Now worth', value: stats.value, tone: stats.gain >= 0n ? '#3ddc97' : undefined }}
          />
        }
        items={items.map((a) => {
          const bal = balances.get(a.id)?.balance ?? 0n;
          return {
            id: a.id,
            face: faceOf(a),
            meta: metaFor(a, bal),
            onDetails: () => router.push(`/account/${a.id}`),
          };
        })}
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
