'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { addMonths, moveWidget, startOfMonth, toggleWidget, updateWidget, WIDGET_META, type PeriodPreset, type WidgetId } from '@folio/core';
import { useCategories, useDashboardPrefs, useEntries, useEntriesInRange, useObligations, usePeople, usePosition, useProfile, useStatements, useToday } from '@folio/api';
import {
  AfterObligationsWidget,
  BankCarouselWidget,
  CardCarouselWidget,
  CashflowWidget,
  CategoryWidget,
  IncomeVsExpenseWidget,
  LoansWidget,
  NetWorthWidget,
  RecentWidget,
  ReimbursementsWidget,
  StatsWidget,
  UpcomingWidget,
  type DashboardData,
} from '@/components/dashboard/Widgets';
import { useLookups } from '@/components/entry/EntryViews';
import { Icon } from '@/components/ui/Icon';
import { GhostButton, IconButton, PopButton, Select, Skeleton } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: '3 months' },
  { value: 'last_6_months', label: '6 months' },
  { value: 'last_12_months', label: '12 months' },
  { value: 'financial_year', label: 'Financial year' },
  { value: 'this_year', label: 'Calendar year' },
];

function greeting(name: string | null | undefined) {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}${name ? `, ${name.split(' ')[0]}` : ''}`;
}

export default function Dashboard() {
  const t = useToday();
  const profile = useProfile();
  const { prefs, save } = useDashboardPrefs();
  const [editing, setEditing] = useState(false);
  const pos = usePosition();
  const people = usePeople();
  const categories = useCategories();
  const statements = useStatements();
  const { items: obligations, rules } = useObligations(30);
  const lookups = useLookups();
  const from = addMonths(startOfMonth(t), -23, 1);
  const entries = useEntriesInRange({ from, to: t });
  const recent = useEntries({}, 8);

  const data: DashboardData | null = useMemo(() => {
    if (!pos.position || !categories.data) return null;
    return {
      position: pos.position,
      accounts: pos.accounts,
      balances: pos.balances,
      personBalances: pos.personBalances,
      people: people.data ?? [],
      categories: categories.data,
      entries: entries.data ?? [],
      recent: recent.data?.pages[0] ?? [],
      obligations,
      rules,
      statements: statements.data ?? [],
      today: t,
      lookups,
    };
  }, [pos, categories.data, people.data, entries.data, recent.data, obligations, rules, statements.data, t, lookups]);

  const render = (id: WidgetId, period: PeriodPreset) => {
    if (!data) return null;
    switch (id) {
      case 'net_worth':
        return <NetWorthWidget d={data} />;
      case 'stats':
        return <StatsWidget d={data} />;
      case 'bank_carousel':
        return <BankCarouselWidget d={data} />;
      case 'card_carousel':
        return <CardCarouselWidget d={data} />;
      case 'after_obligations':
        return <AfterObligationsWidget d={data} />;
      case 'cashflow':
        return <CashflowWidget d={data} period={period} />;
      case 'income_vs_expense':
        return <IncomeVsExpenseWidget d={data} period={period} />;
      case 'upcoming':
        return <UpcomingWidget d={data} />;
      case 'reimbursements':
        return <ReimbursementsWidget d={data} />;
      case 'category_breakdown':
        return <CategoryWidget d={data} period={period} />;
      case 'loans':
        return <LoansWidget d={data} />;
      case 'recent':
        return <RecentWidget d={data} />;
    }
  };

  const visible = prefs.widgets.filter((w) => w.visible);
  // Pair the compact lower widgets two-up on wide screens.
  const half = new Set<WidgetId>(['income_vs_expense', 'upcoming', 'reimbursements', 'loans', 'category_breakdown']);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-mute">{greeting(profile.data?.displayName)}</div>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Your position</h1>
        </div>
        <PopButton tone={editing ? 'mint' : 'dark'} size="sm" icon={editing ? 'check' : 'layout'} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Customise'}
        </PopButton>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="plate mb-8 p-4">
              <div className="mb-3 px-1 text-sm font-bold">Widgets · reorder, hide, pick periods</div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {prefs.widgets.map((w, i) => {
                  const meta = WIDGET_META[w.id];
                  return (
                    <li key={w.id} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2', w.visible ? 'border-line-strong bg-ink-2' : 'border-line opacity-50')}>
                      <button onClick={() => void save(toggleWidget(prefs, w.id))} className="grid size-6 cursor-pointer place-items-center rounded-md border border-line-strong" aria-label={w.visible ? 'Hide' : 'Show'}>
                        {w.visible && <Icon name="check" size={14} className="text-mint" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{meta.title}</div>
                        <div className="truncate text-[11px] text-faint">{meta.description}</div>
                      </div>
                      {meta.hasPeriod && (
                        <Select value={w.period ?? prefs.defaultPeriod} onChange={(e) => void save(updateWidget(prefs, w.id, { period: e.target.value as PeriodPreset }))} className="h-8 w-32 text-xs">
                          {PERIODS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </Select>
                      )}
                      <IconButton icon="chevronUp" label="Move up" size={28} disabled={i === 0} onClick={() => void save(moveWidget(prefs, w.id, -1))} />
                      <IconButton icon="chevronDown" label="Move down" size={28} disabled={i === prefs.widgets.length - 1} onClick={() => void save(moveWidget(prefs, w.id, 1))} />
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!data ? (
        <div className="space-y-6">
          <Skeleton className="h-56" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
          {visible.map((w, i) => (
            <motion.div
              key={w.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 160, damping: 22, delay: Math.min(i, 6) * 0.04 }}
              className={half.has(w.id) ? '' : 'lg:col-span-2'}
            >
              {render(w.id, w.period ?? prefs.defaultPeriod)}
            </motion.div>
          ))}
          {visible.length === 0 && (
            <div className="lg:col-span-2">
              <GhostButton icon="layout" onClick={() => setEditing(true)}>
                All widgets are hidden — customise
              </GhostButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
