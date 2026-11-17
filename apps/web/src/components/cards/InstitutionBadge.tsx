'use client';
import { findInstitution, inkOn } from '@folio/core';
import { useInstitutionLogos } from '@folio/api';

/**
 * The institution mark on cards and lists: the logo the user uploaded for
 * this institution if there is one, otherwise a generated monogram in the
 * institution's colours.
 */
export function InstitutionBadge({ institutionId, name, color, size = 32, rounded = 'full' }: { institutionId?: string | null; name: string | null; color?: string | null; size?: number; rounded?: 'full' | 'md' }) {
  const logos = useInstitutionLogos();
  const url = institutionId ? logos.get(institutionId) : undefined;
  const cat = findInstitution(name ?? undefined);
  const bg = color ?? cat?.colors[0] ?? '#2a2a2a';
  const short = cat?.short ?? (name ?? '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const radius = rounded === 'full' ? 9999 : Math.round(size * 0.28);
  if (url) {
    return (
      <span className="inline-grid shrink-0 place-items-center overflow-hidden bg-white" style={{ width: size, height: size, borderRadius: radius }}>
        <img src={url} alt={name ?? ''} className="h-full w-full object-contain p-[12%]" />
      </span>
    );
  }
  return (
    <span
      className="inline-grid shrink-0 place-items-center font-extrabold tracking-tight"
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${bg}, ${cat?.colors[1] ?? bg})`, color: inkOn(bg), fontSize: Math.max(8, size * (short.length > 3 ? 0.24 : 0.3)) }}
      aria-label={name ?? undefined}
    >
      {short}
    </span>
  );
}
