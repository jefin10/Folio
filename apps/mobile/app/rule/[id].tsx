import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { CARD_THEME_PRESETS, FREQUENCY_LABEL, formatDate, nextDue } from '@folio/core';
import { useDeleteRule, useLedgerContext, useObligations, useOccurrences, useSkipOccurrence, useToday } from '@folio/api';
import { Screen } from '../../src/components/Screen';
import { Badge, CircleButton, Ghost, Money, Plate, PopButton, Section, Skeleton } from '../../src/components/ui';
import { WalletCard, type Face } from '../../src/components/wallet';
import { presetForDue } from '../../src/lib/presets';
import { C, F } from '../../src/lib/theme';

const EMPTY: never[] = [];

export default function RuleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useToday();
  const { items, rules } = useObligations(400);
  const occurrences = useOccurrences().data ?? EMPTY;
  const { accounts } = useLedgerContext();
  const skip = useSkipOccurrence();
  const del = useDeleteRule();
  const rule = rules.find((r) => r.id === id);
  if (!rule) return <Screen back><Skeleton height={220} style={{ margin: 20 }} /></Screen>;
  const next = nextDue(rule, occurrences, t);
  const presets = Object.values(CARD_THEME_PRESETS);
  let h = 0;
  for (const ch of rule.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const face: Face = { theme: presets[h % presets.length]!, artworkPath: null, name: rule.name, institutionName: null, institutionId: null, last4: null, network: null, chip: false };
  const from = accounts.find((a) => a.id === rule.sourceAccountId);
  const dueItem = items.find((i) => i.ruleId === id && i.state !== 'paid' && i.state !== 'skipped');
  const history = occurrences.filter((o) => o.ruleId === id).sort((a, b) => (a.dueOn < b.dueOn ? 1 : -1)).slice(0, 12);

  return (
    <Screen back right={<CircleButton icon="edit" label="Edit" onPress={() => router.push({ pathname: '/rule-edit', params: { id } })} />} bottomPad={60}>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <WalletCard face={face} />
      </View>
      <Section title="Details">
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          <Plate style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
            {[
              ['Amount', rule.amount ? <Money key="a" value={rule.amount} style={{ fontSize: 15 }} /> : 'Varies'],
              ['How often', FREQUENCY_LABEL[rule.frequency]],
              ['Next due', next ? formatDate(next) : '—'],
              ['Ends', rule.endOn ? formatDate(rule.endOn) : '—'],
              ['Paid from', from ? from.nickname || from.name : '—'],
            ].map(([l, v]) => (
              <View key={l as string} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>{l as string}</Text>
                {typeof v === 'string' ? <Text style={{ color: C.chalk, fontFamily: F.bold }}>{v}</Text> : v}
              </View>
            ))}
          </Plate>
          {dueItem && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <PopButton style={{ flex: 1 }} tone="mint" label="Mark paid" icon="check" onPress={() => router.push({ pathname: '/add', params: presetForDue(dueItem, rule) })} />
              <PopButton tone="dark" label="Skip" onPress={() => skip.mutate({ ruleId: id, dueOn: dueItem.dueOn })} />
            </View>
          )}
        </View>
      </Section>
      {history.length > 0 && (
        <Section title="History">
          <View style={{ paddingHorizontal: 20 }}>
            <Plate style={{ paddingHorizontal: 16 }}>
              {history.map((o, i) => (
                <View key={o.dueOn} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, gap: 10 }}>
                  <Text style={{ flex: 1, color: C.chalk, fontFamily: F.semibold }}>{formatDate(o.dueOn)}</Text>
                  <Badge label={o.status} tone={o.status === 'paid' ? 'mint' : 'neutral'} />
                  {o.amount ? <Money value={o.amount} decimals={0} style={{ fontSize: 14, minWidth: 70, textAlign: 'right' }} /> : null}
                </View>
              ))}
            </Plate>
          </View>
        </Section>
      )}
      <View style={{ paddingHorizontal: 20, marginTop: 26, alignItems: 'flex-start' }}>
        <Ghost
          label="Delete"
          icon="trash"
          color={C.coral}
          onPress={() =>
            Alert.alert(`Delete ${rule.name}?`, undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void del.mutateAsync(id).then(() => router.back()) },
            ])
          }
        />
      </View>
    </Screen>
  );
}
