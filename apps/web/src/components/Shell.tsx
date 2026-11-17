'use client';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { forgetThisDevice, useAccounts, useFolio, useProfile } from '@folio/api';
import { cx } from '@/lib/cx';
import { deviceLockEnabled, verifyDeviceLock } from '@/lib/device-lock';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/store';
import { AccountEditor } from './forms/AccountEditor';
import { Composer } from './entry/Composer';
import { EntryDetailSheet } from './entry/EntryViews';
import { Icon } from './ui/Icon';
import { IconButton, KeyHint, PopButton } from './ui/primitives';

const NAV: { href: string; label: string; icon: string; group?: string }[] = [
  { href: '/', label: 'Home', icon: 'layout' },
  { href: '/accounts', label: 'Accounts', icon: 'bank' },
  { href: '/cards', label: 'Credit cards', icon: 'card' },
  { href: '/transactions', label: 'Ledger', icon: 'receipt' },
  { href: '/income', label: 'Income', icon: 'arrowDown', group: 'Money' },
  { href: '/expenses', label: 'Spending', icon: 'arrowUp', group: 'Money' },
  { href: '/people', label: 'Owed to you', icon: 'users', group: 'Money' },
  { href: '/loans', label: 'Loans & EMIs', icon: 'loan', group: 'Obligations' },
  { href: '/autopay', label: 'Bills & autopay', icon: 'repeat', group: 'Obligations' },
  { href: '/statements', label: 'Statements', icon: 'doc', group: 'Obligations' },
  { href: '/analytics', label: 'Analytics', icon: 'chart', group: 'Insight' },
  { href: '/reports', label: 'Reports & export', icon: 'download', group: 'Insight' },
  { href: '/settings', label: 'Settings', icon: 'settings', group: 'Insight' },
];

const TABS = [
  { href: '/', label: 'Home', icon: 'layout' },
  { href: '/cards', label: 'Cards', icon: 'card' },
  { href: '+', label: 'Add', icon: 'plus' },
  { href: '/transactions', label: 'Ledger', icon: 'receipt' },
  { href: '/more', label: 'More', icon: 'dots' },
];

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="pop pop-mint grid size-8 place-items-center font-display text-lg font-bold" style={{ ['--pop-depth' as string]: '3px' }}>
        f
      </span>
      <span className="font-display text-[22px] font-semibold tracking-tight">folio</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready } = useSession();
  const { sb } = useFolio();
  const hide = useUi((s) => s.hideBalances);
  const toggle = useUi((s) => s.toggleBalances);
  const openComposer = useUi((s) => s.openComposer);
  const profile = useProfile();
  const accounts = useAccounts();
  const [locked, setLocked] = useState(true);
  const hiddenAt = useRef<number | null>(null);

  // Local biometric gate (optional per browser): on load and after being away.
  useEffect(() => {
    if (!deviceLockEnabled()) setLocked(false);
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && deviceLockEnabled() && Date.now() - hiddenAt.current > (profile.data?.lockTimeoutSeconds ?? 60) * 1000) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [profile.data?.lockTimeoutSeconds]);

  useEffect(() => {
    if (ready && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, session, router, pathname]);

  useEffect(() => {
    if (!session || !profile.data || !accounts.data) return;
    if (!profile.data.onboardedAt && accounts.data.length === 0 && pathname !== '/onboarding') router.replace('/onboarding');
  }, [session, profile.data, accounts.data, pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openComposer();
      }
      if (e.key === 'h' && !e.metaKey && !e.ctrlKey) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openComposer, toggle]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <motion.div className="font-display text-3xl font-semibold text-chalk/80" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }}>
          folio
        </motion.div>
      </div>
    );
  }

  if (locked && deviceLockEnabled()) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="pop pop-mint grid size-14 place-items-center font-display text-3xl font-bold">f</div>
          <h1 className="font-display text-3xl font-semibold">Folio is locked</h1>
          <PopButton tone="mint" size="lg" icon="lock" onClick={async () => setLocked(!(await verifyDeviceLock()))}>
            Unlock
          </PopButton>
        </div>
      </div>
    );
  }

  let lastGroup: string | undefined;
  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-ink px-4 py-6 lg:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <PopButton tone="mint" icon="plus" className="mx-2 mt-7 w-[calc(100%-1.6rem)]" onClick={() => openComposer()}>
          New entry <KeyHint>N</KeyHint>
        </PopButton>
        <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            const header = n.group && n.group !== lastGroup ? n.group : null;
            lastGroup = n.group;
            return (
              <div key={n.href}>
                {header && <div className="px-3 pt-5 pb-1.5 text-[10px] font-bold tracking-[0.2em] text-faint uppercase">{header}</div>}
                <Link href={n.href} className={cx('relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors', active ? 'text-chalk' : 'text-mute hover:bg-ink-2 hover:text-chalk')}>
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-ink-3" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <Icon name={n.icon} size={18} className="relative" />
                  <span className="relative">{n.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-line px-2 pt-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{profile.data?.displayName ?? 'You'}</div>
            <div className="truncate text-xs text-faint">{session.user.email}</div>
          </div>
          <IconButton icon="logout" label="Forget this browser" onClick={() => void forgetThisDevice(sb)} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-ink/85 px-4 backdrop-blur-xl lg:hidden">
        <Wordmark />
        <IconButton icon={hide ? 'eyeOff' : 'eye'} label={hide ? 'Show balances' : 'Hide balances'} onClick={toggle} />
      </header>

      <div className="fixed top-5 right-6 z-20 hidden lg:block">
        <IconButton icon={hide ? 'eyeOff' : 'eye'} label={hide ? 'Show balances (H)' : 'Hide balances (H)'} onClick={toggle} size={40} className="bg-ink/80 backdrop-blur" />
      </div>

      <main className="mx-auto max-w-[1180px] px-4 pt-6 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
          {TABS.map((tab) =>
            tab.href === '+' ? (
              <button key="add" onClick={() => openComposer()} aria-label="New entry" className="pop pop-mint -mt-6 grid size-14 cursor-pointer place-items-center rounded-none">
                <Icon name="plus" size={26} strokeWidth={2.4} />
              </button>
            ) : (
              <Link key={tab.href} href={tab.href} className={cx('flex w-14 flex-col items-center gap-1 text-[10px] font-bold', (tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)) ? 'text-chalk' : 'text-faint')}>
                <Icon name={tab.icon} size={21} />
                {tab.label}
              </Link>
            ),
          )}
        </div>
      </nav>

      <Composer />
      <EntryDetailSheet />
      <AccountEditor />
    </div>
  );
}

export const MORE_LINKS = NAV.filter((n) => !['/', '/cards', '/transactions'].includes(n.href));
