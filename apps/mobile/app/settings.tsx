import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { forgetThisDevice, signOutOtherDevices, useFolio, useProfile, useUpdateProfile } from '@folio/api';
import { FolioWear, type WearNode } from '../modules/folio-wear';
import { Screen } from '../src/components/Screen';
import { Chip, Field, Plate, PopButton, Section } from '../src/components/ui';
import { VaultSettings } from '../src/components/VaultSettings';
import { success } from '../src/lib/haptics';
import { useUi } from '../src/lib/store';
import { SUPABASE_URL } from '../src/lib/supabase';
import { C, F } from '../src/lib/theme';

function Line({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.chalk, fontFamily: F.semibold, fontSize: 15 }}>{label}</Text>
        {sub && <Text style={{ color: C.mute, fontFamily: F.sans, fontSize: 12, marginTop: 2 }}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function Settings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const { sb } = useFolio();
  const bio = useUi((s) => s.biometricEnabled);
  const setBio = useUi((s) => s.setBiometricEnabled);
  const hide = useUi((s) => s.hideBalances);
  const setHide = useUi((s) => s.setHideBalances);
  const [hasBio, setHasBio] = useState<boolean | null>(null);
  const [nodes, setNodes] = useState<WearNode[] | null>(null);
  useEffect(() => {
    void (async () => setHasBio((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())))();
    if (FolioWear) void FolioWear.connectedNodes().then(setNodes).catch(() => setNodes([]));
  }, []);
  const lock = profile.data?.lockTimeoutSeconds ?? 60;
  return (
    <Screen back title="Settings">
      <Section title="Security">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ paddingHorizontal: 16 }}>
            <Line label="Biometric lock" sub={hasBio === false ? 'No fingerprint enrolled' : undefined} right={<Switch value={bio} onValueChange={setBio} thumbColor={bio ? C.mint : C.mute} trackColor={{ true: 'rgba(61,220,151,0.4)', false: C.ink4 }} />} />
            <Line label="Hide balances" right={<Switch value={hide} onValueChange={setHide} thumbColor={hide ? C.mint : C.mute} trackColor={{ true: 'rgba(61,220,151,0.4)', false: C.ink4 }} />} />
          </Plate>
          <View style={{ marginTop: 14 }}>
            <Field label="Lock again after">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[[0, 'Immediately'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [900, '15 min']].map(([v, l]) => (
                  <Chip key={v} label={l as string} active={lock === v} onPress={() => update.mutate({ lockTimeoutSeconds: v as number })} />
                ))}
              </View>
            </Field>
          </View>
        </View>
      </Section>
      <Section title="Private vault">
        <VaultSettings />
      </Section>
      <Section title="Devices">
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <PopButton tone="dark" label="Sign out other devices" icon="shield" onPress={() => void signOutOtherDevices(sb).then(success)} />
          <PopButton tone="coral" label="Forget this phone" icon="logout" onPress={() => void forgetThisDevice(sb)} />
        </View>
      </Section>
      <Section title="Galaxy Watch">
        <View style={{ paddingHorizontal: 20 }}>
          <Plate style={{ padding: 16 }}>
            {!FolioWear ? (
              <Text style={{ color: C.mute, fontFamily: F.sans }}>Unavailable</Text>
            ) : nodes === null ? (
              <Text style={{ color: C.mute, fontFamily: F.sans }}>Searching…</Text>
            ) : nodes.length === 0 ? (
              <Text style={{ color: C.mute, fontFamily: F.sans }}>No watch connected</Text>
            ) : (
              nodes.map((n) => <Text key={n.id} style={{ color: C.chalk, fontFamily: F.semibold }}>⌚ {n.name} {n.nearby ? '· connected' : ''}</Text>)
            )}
          </Plate>
        </View>
      </Section>
      <Section title="About">
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: C.mute, fontFamily: F.sans }}>Server: {SUPABASE_URL.replace('https://', '')}</Text>
        </View>
      </Section>
    </Screen>
  );
}
