import '../global.css';
import '../src/lib/crypto-polyfill';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { addMonths, startOfMonth, today } from '@folio/core';
import { FolioProvider, invalidateLedger, Outbox, useCategories, useEntriesInRange, useLedgerContext, useObligations, useOutboxFlusher, usePosition, useProfile, useLiveRefresh } from '@folio/api';
import { PopButton } from '../src/components/ui';
import { ensureNotificationSetup, syncReminders } from '../src/lib/notifications';
import { secureGet, secureSet } from '../src/lib/secure-kv';
import { buildSnapshot, saveSnapshot } from '../src/lib/snapshot';
import { useUi } from '../src/lib/store';
import { supabase } from '../src/lib/supabase';
import { C, F } from '../src/lib/theme';
import { drainWatchQueue, pushSnapshotToWatch } from '../src/lib/wear';
import { refreshWidgets } from '../src/lib/widgets';
import { FolioWear } from '../modules/folio-wear';
import { SessionContext } from '../src/lib/session';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(C.ink);

// Refetch on app foreground / reconnect (TanStack's managers default to browser events).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
  return () => sub.remove();
});
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
const isForeground = () => AppState.currentState === 'active';

const outboxStorage = { getItem: (k: string) => secureGet(k), setItem: (k: string, v: string) => secureSet(k, v) };

/** Everything that keeps data flowing in the background while signed in. */
function SyncBridge({ userId }: { userId: string }) {
  const qc = useQueryClient();
  useLiveRefresh(!!userId, isForeground);
  const flush = useOutboxFlusher();
  const { ctx, people } = useLedgerContext();
  const pos = usePosition();
  const categories = useCategories();
  const t = today();
  const entries = useEntriesInRange({ from: addMonths(startOfMonth(t), -1, 1), to: t });
  const { items, rules } = useObligations(45);
  const hide = useUi((s) => s.hideBalances);
  const outboxRef = useRef<Outbox | null>(null);

  useEffect(() => {
    void flush();
    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flush();
    });
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void flush());
    return () => {
      unsub();
      sub.remove();
    };
  }, [flush]);

  // Watch → phone: post queued watch entries (idempotent on the watch's id).
  useEffect(() => {
    if (!ctx || !FolioWear) return;
    outboxRef.current = outboxRef.current ?? new Outbox(outboxStorage);
    const fallback = categories.data?.find((c) => c.systemKey === 'other_expense')?.id ?? null;
    const drain = () => void drainWatchQueue(supabase, ctx, outboxRef.current!, fallback, () => invalidateLedger(qc));
    drain();
    const s1 = FolioWear.addListener('onWearEntry', drain);
    const s2 = FolioWear.addListener('onSyncRequested', () => invalidateLedger(qc));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [ctx, categories.data, qc]);

  // Phone → widgets + watch: compact snapshot whenever the position changes.
  useEffect(() => {
    if (!pos.position || !categories.data || !entries.data) return;
    const snap = buildSnapshot({ position: pos.position, accounts: pos.accounts, balances: pos.balances, categories: categories.data, people, personBalances: pos.personBalances, entries: entries.data, obligations: items, today: t, hideBalances: hide });
    const timer = setTimeout(() => {
      void saveSnapshot(snap).then(() => refreshWidgets(snap));
      void pushSnapshotToWatch(snap);
    }, 800);
    return () => clearTimeout(timer);
  }, [pos.position, pos.accounts, pos.balances, pos.personBalances, categories.data, entries.data, items, people, hide, t]);

  // Reminders 2 days before every due date, end date and card statement date.
  const accounts = pos.accounts;
  useEffect(() => {
    if (!rules.length && !accounts.some((a) => a.card?.statementDay || a.loan?.tenureMonths)) return;
    const timer = setTimeout(() => {
      void ensureNotificationSetup().then((ok) => {
        if (ok) void syncReminders({ items, rules, accounts, today: t, hideAmounts: hide });
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [items, rules, accounts, hide, t]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = (r.notification.request.content.data as { url?: string })?.url;
      if (url) router.push(url as never);
    });
    return () => sub.remove();
  }, []);
  return null;
}

function LockGate({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const locked = useUi((s) => s.locked);
  const setLocked = useUi((s) => s.setLocked);
  const bio = useUi((s) => s.biometricEnabled);
  const profile = useProfile();
  const leftAt = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  const timeout = (profile.data?.lockTimeoutSeconds ?? 60) * 1000;

  const unlock = useCallback(async () => {
    const has = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!bio || !has) {
      setLocked(false);
      return;
    }
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Folio', fallbackLabel: 'Use device PIN', disableDeviceFallback: false });
    setFailed(!r.success);
    if (r.success) setLocked(false);
  }, [bio, setLocked]);

  useEffect(() => {
    if (!enabled) return;
    if (useUi.getState().locked) void unlock();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s === 'active' && leftAt.current && Date.now() - leftAt.current >= timeout && bio) {
        setLocked(true);
        void unlock();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && locked && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <View style={{ width: 64, height: 64, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.displayBold, fontSize: 38, color: '#04140d' }}>f</Text>
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 30, color: C.chalk }}>Folio is locked</Text>
          {failed && <Text style={{ color: C.mute, fontFamily: F.sans }}>Authentication didn’t go through.</Text>}
          <PopButton tone="mint" label="Unlock" icon="lock" onPress={() => void unlock()} size="lg" />
        </Animated.View>
      )}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, SpaceMono_400Regular });
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { retry: 0 } } }));
  const outbox = useMemo(() => new Outbox(outboxStorage), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const hydrate = useUi((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc, hydrate]);

  useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.ink }}>
      <SafeAreaProvider>
        <QueryClientProvider client={qc}>
          <SessionContext.Provider value={{ session }}>
            <FolioProvider client={supabase} outbox={outbox} source="mobile">
              <StatusBar style="light" />
              {session && <SyncBridge userId={session.user.id} />}
              <LockGate enabled={!!session}>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.ink }, animation: 'slide_from_right' }}>
                  {/* Everything requires this device to be unlocked once with the passphrase. */}
                  <Stack.Protected guard={!!session}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="add" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                    <Stack.Screen name="account-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                    <Stack.Screen name="accounts" />
                    <Stack.Screen name="account/[id]" />
                    <Stack.Screen name="card/[id]" />
                    <Stack.Screen name="people" />
                    <Stack.Screen name="person/[id]" />
                    <Stack.Screen name="loans" />
                    <Stack.Screen name="bills" />
                    <Stack.Screen name="more" />
                    <Stack.Screen name="ledger" />
                    <Stack.Screen name="loan/[id]" />
                    <Stack.Screen name="rule/[id]" />
                    <Stack.Screen name="rule-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                    <Stack.Screen name="settings" />
                    <Stack.Screen name="entry/[id]" />
                  </Stack.Protected>
                  <Stack.Protected guard={!session}>
                    <Stack.Screen name="login" />
                  </Stack.Protected>
                </Stack>
              </LockGate>
            </FolioProvider>
          </SessionContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
      <Text style={{ color: C.chalk, fontFamily: F.display, fontSize: 24 }}>Something went sideways</Text>
      <Text style={{ color: C.mute, textAlign: 'center' }}>{error.message}</Text>
      <Pressable onPress={retry}>
        <Text style={{ color: C.mint, fontFamily: F.bold }}>Try again</Text>
      </Pressable>
    </View>
  );
}
