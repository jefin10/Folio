import { describe, expect, it } from 'vitest';
import { checkVaultEntry, emptyVault, exportBackup, fromB64, importBackup, newDataKey, openWithKey, sealWithKey, toB64, VaultError } from '../src/vault-crypto';

const FAST = { N: 2 ** 10, r: 8, p: 1 }; // test-only scrypt cost

describe('private vault crypto', () => {
  const data = emptyVault();
  data.entries.acc1 = { accountId: 'acc1', cardNumber: '4111 1111 1111 1111', expiry: '08/29', nameOnCard: 'A KUMAR', notes: 'Nominee: parent — ₹ ✓', updatedAt: '2026-11-17T10:00:00Z' };

  it('seals and opens with the device key; ciphertext never contains the plaintext', () => {
    const key = newDataKey();
    const sealed = sealWithKey(key, data);
    expect(sealed).not.toContain('4111');
    expect(String.fromCharCode(...fromB64(sealed))).not.toContain('4111');
    expect(openWithKey(key, sealed)).toEqual(data);
  });

  it('fresh nonce every seal', () => {
    const key = newDataKey();
    expect(sealWithKey(key, data)).not.toBe(sealWithKey(key, data));
  });

  it('rejects a wrong key and tampered data', () => {
    const sealed = sealWithKey(newDataKey(), data);
    expect(() => openWithKey(newDataKey(), sealed)).toThrow(VaultError);
    const raw = fromB64(sealed);
    raw[20] = raw[20]! ^ 1;
    const key = newDataKey();
    expect(() => openWithKey(key, toB64(raw))).toThrow(VaultError);
  });

  it('password backup round-trips, wrong password fails', async () => {
    const backup = await exportBackup(data, 'correct horse battery', FAST);
    expect(backup).not.toContain('4111');
    expect(await importBackup(backup, 'correct horse battery')).toEqual(data);
    await expect(importBackup(backup, 'wrong password!')).rejects.toThrow(/Wrong backup password/);
    await expect(importBackup('{"hello":1}', 'x')).rejects.toThrow(/not a Folio vault backup/);
    await expect(exportBackup(data, 'short', FAST)).rejects.toThrow(/at least 8/);
  });

  it('refuses CVV/PIN/OTP and malformed numbers', () => {
    expect(checkVaultEntry({ notes: 'cvv 123' })).toMatch(/never keeps/);
    expect(checkVaultEntry({ notes: 'ATM PIN is 4321' })).toMatch(/never keeps/);
    expect(checkVaultEntry({ cardNumber: '4111 1111 1111 1112' })).toMatch(/typo/);
    expect(checkVaultEntry({ cardNumber: '4111 1111 1111 1111', expiry: '13/29' })).toMatch(/MM\/YY/);
    expect(checkVaultEntry({ ifsc: 'HDFC0001234' })).toBeNull();
    expect(checkVaultEntry({ ifsc: 'HDFC1001234' })).toMatch(/IFSC/);
    expect(checkVaultEntry({ accountNumber: '50100123456789', ifsc: 'hdfc0001234', upiId: 'me@okhdfc' })).toBeNull();
  });
});
