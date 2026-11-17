import * as Clipboard from 'expo-clipboard';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { checkVaultEntry, type VaultEntry } from '@folio/core';
import { success, tick, warn } from '../lib/haptics';
import { C, F } from '../lib/theme';
import { deleteEntry, lockVault, onVaultLock, readEntry, saveEntry, vaultIndex, VaultResetByAndroid } from '../lib/vault';
import { ActionSheet, Ghost, Icon, Input, Plate, PopButton, Tap } from './ui';

type FieldKey = 'cardNumber' | 'expiry' | 'nameOnCard' | 'accountNumber' | 'ifsc' | 'customerId' | 'upiId' | 'notes';
const LABEL: Record<FieldKey, string> = {
  cardNumber: 'Card number',
  expiry: 'Expiry (MM/YY)',
  nameOnCard: 'Name on card',
  accountNumber: 'Account number',
  ifsc: 'IFSC',
  customerId: 'Customer ID',
  upiId: 'UPI ID',
  notes: 'Notes',
};

const groupDigits = (s: string) => s.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
const mask = (k: FieldKey, v: string) => (k === 'cardNumber' ? `•••• •••• •••• ${v.replace(/\D/g, '').slice(-4)}` : k === 'accountNumber' ? `•••••• ${v.slice(-4)}` : '••••••');

/**
 * Card / account numbers kept only on this phone (see src/lib/vault.ts).
 * `fields` decides which details apply: a bank also carries its debit card's.
 */
export function VaultSection({ accountId, fields }: { accountId: string; fields: FieldKey[] }) {
  const [has, setHas] = useState(false);
  const [entry, setEntry] = useState<VaultEntry | null>(null);
  const [editing, setEditing] = useState<Partial<Record<FieldKey, string>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    setEntry(null);
    setEditing(null);
    if (timer.current) clearTimeout(timer.current);
    void ScreenCapture.allowScreenCaptureAsync('folio-vault').catch(() => undefined);
  }, []);

  useEffect(() => {
    void vaultIndex().then((ids) => setHas(ids.includes(accountId)));
    const off = onVaultLock(hide);
    return () => {
      off();
      hide();
    };
  }, [accountId, hide]);

  const showFor60s = () => {
    void ScreenCapture.preventScreenCaptureAsync('folio-vault').catch(() => undefined);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      hide();
      lockVault();
    }, 60_000);
  };

  const failure = (e: unknown) => {
    warn();
    if (e instanceof VaultResetByAndroid) setError(e.message);
    else if (!/cancel/i.test(String(e))) setError('Couldn’t unlock.');
  };

  const reveal = async () => {
    setError(null);
    try {
      setBusy(true);
      const e = await readEntry(accountId);
      setEntry(e);
      showFor60s();
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const clean: Partial<Record<FieldKey, string>> = {};
    for (const k of fields) {
      const v = (editing[k] ?? '').trim();
      if (v) clean[k] = k === 'ifsc' ? v.toUpperCase() : k === 'cardNumber' ? v.replace(/[\s-]/g, '') : v;
    }
    const problem = checkVaultEntry(clean);
    if (problem) return setError(problem);
    try {
      setBusy(true);
      await saveEntry({ accountId, ...clean });
      setHas(true);
      setEntry({ accountId, ...clean, updatedAt: new Date().toISOString() });
      setEditing(null);
      setError(null);
      success();
      showFor60s();
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (v: string) => {
    tick();
    await Clipboard.setStringAsync(v);
    setTimeout(() => {
      void Clipboard.getStringAsync()
        .then((now) => now === v && Clipboard.setStringAsync(''))
        .catch(() => undefined);
    }, 60_000);
  };

  return (
    <Plate style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="lock" size={17} color={C.mint} />
        <Text style={{ flex: 1, color: C.chalk, fontFamily: F.bold, fontSize: 16 }}>Private details</Text>
      </View>

      {editing ? (
        <View style={{ gap: 10 }}>
          {fields.map((k) => (
            <View key={k} style={{ gap: 4 }}>
              <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{LABEL[k].toUpperCase()}</Text>
              <Input
                value={editing[k] ?? ''}
                onChangeText={(v) => setEditing((s) => ({ ...s, [k]: k === 'cardNumber' ? groupDigits(v.replace(/[^\d]/g, '').slice(0, 19)) : v }))}
                keyboardType={k === 'cardNumber' || k === 'accountNumber' ? 'number-pad' : 'default'}
                autoCapitalize={k === 'ifsc' || k === 'nameOnCard' ? 'characters' : 'none'}
                autoCorrect={false}
                multiline={k === 'notes'}
                style={k === 'cardNumber' || k === 'accountNumber' || k === 'ifsc' ? { fontFamily: F.mono, letterSpacing: 1.5 } : undefined}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <PopButton size="sm" tone="mint" label="Save" icon="check" loading={busy} onPress={save} />
            <Ghost label="Cancel" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : entry ? (
        <View style={{ gap: 2 }}>
          {fields.filter((k) => entry[k]).map((k) => (
            <Tap key={k} onPress={() => void copy(entry[k]!)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 }} pressedStyle={{ opacity: 0.6 }}>
              <Text style={{ width: 110, color: C.mute, fontFamily: F.semibold, fontSize: 12 }}>{LABEL[k]}</Text>
              <Text selectable style={{ flex: 1, color: C.chalk, fontFamily: k === 'notes' || k === 'nameOnCard' ? F.semibold : F.mono, fontSize: 14, letterSpacing: k === 'cardNumber' ? 1.5 : 0 }}>
                {k === 'cardNumber' ? groupDigits(entry[k]!) : entry[k]}
              </Text>
              <Icon name="doc" size={15} color={C.faint} />
            </Tap>
          ))}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            <Ghost label="Hide" icon="eyeOff" onPress={hide} />
            <Ghost label="Edit" icon="edit" onPress={() => setEditing(Object.fromEntries(fields.map((k) => [k, k === 'cardNumber' && entry[k] ? groupDigits(entry[k]!) : entry[k] ?? ''])))} />
            <Ghost label="Delete" icon="trash" color={C.coral} onPress={() => setSheet(true)} />
          </View>
        </View>
      ) : has ? (
        <View style={{ gap: 10 }}>
          {fields
            .filter((k) => k !== 'notes')
            .slice(0, 3)
            .map((k) => (
              <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ width: 110, color: C.mute, fontFamily: F.semibold, fontSize: 12 }}>{LABEL[k]}</Text>
                <Text style={{ color: C.chalkDim, fontFamily: F.mono, fontSize: 14 }}>{mask(k, '0000')}</Text>
              </View>
            ))}
          <PopButton size="sm" tone="dark" label="Reveal" icon="eye" loading={busy} onPress={reveal} />
        </View>
      ) : (
        <PopButton size="sm" tone="dark" label="Add private details" icon="plus" onPress={() => setEditing({})} />
      )}
      {error && <Text style={{ color: C.coral, fontFamily: F.semibold, fontSize: 12 }}>{error}</Text>}
      <ActionSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Delete private details?"
        sub="They leave this phone's vault for good."
        options={[{ label: 'Delete', icon: 'trash', danger: true, onPress: () => void deleteEntry(accountId).then(() => { setHas(false); hide(); }).catch(failure) }]}
        cancelLabel="Cancel"
      />
    </Plate>
  );
}

export const BANK_FIELDS: FieldKey[] = ['accountNumber', 'ifsc', 'customerId', 'upiId', 'notes'];
export const CARD_FIELDS: FieldKey[] = ['cardNumber', 'expiry', 'nameOnCard', 'notes'];
export const BANK_WITH_DEBIT_FIELDS: FieldKey[] = ['accountNumber', 'ifsc', 'customerId', 'upiId', 'cardNumber', 'expiry', 'nameOnCard', 'notes'];
