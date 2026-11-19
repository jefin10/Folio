import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { forgetThisDevice, useFolio, useProfile } from '@folio/api';
import { Screen } from '../src/components/Screen';
import { Icon, Plate } from '../src/components/ui';
import { tick } from '../src/lib/haptics';
import { C, F } from '../src/lib/theme';

const LINKS = [
  { href: '/ledger', label: 'Ledger', icon: 'receipt', sub: 'Every entry, searchable' },
  { href: '/grow', label: 'Grow', icon: 'sprout', sub: 'FDs, RDs, stocks, mutual funds' },
  { href: '/accounts', label: 'Accounts', icon: 'bank', sub: 'Banks, cash, wallets, deposits' },
  { href: '/people', label: 'People', icon: 'users', sub: 'Who owes you, who you owe' },
  { href: '/loans', label: 'Loans & EMIs', icon: 'loan', sub: 'Principal, interest, schedule' },
  { href: '/bills', label: 'Bills & autopay', icon: 'repeat', sub: 'Subscriptions, rent, insurance' },
  { href: '/settings', label: 'Settings', icon: 'settings', sub: 'Lock, categories, watch, widgets' },
];

export default function More() {
  const profile = useProfile();
  const { sb } = useFolio();
  return (
    <Screen back title="More" eyebrow={profile.data?.displayName ?? undefined}>
      <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 10 }}>
        {LINKS.map((l) => (
          <Pressable
            key={l.href}
            onPress={() => {
              tick();
              router.push(l.href as never);
            }}
          >
            <Plate style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.ink3, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={l.icon} size={20} color={C.mint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 16 }}>{l.label}</Text>
                <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12.5, marginTop: 2 }}>{l.sub}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={C.faint} />
            </Plate>
          </Pressable>
        ))}
        <Pressable onPress={() => void forgetThisDevice(sb)} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: C.coral, fontFamily: F.bold }}>Forget this device</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
