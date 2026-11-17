'use client';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  categoryBreakdown,
  formatBps,
  formatMonth,
  groupOf,
  monthlySeries,
  periodRange,
  periodTotals,
  relativeDay,
  sortAccounts,
  summariseCard,
  utilisationTone,
  type Account,
  type Category,
  type DueItem,
  type Entry,
  type FinancialPosition,
  type PeriodPreset,
  type RecurringRule,
  type Statement,
} from '@folio/core';
import type { PersonBalance } from '@folio/core';
import type { AccountBalance, Person } from '@folio/core';
import { presetForDue } from '@/lib/obligations';
import { useUi } from '@/lib/store';
import { AddCardFace, CardCarousel } from '../cards/CardCarousel';
import { FinanceCard } from '../cards/FinanceCard';
import { Donut, GroupedBars } from '../charts/Charts';
import { EntryList, type Lookups } from '../entry/EntryViews';
import { Icon } from '../ui/Icon';
import { Avatar, Badge, EmptyState, GhostButton, HeroMoney, Meter, Money, Plate, PopButton, SectionTitle } from '../ui/primitives';

export interface DashboardData {
  position: FinancialPosition;
  accounts: Account[];
  balances: Map<string, AccountBalance>;
  personBalances: Map<string, PersonBalance>;
  people: Person[];
  categories: Category[];
  entries: Entry[];
  recent: Entry[];
  obligations: DueItem[];
  rules: RecurringRule[];
  statements: Statement[];
  today: string;
  lookups: Lookups;
}

const kindOfFactory = (cats: Category[]) => {
  const m = new Map(cats.map((c) => [c.id, c.kind]));
  return (id: string) => m.get(id);
};

export function NetWorthWidget({ d }: { d: DashboardData }) {
  const p = d.position;
  const parts = [
    { label: 'Assets', value: p.totalAssets, tone: 'text-chalk' },
    { label: 'Owed to you', value: p.receivables, tone: 'text-mint' },
    { label: 'You owe', value: -(p.totalLiabilities + p.payables), tone: 'text-coral' },
  ];
  return (
    <Plate className="relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-mint/10 blur-3xl" />
      <div className="relative">
        <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Net worth</div>
        <HeroMoney value={p.netWorth} className="mt-2 text-[52px] leading-none sm:text-[64px]" />
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
          {parts.map((x) => (
            <div key={x.label}>
              <div className="text-[11px] font-semibold text-mute">{x.label}</div>
              <Money value={x.value} className={`mt-0.5 block text-[15px] font-bold sm:text-lg ${x.tone}`} />
            </div>
          ))}
        </div>
      </div>
    </Plate>
  );
}

export function StatsWidget({ d }: { d: DashboardData }) {
  const p = d.position;
  const tiles = [
    { label: 'In the bank', value: p.bankBalance, sub: <><Money value={p.liquid} decimals={0} /> spendable incl. cash & wallets</>, icon: 'bank', href: '/accounts' },
    { label: 'Card outstanding', value: p.creditOutstanding, sub: p.creditLimit > 0n ? <><Money value={p.availableCredit} decimals={0} /> credit available</> : 'No limits set', icon: 'card', href: '/cards' },
    { label: 'Owed to you', value: p.receivables, sub: p.payables > 0n ? <>You owe others <Money value={p.payables} decimals={0} /></> : 'Pending reimbursements', icon: 'users', href: '/people' },
    { label: 'Loans', value: p.loanOutstanding, sub: 'Principal outstanding', icon: 'loan', href: '/loans' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <motion.div key={t.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 200, damping: 22 }}>
          <Link href={t.href} className="plate group block p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between text-mute">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase">{t.label}</span>
              <Icon name={t.icon} size={16} className="transition-colors group-hover:text-mint" />
            </div>
            <Money value={t.value} decimals={0} className="mt-2 block font-display text-2xl font-semibold" />
            <div className="mt-1 truncate text-[11px] text-faint">{t.sub}</div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export function BankCarouselWidget({ d }: { d: DashboardData }) {
  const router = useRouter();
  const openEditor = useUi((s) => s.openAccountEditor);
  const banks = sortAccounts(d.accounts.filter((a) => a.status === 'active' && a.class === 'asset' && a.type !== 'debit_card'));
  return (
    <section>
      <SectionTitle eyebrow="Your money" title="Accounts" action={<GhostButton icon="arrowRight" onClick={() => router.push('/accounts')}>All accounts</GhostButton>} />
      {banks.length === 0 ? (
        <AddCardFace label="Add a bank account" onClick={() => openEditor({ type: 'savings' })} />
      ) : (
        <CardCarousel
          items={banks}
          keyOf={(a) => a.id}
          render={(a, active) => <FinanceCard account={a} balance={d.balances.get(a.id)?.balance ?? 0n} active={active} onClick={() => router.push(`/accounts/view?id=${a.id}`)} />}
          trailing={<AddCardFace label="Add account" onClick={() => openEditor({ type: 'savings' })} />}
        />
      )}
    </section>
  );
}

export function CardCarouselWidget({ d }: { d: DashboardData }) {
  const router = useRouter();
  const openEditor = useUi((s) => s.openAccountEditor);
  const cards = sortAccounts(d.accounts.filter((a) => a.status === 'active' && groupOf(a) === 'credit'));
  return (
    <section>
      <SectionTitle eyebrow="Credit" title="Cards" action={<GhostButton icon="arrowRight" onClick={() => router.push('/cards')}>All cards</GhostButton>} />
      {cards.length === 0 ? (
        <AddCardFace label="Add a credit card" onClick={() => openEditor({ type: 'credit_card' })} />
      ) : (
        <CardCarousel
          items={cards}
          keyOf={(a) => a.id}
          render={(a, active) => {
            const out = d.balances.get(a.id)?.balance ?? 0n;
            const s = summariseCard(a, out, d.entries, d.statements, d.today);
            return (
              <div>
                <FinanceCard account={a} balance={out} available={s.available} active={active} onClick={() => router.push(`/cards/view?id=${a.id}`)} />
                <motion.div animate={{ opacity: active ? 1 : 0.3 }} className="mt-3 px-1">
                  {s.limit && <Meter valueBps={s.utilisationBps} tone={utilisationTone(s.utilisationBps) === 'good' ? 'mint' : utilisationTone(s.utilisationBps) === 'watch' ? 'gold' : 'coral'} />}
                  <div className="mt-2 flex justify-between text-xs text-mute">
                    <span>{s.limit ? `${formatBps(s.utilisationBps)} used` : 'Set a limit to track usage'}</span>
                    {s.cycle.dueOn && s.statementRemaining > 0n && <span className={s.cycle.daysToDue! <= 3 ? 'font-bold text-coral' : ''}>Due {relativeDay(s.cycle.dueOn, d.today)}</span>}
                  </div>
                </motion.div>
              </div>
            );
          }}
          trailing={<AddCardFace label="Add card" onClick={() => openEditor({ type: 'credit_card' })} />}
        />
      )}
    </section>
  );
}

export function AfterObligationsWidget({ d }: { d: DashboardData }) {
  const p = d.position;
  const negative = p.afterObligations < 0n;
  return (
    <Plate className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">After the next 30 days of bills</div>
        <Money value={p.afterObligations} decimals={0} className={`mt-1 block font-display text-4xl font-semibold ${negative ? 'text-coral' : ''}`} />
        <div className="mt-1 text-xs text-mute">
          <Money value={p.liquid} decimals={0} /> spendable − <Money value={p.upcomingObligations} decimals={0} /> due from your bank & cash
        </div>
      </div>
      <Link href="/autopay">
        <PopButton tone="dark" icon="calendar">
          See schedule
        </PopButton>
      </Link>
    </Plate>
  );
}

export function CashflowWidget({ d, period }: { d: DashboardData; period: PeriodPreset }) {
  const range = periodRange(period, d.today);
  const series = useMemo(() => monthlySeries(d.entries, kindOfFactory(d.categories), range.from, range.to), [d.entries, d.categories, range.from, range.to]);
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow={range.label} title="Cash flow" />
      {series.every((s) => s.income === 0n && s.personalExpense === 0n) ? (
        <EmptyState icon="chart" title="No activity in this period" body="Income and spending will chart here month by month." />
      ) : (
        <GroupedBars
          data={series.map((s) => ({ month: s.month, income: s.income, spend: s.personalExpense, others: s.reimbursable }))}
          labelOf={(r) => formatMonth(r.month as string, false)}
          series={[
            { key: 'income', label: 'Income', color: 'var(--color-mint)' },
            { key: 'spend', label: 'Your spending', color: 'var(--color-chalk)' },
            { key: 'others', label: 'Paid for others', color: 'var(--color-gold)' },
          ]}
        />
      )}
    </Plate>
  );
}

export function IncomeVsExpenseWidget({ d, period }: { d: DashboardData; period: PeriodPreset }) {
  const range = periodRange(period, d.today);
  const t = useMemo(() => periodTotals(d.entries, kindOfFactory(d.categories), range.from, range.to), [d.entries, d.categories, range.from, range.to]);
  const max = t.income > t.grossSpend ? t.income : t.grossSpend;
  const bar = (v: bigint) => (max > 0n ? Number((v * 10_000n) / max) : 0);
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow={range.label} title="Income vs spending" />
      <div className="space-y-5">
        {[
          { label: 'Income', value: t.income, tone: 'mint' as const },
          { label: 'Your spending', value: t.personalExpense, tone: 'gold' as const },
          { label: 'Paid for others', value: t.reimbursable, tone: 'coral' as const },
        ].map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-mute">{r.label}</span>
              <Money value={r.value} decimals={0} className="font-bold" />
            </div>
            <Meter valueBps={bar(r.value)} tone={r.tone} />
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <div>
          <div className="text-xs text-mute">Saved</div>
          <Money value={t.saved} decimals={0} className={`text-lg font-bold ${t.saved < 0n ? 'text-coral' : 'text-mint'}`} />
        </div>
        <div>
          <div className="text-xs text-mute">Savings rate</div>
          <div className="text-lg font-bold">{t.income > 0n ? formatBps(t.savingsRateBps, 0) : '—'}</div>
        </div>
      </div>
    </Plate>
  );
}

export function UpcomingWidget({ d }: { d: DashboardData }) {
  const openComposer = useUi((s) => s.openComposer);
  const items = d.obligations.filter((i) => i.state !== 'paid' && i.state !== 'skipped').slice(0, 6);
  const ruleById = new Map(d.rules.map((r) => [r.id, r]));
  const cards = d.accounts.filter((a) => groupOf(a) === 'credit' && a.status === 'active');
  const cardDues = cards
    .map((a) => ({ a, s: summariseCard(a, d.balances.get(a.id)?.balance ?? 0n, d.entries, d.statements, d.today) }))
    .filter((x) => x.s.cycle.dueOn && x.s.statementRemaining > 0n && x.s.cycle.daysToDue! >= -10 && x.s.cycle.daysToDue! <= 30);
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow="Next 30 days" title="Coming up" action={<Link href="/autopay" className="text-xs font-bold text-mute hover:text-chalk">Manage</Link>} />
      {items.length === 0 && cardDues.length === 0 ? (
        <EmptyState icon="calendar" title="Nothing due" body="Add EMIs, subscriptions and bills in Bills & autopay to get reminders." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {cardDues.map(({ a, s }) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-ink-2">
              <span className="grid size-9 place-items-center rounded-lg bg-gold/10 text-gold">
                <Icon name="card" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{a.nickname || a.name} bill</div>
                <div className="text-xs text-mute">{relativeDay(s.cycle.dueOn!, d.today)} · min <Money value={s.minimumDue} decimals={0} />{s.minimumDueEstimated ? ' (est.)' : ''}</div>
              </div>
              <Money value={s.statementRemaining} decimals={0} className="text-sm font-bold" />
              <GhostButton onClick={() => openComposer({ kind: 'card_payment', toAccountId: a.id })}>Pay</GhostButton>
            </li>
          ))}
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-ink-2">
              <span className={`grid size-9 place-items-center rounded-lg ${i.state === 'overdue' ? 'bg-coral/12 text-coral' : i.state === 'due_today' ? 'bg-gold/12 text-gold' : 'bg-ink-3 text-chalk-dim'}`}>
                <Icon name={i.kind === 'emi' ? 'loan' : i.kind === 'income' ? 'arrowDown' : 'repeat'} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{i.name}</div>
                <div className={`text-xs ${i.state === 'overdue' ? 'text-coral' : 'text-mute'}`}>
                  {i.state === 'overdue' ? `Overdue · ${relativeDay(i.dueOn, d.today)}` : relativeDay(i.dueOn, d.today)}
                  {ruleById.get(i.ruleId)?.bankAutopay && ' · autopay at bank'}
                </div>
              </div>
              {i.amount ? <Money value={i.amount} decimals={0} className="text-sm font-bold" /> : <Badge>Variable</Badge>}
              <GhostButton onClick={() => openComposer(presetForDue(i, ruleById.get(i.ruleId)))}>{i.kind === 'income' ? 'Got it' : 'Paid'}</GhostButton>
            </li>
          ))}
        </ul>
      )}
    </Plate>
  );
}

export function ReimbursementsWidget({ d }: { d: DashboardData }) {
  const openComposer = useUi((s) => s.openComposer);
  const rows = d.people
    .map((p) => ({ p, b: d.personBalances.get(p.id) }))
    .filter((x) => x.b && x.b.outstanding !== 0n)
    .sort((a, b) => (b.b!.outstanding > a.b!.outstanding ? 1 : -1));
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow="Reimbursements" title="Owed to you" action={<Link href="/people" className="text-xs font-bold text-mute hover:text-chalk">All people</Link>} />
      {rows.length === 0 ? (
        <EmptyState icon="users" title="All square" body="When you pay for someone, their share shows up here until they pay you back." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {rows.slice(0, 6).map(({ p, b }) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-ink-2">
              <Avatar name={p.name} color={p.color} emoji={p.emoji} size={36} />
              <Link href={`/people/view?id=${p.id}`} className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-mute">{b!.outstanding > 0n ? 'owes you' : 'you owe'}</div>
              </Link>
              <Money value={b!.outstanding > 0n ? b!.outstanding : -b!.outstanding} decimals={0} className={`text-sm font-bold ${b!.outstanding > 0n ? 'text-mint' : 'text-coral'}`} />
              {b!.outstanding > 0n && <GhostButton onClick={() => openComposer({ kind: 'reimbursement', personId: p.id })}>Settle</GhostButton>}
            </li>
          ))}
        </ul>
      )}
    </Plate>
  );
}

export function CategoryWidget({ d, period }: { d: DashboardData; period: PeriodPreset }) {
  const range = periodRange(period, d.today);
  const slices = useMemo(() => categoryBreakdown(d.entries, d.categories, 'expense', range.from, range.to), [d.entries, d.categories, range.from, range.to]);
  const catById = new Map(d.categories.map((c) => [c.id, c]));
  const total = slices.reduce((s, x) => s + x.amount, 0n);
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow={range.label} title="Where it went" />
      {slices.length === 0 ? (
        <EmptyState icon="pie" title="No spending yet" />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Donut
            slices={slices.slice(0, 8).map((s) => ({ label: catById.get(s.categoryId)?.name ?? '?', value: s.amount, color: catById.get(s.categoryId)?.color ?? '#888' }))}
            center={
              <div>
                <div className="text-[11px] text-mute">Your spending</div>
                <Money value={total} decimals={0} className="font-display text-lg font-semibold" compact />
              </div>
            }
          />
          <ul className="w-full flex-1 space-y-2">
            {slices.slice(0, 6).map((s) => {
              const c = catById.get(s.categoryId);
              return (
                <li key={s.categoryId} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: c?.color ?? '#888' }} />
                  <span className="flex-1 truncate text-chalk-dim">{c?.name}</span>
                  <span className="text-xs text-faint">{formatBps(s.shareBps, 0)}</span>
                  <Money value={s.amount} decimals={0} className="w-24 text-right font-semibold" />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Plate>
  );
}

export function LoansWidget({ d }: { d: DashboardData }) {
  const loans = d.accounts.filter((a) => groupOf(a) === 'loan' && a.status === 'active');
  return (
    <Plate className="p-6">
      <SectionTitle eyebrow="Obligations" title="Loans" action={<Link href="/loans" className="text-xs font-bold text-mute hover:text-chalk">Details</Link>} />
      {loans.length === 0 ? (
        <EmptyState icon="loan" title="No loans" />
      ) : (
        <ul className="space-y-4">
          {loans.map((l) => {
            const out = d.balances.get(l.id)?.balance ?? 0n;
            const principal = l.loan?.principalAmount ?? 0n;
            const paidBps = principal > 0n ? Number(((principal - out) * 10_000n) / principal) : 0;
            return (
              <li key={l.id}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">{l.nickname || l.name}</span>
                  <Money value={out} decimals={0} className="font-bold" />
                </div>
                <Meter valueBps={paidBps} />
                <div className="mt-1 text-xs text-faint">
                  {formatBps(Math.max(0, paidBps), 0)} repaid{l.loan?.emiAmount ? ` · EMI ` : ''}
                  {l.loan?.emiAmount ? <Money value={l.loan.emiAmount} decimals={0} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Plate>
  );
}

export function RecentWidget({ d }: { d: DashboardData }) {
  return (
    <Plate className="p-3 sm:p-4">
      <div className="px-3 pt-3">
        <SectionTitle eyebrow="Ledger" title="Recent activity" action={<Link href="/transactions" className="text-xs font-bold text-mute hover:text-chalk">Everything</Link>} />
      </div>
      <EntryList entries={d.recent} lookups={d.lookups} empty={<EmptyState icon="flash" title="Record your first entry" body="Press N or the + button. Expenses take seconds." />} />
    </Plate>
  );
}
