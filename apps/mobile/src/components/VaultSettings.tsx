import { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { success, warn } from '../lib/haptics';
import { C, F } from '../lib/theme';
import { eraseVault, exportVault, importVault, vaultIndex, VaultResetByAndroid } from '../lib/vault';
import { ActionSheet, Ghost, Input, Plate, PopButton } from './ui';

/** Vault housekeeping: password-encrypted backup, restore, erase. */
export function VaultSettings() {
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<'idle' | 'export' | 'import'>('idle');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [backup, setBackup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);

  const refresh = () => void vaultIndex().then((ids) => setCount(ids.length));
  useEffect(refresh, []);

  const reset = () => {
    setMode('idle');
    setPw('');
    setPw2('');
    setBackup('');
    setError(null);
  };

  const doExport = async () => {
    if (pw.length < 8) return setError('At least 8 characters');
    if (pw !== pw2) return setError('Passwords don’t match');
    try {
      setBusy(true);
      const text = await exportVault(pw);
      await Share.share({ title: 'Folio vault backup', message: text });
      success();
      reset();
    } catch (e) {
      warn();
      setError(e instanceof VaultResetByAndroid ? e.message : e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    try {
      setBusy(true);
      const n = await importVault(backup, pw);
      success();
      setRestored(n);
      reset();
      refresh();
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Plate style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 15 }}>
          {count} saved · on this phone only
        </Text>
        {mode === 'export' && (
          <View style={{ gap: 8 }}>
            <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="Backup password" autoCapitalize="none" />
            <Input value={pw2} onChangeText={setPw2} secureTextEntry placeholder="Repeat password" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <PopButton size="sm" tone="mint" label="Create backup" icon="download" loading={busy} onPress={doExport} />
              <Ghost label="Cancel" onPress={reset} />
            </View>
          </View>
        )}
        {mode === 'import' && (
          <View style={{ gap: 8 }}>
            <Input value={backup} onChangeText={setBackup} placeholder="Paste backup" multiline autoCapitalize="none" autoCorrect={false} style={{ height: 90, fontFamily: F.mono, fontSize: 11 }} />
            <Input value={pw} onChangeText={setPw} secureTextEntry placeholder="Backup password" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <PopButton size="sm" tone="mint" label="Restore" icon="upload" loading={busy} onPress={doImport} disabled={!backup.trim() || !pw} />
              <Ghost label="Cancel" onPress={reset} />
            </View>
          </View>
        )}
        {mode === 'idle' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <PopButton size="sm" tone="dark" label="Encrypted backup" icon="download" disabled={count === 0} onPress={() => setMode('export')} />
            <PopButton size="sm" tone="dark" label="Restore" icon="upload" onPress={() => setMode('import')} />
            <Ghost label="Erase" icon="trash" color={C.coral} onPress={() => setSheet(true)} />
          </View>
        )}
        {error && <Text style={{ color: C.coral, fontFamily: F.semibold, fontSize: 12 }}>{error}</Text>}
      </Plate>
      <ActionSheet
        open={restored !== null}
        onClose={() => setRestored(null)}
        title="Vault restored"
        sub={`${restored ?? 0} item${restored === 1 ? '' : 's'} back in this phone's vault.`}
        options={[{ label: 'Got it', icon: 'check', onPress: () => {} }]}
      />
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Erase the vault from this phone?"
        sub="Only an encrypted backup can bring it back."
        options={[{ label: 'Erase', icon: 'trash', danger: true, onPress: () => void eraseVault().then(refresh) }]}
        cancelLabel="Cancel"
      />
    </View>
  );
}
