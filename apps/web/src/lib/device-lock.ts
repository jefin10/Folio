'use client';
/**
 * Optional local unlock for this browser using the platform authenticator
 * (fingerprint / Windows Hello / Touch ID) via WebAuthn. It gates the UI on
 * this device; the server session is what actually authenticates requests.
 */
const KEY = 'folio.device-lock.credential';

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function deviceLockEnabled(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export async function deviceLockSupported(): Promise<boolean> {
  try {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enrollDeviceLock(): Promise<boolean> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Folio', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'folio', displayName: 'Folio' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  try {
    localStorage.setItem(KEY, b64(cred.rawId));
  } catch {
    return false;
  }
  return true;
}

export async function verifyDeviceLock(): Promise<boolean> {
  const id = (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })();
  if (!id) return true;
  try {
    const res = await navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60_000 },
    });
    return !!res;
  } catch {
    return false;
  }
}

export function disableDeviceLock() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
