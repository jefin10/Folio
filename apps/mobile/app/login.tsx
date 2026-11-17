import { useState } from 'react';
import { KeyboardAvoidingView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { unlockDevice } from '@folio/api';
import { Field, Input, PopButton } from '../src/components/ui';
import { success, warn } from '../src/lib/haptics';
import { useUi } from '../src/lib/store';
import { supabase } from '../src/lib/supabase';
import { C, F } from '../src/lib/theme';

/** Shown only on a device that hasn't been set up: one passphrase, then biometrics. */
export default function Unlock() {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLocked = useUi((s) => s.setLocked);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await unlockDevice(supabase, passphrase);
    setBusy(false);
    if (res.ok) {
      setLocked(false); // just proved who we are — no second prompt
      success();
    } else {
      warn();
      setError(res.message);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.ink, justifyContent: 'center', padding: 24 }}>
      <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: 28 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 58, height: 58 }}>
            <View style={{ position: 'absolute', left: 5, top: 5, width: 58, height: 58, backgroundColor: C.mintEdgeB }} />
            <View style={{ position: 'absolute', width: 58, height: 58, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.displayBold, fontSize: 34, color: '#04140d' }}>f</Text>
            </View>
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 44, color: C.chalk }}>folio</Text>
        </View>
        <Field label="Passphrase" error={error}>
          <Input value={passphrase} onChangeText={setPassphrase} secureTextEntry autoFocus autoCapitalize="none" autoComplete="current-password" onSubmitEditing={submit} returnKeyType="go" />
        </Field>
        <PopButton tone="mint" size="lg" label="Unlock this device" icon="lock" onPress={submit} loading={busy} disabled={passphrase.length < 4} />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
