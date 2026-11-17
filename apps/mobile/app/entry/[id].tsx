import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { displayName, ENTRY_TYPE_LABEL, formatDate, formatMoney } from '@folio/core';
import { useEntry, useEntryRevisions, useRestoreEntry, useVoidEntry } from '@folio/api';
import { useLookups } from '../../src/components/entries';
import { Screen } from '../../src/components/Screen';
import { Badge, Money, Plate, PopButton, Section, Skeleton } from '../../src/components/ui';
import { success } from '../../src/lib/haptics';
import { C, F } from '../../src/lib/theme';

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEntry(id).data;
  const revisions = useEntryRevisions(id).data ?? [];
  const l = useLookups();
  const voidEntry = useVoidEntry();
  const restore = useRestoreEntry();
  const [busy, setBusy] = useState(false);
  if (!e) return <Screen back><Skeleton height={200} style={{ margin: 20 }} /></Screen>;
  const leg = (p: (typeof e.postings)[number]) =>
    p.target === 'account' ? (l.accounts.get(p.accountId!) ? displayName(l.accounts.get(p.accountId!)!) : 'Account') : p.target === 'category' ? l.categories.get(p.categoryId!)?.name ?? 'Category' : p.target === 'person' ? l.people.get(p.personId!)?.name ?? 'Person' : 'Opening equity';
  const editable = e.status === 'posted' && e.type !== 'opening_balance' && e.type !== 'adjustment';
  return (
    <Screen back eyebrow={ENTRY_TYPE_LABEL[e.type]} title={e.description}>
      <View style={{ paddingHorizontal: 20 }}>
        <Money value={e.amount} decimals={2} style={{ fontFamily: F.display, fontSize: 44 }} />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Badge label={formatDate(e.occurredOn)} />
          <Badge label={e.source} />
          {e.status === 'void' && <Badge label="void" tone="coral" />}
          {(e.version ?? 1) > 1 && <Badge label={`edited ×${(e.version ?? 1) - 1}`} tone="gold" />}
        </View>
      </View>
      <Section title="Ledger legs" eyebrow="Always sums to zero">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ paddingHorizontal: 16 }}>
            {e.postings.map((p, i) => (
              <View key={p.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <View>
                  <Text style={{ color: C.chalk, fontFamily: F.semibold }}>{leg(p)}</Text>
                  {p.memo ? <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{p.memo}</Text> : null}
                </View>
                <Text style={{ color: C.chalkDim, fontFamily: F.bold, fontVariant: ['tabular-nums'] }}>{formatMoney(p.amount, { showPlus: true, decimals: 2 })}</Text>
              </View>
            ))}
          </Plate>
        </View>
      </Section>
      {revisions.length > 0 && (
        <Section title="History">
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {revisions.map((r) => (
              <Plate key={r.revision} style={{ padding: 12 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold }}>#{r.revision} {r.action}</Text>
                <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12 }}>{new Date(r.createdAt).toLocaleString('en-IN')}{r.reason ? ` · ${r.reason}` : ''}</Text>
              </Plate>
            ))}
          </View>
        </Section>
      )}
      <View style={{ paddingHorizontal: 20, marginTop: 28, gap: 12 }}>
        {editable && <PopButton tone="chalk" label="Edit" icon="edit" onPress={() => router.push({ pathname: '/add', params: { editId: e.id! } })} />}
        {e.status === 'posted' ? (
          <PopButton tone="dark" label="Void" icon="trash" loading={busy} onPress={() => Alert.alert('Void this entry?', 'Balances will ignore it. History is kept and you can restore it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Void', style: 'destructive', onPress: async () => { setBusy(true); await voidEntry.mutateAsync({ id: e.id! }); setBusy(false); success(); } }])} />
        ) : (
          <PopButton tone="dark" label="Restore" icon="history" loading={restore.isPending} onPress={() => void restore.mutateAsync(e.id!).then(success)} />
        )}
      </View>
    </Screen>
  );
}
