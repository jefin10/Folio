/**
 * Keystore-backed key/value storage. expo-secure-store encrypts each value
 * with an Android Keystore key; values are chunked because large values
 * (e.g. an auth session) are not guaranteed to fit in one entry.
 */
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export async function secureGet(key: string): Promise<string | null> {
  const k = safeKey(key);
  const head = await SecureStore.getItemAsync(`${k}__n`, opts);
  if (head === null) return SecureStore.getItemAsync(k, opts);
  const n = Number(head);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await SecureStore.getItemAsync(`${k}__${i}`, opts);
    if (p === null) return null;
    parts.push(p);
  }
  return parts.join('');
}

export async function secureSet(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  await secureRemove(key);
  if (value.length <= CHUNK) {
    await SecureStore.setItemAsync(k, value, opts);
    return;
  }
  const n = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), opts);
  await SecureStore.setItemAsync(`${k}__n`, String(n), opts);
}

export async function secureRemove(key: string): Promise<void> {
  const k = safeKey(key);
  const head = await SecureStore.getItemAsync(`${k}__n`, opts);
  if (head !== null) {
    for (let i = 0; i < Number(head); i++) await SecureStore.deleteItemAsync(`${k}__${i}`, opts);
    await SecureStore.deleteItemAsync(`${k}__n`, opts);
  }
  await SecureStore.deleteItemAsync(k, opts);
}

export const secureStorage = { getItem: secureGet, setItem: secureSet, removeItem: secureRemove };
