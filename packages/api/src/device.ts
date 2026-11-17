/**
 * Folio has a single owner and no sign-in screen. A new device unlocks once
 * with the owner's passphrase (a GoTrue password on a fixed internal login);
 * afterwards it keeps its session and is unlocked locally by biometrics.
 * The passphrase itself lives only on the server.
 */
import type { Sb } from './repo';

/** Internal login identity of the owner. `.invalid` is a reserved TLD: no mail is ever sent. */
export const FOLIO_OWNER_LOGIN = 'owner@folio.invalid';

export async function unlockDevice(sb: Sb, passphrase: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await sb.auth.signInWithPassword({ email: FOLIO_OWNER_LOGIN, password: passphrase });
  if (!error) return { ok: true };
  const msg = error.message ?? '';
  if (/too many|locked/i.test(msg)) return { ok: false, message: msg };
  if (/invalid login|credentials/i.test(msg)) return { ok: false, message: 'That passphrase isn’t right.' };
  if (/fetch|network/i.test(msg)) return { ok: false, message: 'Can’t reach your Folio server. Check the connection.' };
  return { ok: false, message: msg || 'Could not unlock this device.' };
}

/** Forget this device (it will need the passphrase again). */
export const forgetThisDevice = (sb: Sb) => sb.auth.signOut({ scope: 'local' });

/** Sign out every other phone/browser/watch-bridge, keeping this one. */
export const signOutOtherDevices = (sb: Sb) => sb.auth.signOut({ scope: 'others' });
