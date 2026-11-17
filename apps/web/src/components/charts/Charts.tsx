'use client';
import { motion } from 'motion/react';
import { useId, useMemo, useState } from 'react';
import { formatCompact, formatMoney, toChartRupees, type Paise } from '@folio/core';
import { useUi } from '@/lib/store';

/**
 * Hand-built SVG charts. Values arrive as exact paise; they are converted to
 * plain numbers only for pixel geometry.
 */

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export function GroupedBars({ data, series, height = 220, labelOf }: { data: Record<string, Paise | string>[]; series: BarSeries[]; height?: number; labelOf: (row: Record<string, Paise | string>) => string }) {
  const hidden = useUi((s) => s.hideBalances);
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => {
    let m = 1;
    for (const row of data) for (const s of series) m = Math.max(m, toChartRupees(row[s.key] as Paise));
    return m;
  }, [data, series]);
  const W = 640;
  const H = height;
  const pad = { t: 16, b: 28, l: 8, r: 8 };
  const groupW = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(22, (groupW - 10) / series.length);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Bar chart">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        {data.map((row, i) => {
          const gx = pad.l + i * groupW + (groupW - barW * series.length - (series.length - 1) * 3) / 2;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={pad.l + i * groupW} y={pad.t} width={groupW} height={H - pad.t - pad.b} fill={hover === i ? 'rgba(255,255,255,0.03)' : 'transparent'} rx={8} />
              {series.map((s, j) => {
                const v = toChartRupees(row[s.key] as Paise);
                const top = y(Math.max(0, v));
                return (
                  <motion.rect
                    key={s.key}
                    x={gx + j * (barW + 3)}
                    width={barW}
                    rx={Math.min(5, barW / 2)}
                    fill={s.color}
                    initial={{ y: H - pad.b, height: 0 }}
                    animate={{ y: top, height: Math.max(0, H - pad.b - top) }}
                    transition={{ type: 'spring', stiffness: 140, damping: 20, delay: i * 0.03 }}
                    opacity={hover === null || hover === i ? 1 : 0.4}
                  />
                );
              })}
              <text x={pad.l + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-mute text-[11px] font-semibold">
                {labelOf(row)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-line-strong bg-ink-2/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
          <div className="mb-1 font-bold text-chalk">{labelOf(data[hover]!)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-1.5 text-mute">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tnum font-semibold">{hidden ? '••••' : formatMoney(data[hover]![s.key] as Paise, { decimals: 0 })}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-mute">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AreaLine({ points, height = 160, color = 'var(--color-mint)', labels }: { points: Paise[]; height?: number; color?: string; labels?: string[] }) {
  const id = useId();
  const hidden = useUi((s) => s.hideBalances);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const values = points.map(toChartRupees);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length <= 1 ? W / 2 : (i / (values.length - 1)) * (W - 16) + 8);
  const y = (v: number) => H - 20 - ((v - min) / (max - min || 1)) * (H - 36);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(values.length - 1)},${H - 20} L${x(0)},${H - 20} Z`;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" />}
        <motion.path d={area} fill={`url(#a${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
        <motion.path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        {values.map((v, i) => (
          <g key={i}>
            <rect x={x(i) - W / values.length / 2} y={0} width={W / values.length} height={H} fill="transparent" onPointerEnter={() => setHover(i)} />
            {hover === i && <circle cx={x(i)} cy={y(v)} r={5} fill="var(--color-ink)" stroke={color} strokeWidth={2.5} />}
          </g>
        ))}
        {labels?.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 ? (
            <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="fill-mute text-[11px] font-semibold">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line-strong bg-ink-2/95 px-2.5 py-1.5 text-xs font-semibold shadow-xl" style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          {labels?.[hover] && <span className="mr-2 text-mute">{labels[hover]}</span>}
          <span className="tnum">{hidden ? '••••' : formatMoney(points[hover]!, { decimals: 0 })}</span>
        </div>
      )}
    </div>
  );
}

export function Donut({ slices, size = 180, thickness = 22, center }: { slices: { label: string; value: Paise; color: string }[]; size?: number; thickness?: number; center?: React.ReactNode }) {
  const total = slices.reduce((s, x) => s + toChartRupees(x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-3)" strokeWidth={thickness} />
        {slices.map((s, i) => {
          const frac = toChartRupees(s.value) / total;
          const len = Math.max(0, frac * c - 2);
          const el = (
            <motion.circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeDashoffset={-offset}
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${len} ${c - len}` }}
              transition={{ type: 'spring', stiffness: 80, damping: 18, delay: i * 0.05 }}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              className="cursor-pointer transition-[stroke-width]"
            />
          );
          offset += frac * c;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {hover !== null && slices[hover] ? (
          <div>
            <div className="max-w-[100px] truncate text-[11px] text-mute">{slices[hover]!.label}</div>
            <div className="tnum font-display text-lg font-semibold">{formatCompact(slices[hover]!.value)}</div>
          </div>
        ) : (
          center
        )}
      </div>
    </div>
  );
}

export function Sparkline({ points, color = 'var(--color-mint)', width = 120, height = 36 }: { points: Paise[]; color?: string; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} />;
  const vals = points.map(toChartRupees);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (vals.length - 1)) * width).toFixed(1)},${(height - 3 - ((v - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
    </svg>
  );
}
