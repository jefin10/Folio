'use client';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from '../ui/Icon';

/**
 * Horizontal snap carousel. The centred card is full size; neighbours sink
 * back. Supports drag-to-scroll with momentum (native scroll-snap), arrow
 * keys, wheel, and pagination dots that track the active card.
 */
export function CardCarousel<T>({
  items,
  render,
  keyOf,
  onActiveChange,
  trailing,
  itemWidth = 340,
  className,
}: {
  items: T[];
  render: (item: T, active: boolean, index: number) => ReactNode;
  keyOf: (item: T) => string;
  onActiveChange?: (index: number) => void;
  trailing?: ReactNode;
  itemWidth?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const total = items.length + (trailing ? 1 : 0);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    const centre = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    children.forEach((c, i) => {
      const mid = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(mid - centre);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive((prev) => {
      if (prev !== best && best < items.length) onActiveChange?.(best);
      return best;
    });
  }, [items.length, onActiveChange]);

  useEffect(() => {
    onScroll();
  }, [items.length, onScroll]);

  const scrollTo = (i: number) => {
    const el = ref.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: 'smooth' });
  };

  return (
    <div className={cx('relative', className)}>
      <div
        ref={ref}
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') scrollTo(Math.min(total - 1, active + 1));
          if (e.key === 'ArrowLeft') scrollTo(Math.max(0, active - 1));
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return;
          drag.current = { x: e.clientX, left: ref.current!.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 4) drag.current.moved = true;
          ref.current.style.scrollSnapType = 'none';
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          if (!ref.current) return;
          ref.current.style.scrollSnapType = '';
          if (drag.current?.moved) scrollTo(active);
          setTimeout(() => (drag.current = null), 0);
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="scroll-snap-x -mx-4 flex gap-4 overflow-x-auto px-[max(1rem,calc(50%-170px))] pt-2 pb-6 outline-none sm:-mx-0"
      >
        {items.map((item, i) => (
          <div key={keyOf(item)} className="shrink-0 snap-center" style={{ width: itemWidth }}>
            {render(item, i === active, i)}
          </div>
        ))}
        {trailing && (
          <div className="shrink-0 snap-center" style={{ width: itemWidth }}>
            {trailing}
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button aria-label="Previous" onClick={() => scrollTo(Math.max(0, active - 1))} className="grid size-7 cursor-pointer place-items-center rounded-full text-mute hover:bg-ink-3 hover:text-chalk disabled:opacity-30" disabled={active === 0}>
            <Icon name="arrowLeft" size={14} />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <button key={i} aria-label={`Go to card ${i + 1}`} onClick={() => scrollTo(i)} className="cursor-pointer p-1">
                <motion.span className="block h-1.5 rounded-full bg-chalk" animate={{ width: i === active ? 18 : 6, opacity: i === active ? 1 : 0.25 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              </button>
            ))}
          </div>
          <button aria-label="Next" onClick={() => scrollTo(Math.min(total - 1, active + 1))} className="grid size-7 cursor-pointer place-items-center rounded-full text-mute hover:bg-ink-3 hover:text-chalk disabled:opacity-30" disabled={active >= total - 1}>
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Placeholder face used at the end of a carousel to add another account. */
export function AddCardFace({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group grid aspect-[1.586] w-full max-w-[360px] cursor-pointer place-items-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-ink-1 transition-colors hover:border-mint/50 hover:bg-ink-2"
    >
      <div className="flex flex-col items-center gap-3 text-mute transition-colors group-hover:text-mint">
        <span className="grid size-11 place-items-center rounded-full border border-current">
          <Icon name="plus" size={20} />
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </button>
  );
}
