'use client';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState, type PointerEvent } from 'react';
import { accountMeta, displayName, formatMoney, themeFor, type Account, type Paise } from '@folio/core';
import { cx } from '@/lib/cx';
import { useUi } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { repo } from '@folio/api';
import { Icon } from '../ui/Icon';
import { InstitutionBadge } from './InstitutionBadge';

/** Generated SVG texture for the card face, keyed by theme.pattern. */
function Pattern({ kind, ink }: { kind?: string | null; ink: 'light' | 'dark' }) {
  const stroke = ink === 'light' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  if (!kind) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 340 214" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {kind === 'lines' && Array.from({ length: 22 }, (_, i) => <line key={i} x1={-60 + i * 22} y1={0} x2={60 + i * 22} y2={214} stroke={stroke} strokeWidth={1} />)}
      {kind === 'waves' &&
        Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M-20 ${40 + i * 22} C 60 ${10 + i * 22}, 140 ${70 + i * 22}, 220 ${40 + i * 22} S 380 ${10 + i * 22}, 420 ${40 + i * 22}`} fill="none" stroke={stroke} strokeWidth={1.2} />
        ))}
      {kind === 'dots' && Array.from({ length: 120 }, (_, i) => <circle key={i} cx={(i % 15) * 24 + 8} cy={Math.floor(i / 15) * 26 + 10} r={1.4} fill={stroke} />)}
      {kind === 'grid' && (
        <>
          {Array.from({ length: 16 }, (_, i) => <line key={`v${i}`} x1={i * 24} y1={0} x2={i * 24} y2={214} stroke={stroke} />)}
          {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 24} x2={340} y2={i * 24} stroke={stroke} />)}
        </>
      )}
      {kind === 'rings' && Array.from({ length: 8 }, (_, i) => <circle key={i} cx={300} cy={30} r={30 + i * 26} fill="none" stroke={stroke} strokeWidth={1.2} />)}
    </svg>
  );
}

function Chip({ ink }: { ink: 'light' | 'dark' }) {
  return (
    <svg width="38" height="28" viewBox="0 0 38 28" aria-hidden>
      <defs>
        <linearGradient id="chipg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={ink === 'light' ? '#e8d5a0' : '#b8a066'} />
          <stop offset="1" stopColor={ink === 'light' ? '#9c8550' : '#7a6532'} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="37" height="27" rx="6" fill="url(#chipg)" stroke="rgba(0,0,0,.25)" />
      <path d="M0 9h12M0 19h12M26 9h12M26 19h12M12 0v28M26 0v28M12 14h14" stroke="rgba(0,0,0,.28)" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** Wordmark rendering of the card network as plain lettering (no third-party logos). */
function NetworkMark({ network, ink }: { network: string | null | undefined; ink: 'light' | 'dark' }) {
  if (!network || network === 'other') return null;
  const label = network === 'amex' ? 'AMEX' : network === 'rupay' ? 'RuPay' : network === 'mastercard' ? 'MASTERCARD' : network.toUpperCase();
  return <span className={cx('font-display text-[13px] font-bold italic tracking-wide', ink === 'light' ? 'text-white/85' : 'text-black/75')}>{label}</span>;
}

export interface FinanceCardProps {
  account: Account;
  balance: Paise;
  available?: Paise | null;
  subtitle?: string;
  active?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'md' | 'lg';
}

/**
 * The card face shared by bank accounts, credit cards, wallets and loans.
 * Pointer-tilt with a travelling specular sheen; artwork can be an uploaded
 * image or a generated gradient + texture.
 */
export function FinanceCard({ account, balance, available, subtitle, active = true, interactive = true, onClick, className, size = 'md' }: FinanceCardProps) {
  const theme = themeFor(account);
  const ink = theme.ink;
  const meta = accountMeta(account.type);
  const hidden = useUi((s) => s.hideBalances);
  const isCredit = meta.group === 'credit';
  const isLoan = meta.group === 'loan';
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (account.artworkPath) repo.signedUrl(getSupabase(), account.artworkPath).then((u) => alive && setArt(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [account.artworkPath]);

  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(30);
  const sheen = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,${ink === 'light' ? 0.16 : 0.32}), transparent 46%)`;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 14);
    rx.set(-(py - 0.5) * 10);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    gx.set(50);
    gy.set(30);
  };

  const fg = ink === 'light' ? 'text-white' : 'text-[#111]';
  const fgDim = ink === 'light' ? 'text-white/60' : 'text-black/55';
  const label = isCredit ? 'Outstanding' : isLoan ? 'Principal left' : 'Available balance';

  return (
    <div className={cx('[perspective:1100px]', className)}>
      <motion.div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        animate={{ scale: active ? 1 : 0.92, opacity: active ? 1 : 0.55 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className={cx(
          'grain relative aspect-[1.586] w-full cursor-pointer overflow-hidden rounded-[var(--radius-card)] select-none',
          'shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)_inset]',
          size === 'lg' ? 'max-w-[440px]' : 'max-w-[360px]',
        )}
      >
        <div className="absolute inset-0" style={{ background: art ? `center/cover url(${art})` : `linear-gradient(135deg, ${theme.colors[0]} 0%, ${theme.colors[1] ?? theme.colors[0]} 55%, ${theme.colors[2] ?? theme.colors[0]} 100%)` }} />
        {!art && <Pattern kind={theme.pattern} ink={ink} />}
        {!art && <motion.div className="pointer-events-none absolute inset-0" style={{ background: sheen }} />}
        {art ? (
          // The owner's own card photo is the face, shown as-is; only a balance chip on top.
          <div className="relative flex h-full flex-col justify-end p-3">
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="relative flex items-end justify-between gap-2">
              <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/85 backdrop-blur-sm">{displayName(account)}</span>
              <span className="tnum rounded-full bg-black/55 px-2.5 py-1 text-[13px] font-bold text-white backdrop-blur-sm">
                {hidden ? '₹ ••••' : formatMoney(balance, { decimals: 0 })}
                {available != null && !hidden ? <span className="font-medium text-white/60"> · {formatMoney(available, { decimals: 0 })} free</span> : null}
              </span>
            </div>
          </div>
        ) : (
        <div className={cx('relative flex h-full flex-col justify-between p-5', fg, size === 'lg' && 'p-6')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cx('truncate text-[11px] font-bold tracking-[0.2em] uppercase', fgDim)}>{account.institutionName || meta.short}</div>
              <div className="mt-0.5 truncate font-display text-lg leading-tight font-semibold">{displayName(account)}</div>
            </div>
            {account.institutionName || account.institutionId ? (
              <InstitutionBadge institutionId={account.institutionId} name={account.institutionName} size={size === 'lg' ? 38 : 32} />
            ) : (
              <div className={cx('grid size-8 shrink-0 place-items-center rounded-full', ink === 'light' ? 'bg-white/10' : 'bg-black/10')}>
                <Icon name={account.icon || meta.icon} size={16} strokeWidth={1.8} />
              </div>
            )}
          </div>

          <div>
            {(isCredit || account.type === 'debit_card') && <Chip ink={ink} />}
            <div className={cx('mt-2 text-[10px] font-bold tracking-[0.18em] uppercase', fgDim)}>{label}</div>
            <div className={cx('tnum font-display font-semibold', size === 'lg' ? 'text-[32px]' : 'text-[26px]', 'leading-tight')}>
              {hidden ? '₹ ••••••' : formatMoney(balance, { decimals: 2 })}
            </div>
            {available != null && (
              <div className={cx('tnum mt-0.5 text-xs', fgDim)}>{hidden ? '••••' : `${formatMoney(available, { decimals: 0 })} available`}</div>
            )}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className={cx('font-mono text-[13px] tracking-[0.18em]', fgDim)}>{account.last4 ? `•••• ${account.last4}` : subtitle ?? account.customTypeLabel ?? meta.label}</div>
            {isCredit ? <NetworkMark network={account.card?.network} ink={ink} /> : <span className={cx('text-[10px] font-bold tracking-[0.16em] uppercase', fgDim)}>{account.customTypeLabel || meta.short}</span>}
          </div>
        </div>
        )}
        {account.status !== 'active' && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-bold tracking-[0.2em] text-white/80 uppercase backdrop-blur-[1px]">{account.status}</div>
        )}
      </motion.div>
    </div>
  );
}
