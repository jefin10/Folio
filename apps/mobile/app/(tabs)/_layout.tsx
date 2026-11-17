import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/ui';
import { thud, tick } from '../../src/lib/haptics';
import { C, F } from '../../src/lib/theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'chart' },
  cards: { label: 'Cards', icon: 'card' },
  debit: { label: 'Debit', icon: 'bank' },
  grow: { label: 'Grow', icon: 'sprout' },
  emis: { label: 'EMIs', icon: 'loan' },
};

/** Custom tab bar: four destinations around a raised mint "add" button. */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes;
  const left = routes.slice(0, 2);
  const right = routes.slice(2);
  const item = (r: (typeof routes)[number]) => {
    const i = routes.indexOf(r);
    const focused = state.index === i;
    const meta = TABS[r.name] ?? { label: r.name, icon: 'dots' };
    return (
      <Pressable
        key={r.key}
        onPress={() => {
          tick();
          if (!focused) navigateToTab(r.key);
        }}
        style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
      >
        <Icon name={meta.icon} size={22} color={focused ? C.chalk : C.faint} />
        <Text style={{ color: focused ? C.chalk : C.faint, fontFamily: F.extrabold, fontSize: 10 }}>{meta.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 4, paddingTop: 8, backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center' }}>
      {left.map(item)}
      <Pressable
        onPress={() => {
          thud();
          router.push('/add');
        }}
        accessibilityLabel="New entry"
        style={{ width: 70, alignItems: 'center', marginTop: -26 }}
      >
        <View style={{ width: 58, height: 58 }}>
          <View style={{ position: 'absolute', left: 5, top: 5, width: 58, height: 58, backgroundColor: C.mintEdgeB }} />
          <View style={{ position: 'absolute', width: 58, height: 58, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={28} color="#04140d" strokeWidth={2.6} />
          </View>
        </View>
      </Pressable>
      {right.map(item)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.ink } }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cards" />
      <Tabs.Screen name="debit" />
      <Tabs.Screen name="grow" />
      <Tabs.Screen name="emis" />
    </Tabs>
  );
}
