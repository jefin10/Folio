import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EntryType } from '@folio/core';
import { useEntries } from '@folio/api';
import { EntryRow, useLookups } from '../../src/components/entries';
import { Chip, Empty, Input, Skeleton, Title } from '../../src/components/ui';
import { C } from '../../src/lib/theme';

const FILTERS: { label: string; types: EntryType[] }[] = [
  { label: 'All', types: [] },
  { label: 'Spending', types: ['expense', 'card_purchase'] },
  { label: 'Income', types: ['income', 'interest'] },
  { label: 'Transfers', types: ['transfer', 'cash_withdrawal', 'cash_deposit', 'card_repayment'] },
  { label: 'Paybacks', types: ['reimbursement_received', 'reimbursement_paid'] },
  { label: 'Loans', types: ['loan_repayment', 'loan_disbursement'] },
];

/** Every entry, newest first. Search and filter, tap for details. */
export default function Ledger() {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState(0);
  const [search, setSearch] = useState('');
  const q = useEntries({ types: FILTERS[f]!.types, search });
  const lookups = useLookups();
  const data = q.data?.pages.flat() ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <Title size={30}>Ledger</Title>
        <Input value={search} onChangeText={setSearch} placeholder="Search entries" />
      </View>
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={FILTERS} keyExtractor={(x) => x.label} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 14 }} renderItem={({ item, index }) => <Chip label={item.label} active={f === index} onPress={() => setF(index)} />} style={{ flexGrow: 0 }} />
      <FlatList
        data={data}
        keyExtractor={(e) => e.id!}
        renderItem={({ item }) => <EntryRow entry={item} lookups={lookups} />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        ListEmptyComponent={q.isLoading ? <View style={{ padding: 20, gap: 12 }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} />)}</View> : <Empty icon="receipt" title="No entries" />}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
      />
    </View>
  );
}
