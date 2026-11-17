'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { accountMeta, displayName, type PersonRelation } from '@folio/core';
import { useAccounts, useBalances, usePeople, useProfile, useSavePerson, useUpdateProfile } from '@folio/api';
import { FinanceCard } from '@/components/cards/FinanceCard';
import { AccountEditor } from '@/components/forms/AccountEditor';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Field, GhostButton, PopButton, Select, TextInput } from '@/components/ui/primitives';
import { useSession } from '@/lib/session';
import { useUi } from '@/lib/store';

const QUICK_TYPES = [
  { type: 'savings', label: 'Bank account', icon: 'bank', body: 'Savings, salary, current' },
  { type: 'credit_card', label: 'Credit card', icon: 'card', body: 'Limit, statement and due dates' },
  { type: 'debit_card', label: 'Debit card', icon: 'card', body: 'Linked to a bank account' },
  { type: 'cash', label: 'Cash', icon: 'cash', body: 'What is in your wallet' },
  { type: 'wallet', label: 'Digital wallet', icon: 'wallet', body: 'Paytm, Amazon Pay…' },
  { type: 'vehicle_loan', label: 'Loan', icon: 'loan', body: 'Bike, car, education, personal' },
  { type: 'fixed_deposit', label: 'Deposit', icon: 'lock', body: 'FDs and RDs' },
  { type: 'custom', label: 'Something else', icon: 'sparkle', body: 'Your own type' },
];

export default function Onboarding() {
  const router = useRouter();
  const { session, ready } = useSession();
  const [step, setStep] = useState(0);
  const profile = useProfile();
  const update = useUpdateProfile();
  const accounts = useAccounts().data ?? [];
  const balances = useBalances().data;
  const people = usePeople().data ?? [];
  const savePerson = useSavePerson();
  const openEditor = useUi((s) => s.openAccountEditor);
  const [name, setName] = useState('');
  const [personName, setPersonName] = useState('');
  const [relation, setRelation] = useState<PersonRelation>('parent');

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);
  useEffect(() => {
    if (profile.data?.displayName && !name) setName(profile.data.displayName);
  }, [profile.data?.displayName, name]);

  const finish = async () => {
    await update.mutateAsync({ onboarded: true, displayName: name || null });
    router.replace('/');
  };

  const steps = [
    <div key="welcome" className="space-y-8">
      <div>
        <div className="text-[11px] font-bold tracking-[0.2em] text-mint uppercase">Welcome to Folio</div>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] font-semibold tracking-tight">Your money,
          <br />
          finally in one place.</h1>
        <p className="mt-4 max-w-md text-mute">Nothing is pre-filled. You add your own accounts and cards. Then every entry you record updates your balances, what you owe and what you&apos;re owed.</p>
      </div>
      <Field label="What should Folio call you?">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="max-w-sm" />
      </Field>
      <div className="grid max-w-lg grid-cols-3 gap-3 text-sm">
        {[
          ['Currency', '₹ INR'],
          ['Timezone', 'Asia/Kolkata'],
          ['Dates', 'DD/MM/YYYY'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-ink-2 p-3">
            <div className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase">{k}</div>
            <div className="mt-1 font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <PopButton tone="mint" size="lg" onClick={() => setStep(1)}>
        Let&apos;s set it up <Icon name="arrowRight" size={18} />
      </PopButton>
    </div>,

    <div key="accounts" className="space-y-7">
      <div>
        <div className="text-[11px] font-bold tracking-[0.2em] text-mint uppercase">Step 1 of 2</div>
        <h1 className="mt-3 font-display text-4xl font-semibold">Add what you own and owe</h1>
        <p className="mt-2 text-mute">Use today&apos;s balance as the starting point. You can add more, reorder and restyle any time.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_TYPES.map((q) => (
          <button key={q.type} onClick={() => openEditor({ type: q.type })} className="group cursor-pointer rounded-2xl border border-line bg-ink-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-mint/40">
            <Icon name={q.icon} size={22} className="text-mint" />
            <div className="mt-3 text-sm font-bold">{q.label}</div>
            <div className="mt-0.5 text-xs text-mute">{q.body}</div>
          </button>
        ))}
      </div>
      {accounts.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {accounts.map((a) => (
            <div key={a.id} className="w-[260px] shrink-0">
              <FinanceCard account={a} balance={balances?.get(a.id)?.balance ?? 0n} onClick={() => openEditor({ id: a.id })} />
              <div className="mt-2 px-1 text-xs text-mute">
                {displayName(a)} · {accountMeta(a.type).label}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-4">
        <PopButton tone="mint" size="lg" onClick={() => setStep(2)} disabled={accounts.length === 0}>
          Continue <Icon name="arrowRight" size={18} />
        </PopButton>
        <GhostButton onClick={() => setStep(0)}>Back</GhostButton>
      </div>
    </div>,

    <div key="people" className="space-y-7">
      <div>
        <div className="text-[11px] font-bold tracking-[0.2em] text-mint uppercase">Step 2 of 2</div>
        <h1 className="mt-3 font-display text-4xl font-semibold">Who do you pay for?</h1>
        <p className="mt-2 max-w-lg text-mute">Parents, friends and roommates you cover purchases for. Their share is tracked as money owed to you, never as your own spending.</p>
      </div>
      <div className="flex max-w-xl flex-wrap items-end gap-3">
        <Field label="Name" className="min-w-48 flex-1">
          <TextInput value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Parents" />
        </Field>
        <Field label="Relation">
          <Select value={relation} onChange={(e) => setRelation(e.target.value as PersonRelation)}>
            {['parent', 'family', 'friend', 'roommate', 'partner', 'colleague', 'other'].map((r) => (
              <option key={r} value={r}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <PopButton
          tone="chalk"
          icon="plus"
          className="mb-[5px]"
          disabled={!personName.trim()}
          loading={savePerson.isPending}
          onClick={async () => {
            await savePerson.mutateAsync({ name: personName, relation, color: ['#7cf2c4', '#f5c26b', '#6aa8ff', '#c38bff', '#ff7a59'][people.length % 5] });
            setPersonName('');
            toast.success(`${personName} added`);
          }}
        >
          Add
        </PopButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <span key={p.id} className="flex items-center gap-2 rounded-full border border-line bg-ink-2 py-1 pr-4 pl-1 text-sm font-semibold">
            <Avatar name={p.name} color={p.color} size={28} />
            {p.name}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <PopButton tone="mint" size="lg" onClick={finish} loading={update.isPending}>
          Open my Folio
        </PopButton>
        <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
      </div>
    </div>,
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -top-56 -right-40 h-[620px] w-[620px] rounded-full bg-mint/8 blur-[140px]" />
      <div className="relative mx-auto max-w-4xl px-6 py-16 lg:py-24">
        <div className="mb-14 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="h-1 rounded-full bg-chalk" animate={{ width: i === step ? 40 : 14, opacity: i <= step ? 1 : 0.2 }} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <AccountEditor />
    </div>
  );
}
