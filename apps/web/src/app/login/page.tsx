'use client';
import { motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { unlockDevice } from '@folio/api';
import { Field, PopButton, TextInput } from '@/components/ui/primitives';
import { deviceLockSupported, enrollDeviceLock } from '@/lib/device-lock';
import { useSession } from '@/lib/session';
import { getSupabase, supabaseConfigured } from '@/lib/supabase';

/** First visit on a browser: one passphrase, then this browser stays unlocked. */
function UnlockInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerBio, setOfferBio] = useState(false);

  useEffect(() => {
    if (session && !offerBio) router.replace(params.get('next') || '/');
  }, [session, offerBio, router, params]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const canBio = await deviceLockSupported();
    if (canBio) setOfferBio(true);
    const res = await unlockDevice(getSupabase(), passphrase);
    setBusy(false);
    if (!res.ok) {
      setOfferBio(false);
      setError(res.message);
    }
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-mint/10 blur-[120px]" />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }} className="relative w-full max-w-[400px]">
        <div className="mb-10 text-center">
          <div className="pop pop-mint mx-auto grid size-14 place-items-center font-display text-3xl font-bold">f</div>
          <h1 className="mt-6 font-display text-[44px] leading-none font-semibold tracking-tight">folio</h1>
          <p className="mt-3 text-sm text-mute">{session && offerBio ? 'This browser is set up.' : 'New device. Enter your passphrase once.'}</p>
        </div>
        <div className="plate p-6">
          {!supabaseConfigured() && <div className="mb-5 rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-gold">Supabase isn&apos;t configured for this build.</div>}
          {session && offerBio ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-chalk-dim">Unlock Folio with your fingerprint or face on this browser from now on?</p>
              <PopButton tone="mint" size="lg" className="w-[calc(100%-5px)]" onClick={async () => { await enrollDeviceLock().catch(() => false); router.replace(params.get('next') || '/'); }}>
                Use biometrics
              </PopButton>
              <button className="cursor-pointer text-sm font-semibold text-mute hover:text-chalk" onClick={() => router.replace(params.get('next') || '/')}>
                Not now
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <Field label="Passphrase" error={error}>
                <TextInput type="password" autoComplete="current-password" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </Field>
              <PopButton tone="mint" size="lg" type="submit" className="mt-2 w-[calc(100%-5px)]" loading={busy} disabled={passphrase.length < 4}>
                Unlock this device
              </PopButton>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-faint">Asked once per device. Wrong guesses lock Folio for 15 minutes.</p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <UnlockInner />
    </Suspense>
  );
}
