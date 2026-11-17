import { router } from 'expo-router';
import { useState } from 'react';
import { CARD_THEME_PRESETS, formatDate, formatMoney, groupOf, nextDue, sortAccounts, type RecurringRule } from '@folio/core';
import { loanDates, monthlyEquivalent } from '../../src/lib/emis';

const PER: Record<string, string> = { weekly: '/wk', monthly: '/mo', quarterly: '/qtr', half_yearly: '/6 mo', yearly: '/yr' };
import { useObligations, useOccurrences, usePosition, useToday } from '@folio/api';
import { ActionSheet, Empty, PopButton } from '../../src/components/ui';
import { faceOf, WalletHeader, WalletList, type Face, type WalletItem } from '../../src/components/wallet';

function ruleFace(r: RecurringRule): Face {
  const presets = Object.values(CARD_THEME_PRESETS);
  let h = 0;
  for (const ch of r.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { theme: presets[h % presets.length]!, artworkPath: null, name: r.name, institutionName: null, institutionId: null, last4: null, network: null, chip: false };
}

export default function Emis() {
  const t = useToday();
  const { accounts, balances } = usePosition();
  const { items: due, rules } = useObligations(30);
  const occurrences = useOccurrences().data ?? [];
  const loans = sortAccounts(accounts.filter((a) => groupOf(a) === 'loan' && a.status === 'active'));
  const loanIds = new Set(loans.map((l) => l.id));
  const emiRuleFor = (id: string) => rules.find((r) => r.kind === 'emi' && r.targetAccountId === id && r.isActive);
  const subs = rules.filter((r) => r.isActive && (r.kind === 'subscription' || (r.kind === 'emi' && !(r.targetAccountId && loanIds.has(r.targetAccountId)))));

  const items: WalletItem[] = [
    ...loans.map((l) => {
      const rule = emiRuleFor(l.id);
      const { next, end } = loanDates(l, rule, occurrences, t);
      return {
        id: l.id,
        face: faceOf(l),
        meta: [`${formatMoney(rule?.amount ?? l.loan?.emiAmount ?? 0n, { decimals: 0 })}/mo`, next ? `Due ${formatDate(next)}` : 'Set EMI date', end ? `Ends ${formatDate(end)}` : `${formatMoney(balances.get(l.id)?.balance ?? 0n, { decimals: 0 })} left`].join('  ·  '),
        onDetails: () => router.push(`/loan/${l.id}`),
      };
    }),
    ...subs.map((r) => {
      const next = nextDue(r, occurrences, t);
      return {
        id: r.id,
        face: ruleFace(r),
        meta: [`${formatMoney(r.amount ?? 0n, { decimals: 0 })}${PER[r.frequency] ?? ''}`, next ? `Due ${formatDate(next)}` : 'Ended', r.endOn ? `Ends ${formatDate(r.endOn)}` : 'No end date'].join('  ·  '),
        onDetails: () => router.push(`/rule/${r.id}`),
      };
    }),
  ];

  const perMonth = [...loans.map((l) => emiRuleFor(l.id)?.amount ?? l.loan?.emiAmount ?? 0n), ...subs.map(monthlyEquivalent)].reduce((s, v) => s + v, 0n);
  const due30 = due.filter((i) => (i.kind === 'emi' || i.kind === 'subscription') && i.state !== 'paid' && i.state !== 'skipped').reduce((s, i) => s + (i.amount ?? 0n), 0n);
  const [sheet, setSheet] = useState(false);
  const add = () => setSheet(true);

  return (
    <>
      <WalletList
        header={<WalletHeader title="EMIs" onAdd={add} left={{ label: 'Per month', value: perMonth }} right={{ label: 'Due in 30 days', value: due30 }} />}
        items={items}
        addLabel="Add"
        onAdd={add}
        empty={<Empty icon="loan" title="No EMIs or subscriptions" action={<PopButton tone="mint" label="Add" icon="plus" onPress={add} />} />}
      />
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Add"
        options={[
          { label: 'Loan with EMI', icon: 'loan', onPress: () => router.push({ pathname: '/account-edit', params: { type: 'vehicle_loan' } }) },
          { label: 'Subscription', icon: 'repeat', onPress: () => router.push({ pathname: '/rule-edit', params: { kind: 'subscription' } }) },
        ]}
        cancelLabel="Cancel"
      />
    </>
  );
}
