/**
 * Android home-screen widgets (rendered natively by react-native-android-widget).
 * They read only the Keystore-backed snapshot and honour "hide balances".
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatDate } from '@folio/core';
import { money, type Snapshot } from '../lib/snapshot';

const INK = '#111111';
const CHALK = '#f4f3ee';
const MUTE = '#8b8a85';
const MINT = '#3ddc97';

export function BalanceWidget({ s }: { s: Snapshot | null }) {
  if (!s) {
    return (
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: INK, borderRadius: 24, padding: 16, justifyContent: 'center' }} clickAction="OPEN_APP">
        <TextWidget text="Open Folio to set up this widget" style={{ color: MUTE, fontSize: 14 }} />
      </FlexWidget>
    );
  }
  const hidden = s.hideBalances;
  const next = s.upcoming[0];
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: INK, borderRadius: 24, padding: 16, flexDirection: 'column', justifyContent: 'space-between' }} clickAction="OPEN_APP">
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="SPENDABLE" style={{ color: MUTE, fontSize: 11, letterSpacing: 0.15, fontWeight: '700' }} />
        <FlexWidget style={{ backgroundColor: MINT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }} clickAction="OPEN_URI" clickActionData={{ uri: 'folio://add' }}>
          <TextWidget text="＋ Add" style={{ color: '#04140d', fontSize: 12, fontWeight: '800' }} />
        </FlexWidget>
      </FlexWidget>
      <TextWidget text={money(s.liquid, hidden)} style={{ color: CHALK, fontSize: 30, fontWeight: '700', fontFamily: 'serif' }} />
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text={`Today ${money(s.todaySpend, hidden, true)}`} style={{ color: MINT, fontSize: 12, fontWeight: '600' }} />
        <TextWidget text={next ? `${next.name} · ${formatDate(next.dueOn).slice(0, 5)}` : 'No bills soon'} style={{ color: MUTE, fontSize: 12 }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function QuickAddWidget() {
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: MINT, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' }} clickAction="OPEN_URI" clickActionData={{ uri: 'folio://add' }}>
      <TextWidget text="＋  Spend" style={{ color: '#04140d', fontSize: 16, fontWeight: '800' }} />
    </FlexWidget>
  );
}
