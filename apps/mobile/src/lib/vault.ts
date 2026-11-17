/**
 * Phone-only private vault. Card numbers, account numbers, IFSC, UPI IDs…
 * live ONLY here: never sent to the server, the web, the watch or a widget.
 *
 *  - A random 256-bit data key is stored in Android Keystore-backed
 *    SecureStore with requireAuthentication: reading it needs a fresh
 *    fingerprint (or device credential).
 *  - The vault is AES-256-GCM sealed with that key (packages/core/vault-crypto)
 *    and stored separately, so one fingerprint opens every entry.
 *  - The unlocked key is kept in memory for 60 s at most, and dropped as soon
 *    as the app goes to the background.
 */
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { emptyVault, exportBackup, fromB64, importBackup, newDataKey, openWithKey, sealWithKey, toB64, type VaultData, type VaultEntry } from '@folio/core';
import { secureGet, secureRemove, secureSet } from './secure-kv';

const KEY_ITEM = 'folio_vault_key_v1';
const DATA_ITEM = 'folio.vault.data.v1';
const INDEX_ITEM = 'folio.vault.index.v1'; // which accounts have entries (no secrets)
const HOLD_MS = 60_000;

const authOpts: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock private details',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let held: { key: Uint8Array; until: number } | null = null;
const listeners = new Set<() => void>();

AppState.addEventListener('change', (s) => {
  if (s !== 'active') lockVault();
});

export function lockVault() {
  if (held) held.key.fill(0);
  held = null;
  for (const l of listeners) l();
}

export function onVaultLock(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class VaultResetByAndroid extends Error {
  constructor() {
    super('Android reset the vault key (a new fingerprint was enrolled). Restore your vault from a backup.');
  }
}

async function exists(): Promise<boolean> {
  return (await secureGet(INDEX_ITEM)) !== null;
}

/** The data key; prompts for a fingerprint unless unlocked in the last minute. */
async function dataKey(create: boolean): Promise<Uint8Array> {
  if (held && held.until > Date.now()) return held.key;
  let key: Uint8Array;
  if (await exists()) {
    let b64: string | null;
    try {
      b64 = await SecureStore.getItemAsync(KEY_ITEM, authOpts);
    } catch (e) {
      if (/invalidat|permanently/i.test(String(e))) throw new VaultResetByAndroid();
      throw e;
    }
    if (!b64) throw new VaultResetByAndroid();
    key = fromB64(b64);
  } else {
    if (!create) throw new Error('No private details saved yet');
    key = newDataKey();
    await SecureStore.setItemAsync(KEY_ITEM, toB64(key), authOpts);
    await secureSet(DATA_ITEM, sealWithKey(key, emptyVault()));
    await secureSet(INDEX_ITEM, '[]');
  }
  held = { key, until: Date.now() + HOLD_MS };
  return key;
}

export async function vaultIndex(): Promise<string[]> {
  try {
    return JSON.parse((await secureGet(INDEX_ITEM)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

async function readAll(key: Uint8Array): Promise<VaultData> {
  const sealed = await secureGet(DATA_ITEM);
  return sealed ? openWithKey(key, sealed) : emptyVault();
}

async function writeAll(key: Uint8Array, data: VaultData) {
  await secureSet(DATA_ITEM, sealWithKey(key, data));
  await secureSet(INDEX_ITEM, JSON.stringify(Object.keys(data.entries)));
}

export async function readEntry(accountId: string): Promise<VaultEntry | null> {
  const key = await dataKey(false);
  return (await readAll(key)).entries[accountId] ?? null;
}

export async function saveEntry(entry: Omit<VaultEntry, 'updatedAt'>): Promise<void> {
  const key = await dataKey(true);
  const data = await readAll(key);
  data.entries[entry.accountId] = { ...entry, updatedAt: new Date().toISOString() };
  await writeAll(key, data);
}

export async function deleteEntry(accountId: string): Promise<void> {
  const key = await dataKey(false);
  const data = await readAll(key);
  delete data.entries[accountId];
  await writeAll(key, data);
}

export async function exportVault(password: string): Promise<string> {
  const key = await dataKey(false);
  return exportBackup(await readAll(key), password);
}

/** Merge a backup into this phone's vault (backup wins on conflicts). */
export async function importVault(text: string, password: string): Promise<number> {
  const incoming = await importBackup(text, password);
  const key = await dataKey(true);
  const data = (await exists()) ? await readAll(key).catch(() => emptyVault()) : emptyVault();
  Object.assign(data.entries, incoming.entries);
  await writeAll(key, data);
  return Object.keys(incoming.entries).length;
}

/** Wipe the vault from this phone (also the recovery path after a key reset). */
export async function eraseVault(): Promise<void> {
  lockVault();
  await SecureStore.deleteItemAsync(KEY_ITEM, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }).catch(() => undefined);
  await secureRemove(DATA_ITEM);
  await secureRemove(INDEX_ITEM);
}
