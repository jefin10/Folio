'use client';
import Link from 'next/link';
import { MORE_LINKS } from '@/components/Shell';
import { Icon } from '@/components/ui/Icon';

export default function MorePage() {
  return (
    <div>
      <h1 className="mb-6 font-display text-4xl font-semibold">More</h1>
      <div className="grid grid-cols-2 gap-3">
        {MORE_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="plate flex items-center gap-3 p-4 font-semibold"><Icon name={l.icon} size={20} className="text-mint" />{l.label}</Link>
        ))}
      </div>
    </div>
  );
}
