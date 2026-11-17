/**
 * Crypto for the phone-only private vault (full card / account numbers).
 *
 * The vault is sealed with a random 256-bit data key using AES-256-GCM. On the
 * phone that data key lives in the Android Keystore behind biometrics, so the
 * vault itself never leaves the device and never reaches the server. Backups
 * are re-sealed under a key derived from a password with scrypt.
 *
 * CVV, PINs and OTPs are deliberately not accepted.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export interface VaultEntry {
  accountId: string;
  cardNumber?: string;
  expiry?: string; // MM/YY
  nameOnCard?: string;
  accountNumber?: string;
  ifsc?: string;
  customerId?: string;
  upiId?: string;
  notes?: string;
  updatedAt: string;
}

export interface VaultData {
  v: 1;
  entries: Record<string, VaultEntry>;
}

export const emptyVault = (): VaultData => ({ v: 1, entries: {} });

export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: 'bad_password' | 'corrupt' | 'forbidden' | 'invalid',
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

// --- small, runtime-independent helpers (Hermes, browsers, Node) -----------
function random(n: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error('Secure random generator unavailable');
  return c.getRandomValues(new Uint8Array(n));
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      cp = 0;
    }
  }
  return Uint8Array.from(out);
}

function fromUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i]!;
    let cp: number;
    if (x < 0x80) (cp = x), (i += 1);
    else if (x < 0xe0) (cp = ((x & 31) << 6) | (b[i + 1]! & 63)), (i += 2);
    else if (x < 0xf0) (cp = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63)), (i += 3);
    else (cp = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63)), (i += 4);
    s += String.fromCodePoint(cp);
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toB64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + '=';
  }
  return out;
}
export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1] ?? 'A') << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out.push((n >> 16) & 255);
    if (clean[i + 2]) out.push((n >> 8) & 255);
    if (clean[i + 3]) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

// --- sealing ----------------------------------------------------------------
export function newDataKey(): Uint8Array {
  return random(32);
}

/** AES-256-GCM: base64(nonce‖ciphertext‖tag). */
export function sealWithKey(key: Uint8Array, data: VaultData): string {
  const nonce = random(12);
  const ct = gcm(key, nonce).encrypt(utf8(JSON.stringify(data)));
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce, 0);
  out.set(ct, 12);
  return toB64(out);
}

export function openWithKey(key: Uint8Array, sealed: string): VaultData {
  const raw = fromB64(sealed);
  if (raw.length < 29) throw new VaultError('Vault data is damaged', 'corrupt');
  let plain: Uint8Array;
  try {
    plain = gcm(key, raw.subarray(0, 12)).decrypt(raw.subarray(12));
  } catch {
    throw new VaultError('Vault could not be opened with this key', 'corrupt');
  }
  const data = JSON.parse(fromUtf8(plain)) as VaultData;
  if (data?.v !== 1 || typeof data.entries !== 'object') throw new VaultError('Unknown vault format', 'corrupt');
  return data;
}

// --- password backups ---------------------------------------------------------
export interface BackupParams {
  N: number;
  r: number;
  p: number;
}
export const DEFAULT_BACKUP_PARAMS: BackupParams = { N: 2 ** 15, r: 8, p: 1 };

export async function exportBackup(data: VaultData, password: string, params: BackupParams = DEFAULT_BACKUP_PARAMS): Promise<string> {
  if (password.length < 8) throw new VaultError('Use a backup password of at least 8 characters', 'invalid');
  const salt = random(16);
  const key = await scryptAsync(utf8(password), salt, { ...params, dkLen: 32 });
  return JSON.stringify({ format: 'folio-vault-backup', v: 1, kdf: 'scrypt', ...params, salt: toB64(salt), sealed: sealWithKey(key, data) });
}

export async function importBackup(text: string, password: string): Promise<VaultData> {
  let o: { format?: string; v?: number; N?: number; r?: number; p?: number; salt?: string; sealed?: string };
  try {
    o = JSON.parse(text.trim());
  } catch {
    throw new VaultError('That is not a Folio vault backup', 'corrupt');
  }
  if (o.format !== 'folio-vault-backup' || o.v !== 1 || !o.salt || !o.sealed || !o.N || !o.r || !o.p) throw new VaultError('That is not a Folio vault backup', 'corrupt');
  const key = await scryptAsync(utf8(password), fromB64(o.salt), { N: o.N, r: o.r, p: o.p, dkLen: 32 });
  try {
    return openWithKey(key, o.sealed);
  } catch {
    throw new VaultError('Wrong backup password', 'bad_password');
  }
}

// --- validation ---------------------------------------------------------------
const FORBIDDEN = /\b(cvv|cvc|cvv2|pin|mpin|upi\s*pin|otp|atm\s*pin)\b/i;

function luhnOk(num: string): boolean {
  let s = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
    alt = !alt;
  }
  return s % 10 === 0;
}

/** Returns a user-facing problem, or null when the entry is fine to store. */
export function checkVaultEntry(e: Omit<VaultEntry, 'updatedAt' | 'accountId'>): string | null {
  for (const v of Object.values(e)) if (typeof v === 'string' && v.length > 200) return 'Keep each field under 200 characters';
  if (e.notes && FORBIDDEN.test(e.notes)) return 'The vault never keeps CVV, PINs or OTPs';
  if (e.cardNumber) {
    const d = e.cardNumber.replace(/[\s-]/g, '');
    if (!/^\d{12,19}$/.test(d)) return 'Card number should be 12–19 digits';
    if (!luhnOk(d)) return 'That card number has a typo (checksum failed)';
  }
  if (e.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(e.expiry)) return 'Expiry as MM/YY';
  if (e.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(e.ifsc.toUpperCase())) return 'IFSC looks like ABCD0123456';
  if (e.accountNumber && !/^[0-9A-Za-z]{6,20}$/.test(e.accountNumber.replace(/\s/g, ''))) return 'Account number should be 6–20 letters/digits';
  return null;
}
