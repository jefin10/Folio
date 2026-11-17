import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { breakdown, displayName, ENTRY_TYPE_LABEL, formatDate, relativeDay, type Account, type Category, type Entry, type Person } from '@folio/core';
import { useLedgerContext, useToday } from '@folio/api';
import { tick } from '../lib/haptics';
import { C, F } from '../lib/theme';
import { Empty, Icon, Money, Skeleton, Tap } from './ui';

const TYPE_ICON: Record<string, string> = { income: 'arrowDown', expense: 'arrowUp', card_purchase: 'card', transfer: 'swap', card_repayment: 'check', cash_withdrawal: 'cash', cash_deposit: 'cash', loan_repayment: 'loan', loan_disbursement: 'loan', refund: 'arrowDown', reimbursement_received: 'users', reimbursement_paid: 'users', interest: 'percent', bank_charges: 'receipt', adjustment: 'edit', opening_balance: 'sparkle', bank_deposit: 'arrowDown', bank_withdrawal: 'arrowUp' };
const NEUTRAL = new Set(['transfer', 'card_repayment', 'cash_withdrawal', 'cash_deposit', 'loan_disbursement', 'opening_balance', 'adjustment']);

export interface Lookups {
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  people: Map<string, Person>;
}

export function useLookups(): Lookups {
  const { accounts, categories, people } = useLedgerContext();
  return { accounts: new Map(accounts.map((a) => [a.id, a])), categories: new Map(categories.map((c) => [c.id, c])), people: new Map(people.map((p) => [p.id, p])) };
}

export function EntryRow({ entry, lookups, accountId }: { entry: Entry; lookups: Lookups; accountId?: string }) {
  const t = useToday();
  const cat = entry.categoryId ? lookups.categories.get(entry.categoryId) : null;
  const acc = entry.instrumentId ? lookups.accounts.get(entry.instrumentId) : entry.primaryAccountId ? lookups.accounts.get(entry.primaryAccountId) : null;
  let signed: bigint;
  if (accountId) signed = entry.postings.filter((p) => p.target === 'account' && p.accountId === accountId).reduce((s, p) => s + p.amount, 0n);
  else if (NEUTRAL.has(entry.type)) signed = 0n;
  else if (['income', 'interest', 'bank_deposit', 'refund', 'reimbursement_received'].includes(entry.type)) signed = entry.amount;
  else signed = -entry.amount;
  const b = breakdown(entry, (id) => lookups.categories.get(id)?.kind);
  return (
    <Tap
      onPress={() => {
        tick();
        router.push(`/entry/${entry.id}`);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 11, opacity: entry.status === 'void' ? 0.4 : 1 }}
      pressedStyle={{ backgroundColor: C.ink2 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={cat?.icon ?? TYPE_ICON[entry.type] ?? 'dots'} size={18} color={cat?.color ?? C.chalkDim} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.semibold, fontSize: 15, textDecorationLine: entry.status === 'void' ? 'line-through' : 'none' }}>{entry.description}</Text>
        <Text numberOfLines={1} style={{ color: C.mute, fontFamily: F.sans, fontSize: 12, marginTop: 2 }}>
          {relativeDay(entry.occurredOn, t)} · {cat?.name ?? ENTRY_TYPE_LABEL[entry.type]}
          {acc ? ` · ${displayName(acc)}` : ''}
          {entry.source === 'watch' ? ' · ⌚' : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Money value={signed === 0n ? entry.amount : signed} showPlus={signed > 0n} style={{ fontSize: 15, color: signed === 0n ? C.chalkDim : signed > 0n ? C.mint : C.chalk }} />
        {b.reimbursable > 0n && <Money value={b.reimbursable} decimals={0} style={{ fontSize: 11, color: C.mint, fontFamily: F.semibold }} />}
        {signed === 0n && <Text style={{ color: C.faint, fontSize: 11, fontFamily: F.sans }}>{ENTRY_TYPE_LABEL[entry.type]}</Text>}
      </View>
    </Tap>
  );
}

export function EntryList({ entries, lookups, loading, accountId, emptyTitle = 'Nothing here yet' }: { entries: Entry[]; lookups: Lookups; loading?: boolean; accountId?: string; emptyTitle?: string }) {
  if (loading)
    return (
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={44} />
        ))}
      </View>
    );
  if (!entries.length) return <Empty icon="receipt" title={emptyTitle} />;
  const out: React.ReactNode[] = [];
  let last = '';
  for (const e of entries) {
    if (e.occurredOn !== last) {
      last = e.occurredOn;
      out.push(
        <Text key={`d${e.occurredOn}${e.id}`} style={{ color: C.faint, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
          {formatDate(e.occurredOn)}
        </Text>,
      );
    }
    out.push(<EntryRow key={e.id} entry={e} lookups={lookups} accountId={accountId} />);
  }
  return <View>{out}</View>;
}
