'use client';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { formatCompact, formatMoney, moneyParts, toChartRupees, type Paise } from '@folio/core';
import { cx } from '@/lib/cx';
import { useUi } from '@/lib/store';
import { Icon, type IconName } from './Icon';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Tone = 'chalk' | 'mint' | 'dark' | 'coral' | 'gold';
const toneClass: Record<Tone, string> = { chalk: '', mint: 'pop-mint', dark: 'pop-dark', coral: 'pop-coral', gold: 'pop-gold' };

export const PopButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' | 'lg'; icon?: IconName; loading?: boolean }>(function PopButton(
  { tone = 'chalk', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'pop cursor-pointer',
        toneClass[tone],
        size === 'sm' && 'h-9 px-3.5 text-[13px]',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-14 px-7 text-[15px] tracking-wide uppercase',
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} strokeWidth={2} /> : null}
      {children}
    </button>
  );
});

export function GhostButton({ icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName }) {
  return (
    <button
      className={cx('inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-chalk-dim transition-colors hover:bg-ink-3 hover:text-chalk disabled:opacity-40', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} strokeWidth={1.9} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, size = 36, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('inline-grid cursor-pointer place-items-center rounded-full border border-line text-chalk-dim transition-all hover:border-line-strong hover:bg-ink-3 hover:text-chalk active:scale-95', className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.47)} strokeWidth={1.8} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Money with a rolling count animation between values. The animation is
 * purely visual (it interpolates a display number); the settled text is
 * always the exact bigint formatting.
 */
export function Money({
  value,
  className,
  compact,
  decimals = 'auto',
  showPlus,
  animateFrom,
  maskable = true,
  tone,
}: {
  value: Paise;
  className?: string;
  compact?: boolean;
  decimals?: 'auto' | 0 | 2;
  showPlus?: boolean;
  animateFrom?: Paise;
  maskable?: boolean;
  tone?: 'auto' | 'pos' | 'neg';
}) {
  const hidden = useUi((s) => s.hideBalances) && maskable;
  const reduce = useReducedMotion();
  const exact = compact ? formatCompact(value) : formatMoney(value, { decimals, showPlus });
  const [text, setText] = useState(exact);
  const prev = useRef<Paise | null>(animateFrom ?? null);
  const mv = useMotionValue(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (reduce || from === null || from === value || compact) {
      setText(exact);
      return;
    }
    mv.set(toChartRupees(from));
    const controls = animate(mv, toChartRupees(value), {
      type: 'spring',
      stiffness: 90,
      damping: 20,
      onUpdate: (v) => setText(formatMoney(BigInt(Math.round(v * 100)), { decimals: 0, showPlus })),
      onComplete: () => setText(exact),
    });
    return () => controls.stop();
  }, [value, exact, reduce, compact, mv, showPlus]);

  const colour = tone === 'pos' || (tone === 'auto' && value > 0n) ? 'text-mint' : tone === 'neg' || (tone === 'auto' && value < 0n) ? 'text-coral' : '';
  if (hidden) return <span className={cx('tnum select-none tracking-widest', className)}>₹ ••••</span>;
  return <span className={cx('tnum whitespace-nowrap', colour, className)}>{text}</span>;
}

/** Large hero figure: serif rupee + whole part, small dimmed paise. */
export function HeroMoney({ value, className, label }: { value: Paise; className?: string; label?: string }) {
  const hidden = useUi((s) => s.hideBalances);
  const p = moneyParts(value);
  return (
    <div className={cx('flex items-baseline gap-1 font-display', className)} aria-label={label ?? formatMoney(value)}>
      {hidden ? (
        <span className="tnum tracking-widest">₹ ••••••</span>
      ) : (
        <>
          <span className="text-[0.55em] font-light text-chalk-dim">{p.sign === '−' ? '−' : ''}₹</span>
          <Money value={value < 0n ? -value : value} decimals={0} className="font-semibold" maskable={false} />
          <span className="tnum text-[0.38em] font-normal text-mute">.{p.fraction}</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces & feedback
// ---------------------------------------------------------------------------
export function Plate({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('plate', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action, className }: { eyebrow?: string; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-4 flex items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-bold tracking-[0.18em] text-mute uppercase">{eyebrow}</div>}
        <h2 className="font-display text-[22px] leading-tight font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function EmptyState({ icon = 'sparkle', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative mb-5 grid size-16 place-items-center rounded-2xl border border-line bg-ink-2">
        <div className="absolute inset-0 rounded-2xl bg-mint/5 blur-xl" />
        <Icon name={icon} size={28} className="relative text-mint" />
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-sm leading-relaxed text-mute">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'mint' | 'coral' | 'gold' | 'sky'; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap',
        tone === 'neutral' && 'bg-ink-4 text-chalk-dim',
        tone === 'mint' && 'bg-mint/12 text-mint',
        tone === 'coral' && 'bg-coral/12 text-coral',
        tone === 'gold' && 'bg-gold/12 text-gold',
        tone === 'sky' && 'bg-sky/12 text-sky',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Meter({ valueBps, tone = 'mint', className }: { valueBps: number; tone?: 'mint' | 'gold' | 'coral'; className?: string }) {
  const pct = Math.max(0, Math.min(100, valueBps / 100));
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-ink-4', className)}>
      <motion.div
        className={cx('h-full rounded-full', tone === 'mint' && 'bg-mint', tone === 'gold' && 'bg-gold', tone === 'coral' && 'bg-coral')}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet (right-side drawer on desktop, bottom sheet on small screens)
// ---------------------------------------------------------------------------
export function Sheet({ open, onClose, title, eyebrow, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; eyebrow?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal
            className="absolute right-0 bottom-0 flex max-h-[94dvh] w-full flex-col rounded-t-[26px] border-t border-line-strong bg-ink-1 sm:top-0 sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l"
            style={{ maxWidth: width }}
            initial={{ x: 0, y: '100%' }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: 0, y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink-4 sm:hidden" />
            <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
              <div>
                {eyebrow && <div className="mb-1 text-[11px] font-bold tracking-[0.18em] text-mute uppercase">{eyebrow}</div>}
                <h2 className="font-display text-2xl font-semibold">{title}</h2>
              </div>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </header>
            <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
            {footer && <footer className="border-t border-line bg-ink-1 px-6 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-coral">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

const inputBase = 'w-full rounded-xl border border-line bg-ink-2 px-3.5 text-[15px] text-chalk placeholder:text-faint outline-none transition-colors focus:border-mint/60 focus:bg-ink-3';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, 'h-11', className)} {...rest} />;
});

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, 'min-h-20 py-2.5', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(inputBase, 'h-11 cursor-pointer appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-mute" />
    </div>
  );
}

/** Rupee amount input: keeps the raw string, parsing happens in the form via parseAmount. */
export function AmountInput({ value, onChange, autoFocus, size = 'md', placeholder = '0', id }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; size?: 'md' | 'xl'; placeholder?: string; id?: string }) {
  return (
    <div className={cx('flex items-baseline rounded-xl border border-line bg-ink-2 px-3.5 transition-colors focus-within:border-mint/60', size === 'xl' ? 'h-20' : 'h-11')}>
      <span className={cx('mr-1 font-display text-chalk-dim', size === 'xl' ? 'text-3xl' : 'text-base')}>₹</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,kKlL]/g, ''))}
        className={cx('tnum h-full w-full bg-transparent text-chalk outline-none placeholder:text-faint', size === 'xl' ? 'font-display text-5xl font-semibold' : 'text-[15px]')}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm font-semibold">{label}</div>
        {description && <div className="mt-0.5 text-xs text-mute">{description}</div>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors', checked ? 'border-mint bg-mint' : 'border-line-strong bg-ink-3')}
      >
        <motion.span
          className={cx('absolute top-0.5 size-5.5 rounded-full', checked ? 'bg-ink' : 'bg-chalk-dim')}
          animate={{ left: checked ? 23 : 3 }}
          transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName }[]; className?: string; size?: 'sm' | 'md' }) {
  const id = useId();
  return (
    <div className={cx('inline-flex rounded-full border border-line bg-ink-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative inline-flex cursor-pointer items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors', size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8.5 px-4 text-[13px]', value === o.value ? 'text-ink' : 'text-mute hover:text-chalk')}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-chalk" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {o.icon && <Icon name={o.icon} size={14} strokeWidth={2} className="relative" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-all active:scale-95',
        active ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2 text-chalk-dim hover:border-line-strong hover:text-chalk',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Avatar({ name, color, emoji, size = 36 }: { name: string; color?: string | null; emoji?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-ink"
      style={{ width: size, height: size, background: color ?? '#c9c8c2', fontSize: size * 0.36 }}
    >
      {emoji || initials}
    </span>
  );
}

export function KeyHint({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-ink-3 px-1.5 py-0.5 font-mono text-[10px] text-mute">{children}</kbd>;
}
