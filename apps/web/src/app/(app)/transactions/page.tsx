'use client';
import { useState } from 'react';
import { ENTRY_TYPE_LABEL, ENTRY_TYPES, type EntryType } from '@folio/core';
import { useEntries, useLedgerContext } from '@folio/api';
import { EntryList, useLookups } from '@/components/entry/EntryViews';
import { Icon } from '@/components/ui/Icon';
import { Chip, Plate, PopButton, Select, TextInput, Toggle } from '@/components/ui/primitives';
import { useUi } from '@/lib/store';

const QUICK: { label: string; types: EntryType[] }[] = [
  { label: 'All', types: [] },
  { label: 'Spending', types: ['expense', 'card_purchase'] },
  { label: 'Income', types: ['income', 'interest', 'bank_deposit'] },
  { label: 'Transfers', types: ['transfer', 'cash_withdrawal', 'cash_deposit'] },
  { label: 'Card payments', types: ['card_repayment'] },
  { label: 'Reimbursements', types: ['reimbursement_received', 'reimbursement_paid'] },
  { label: 'Loans', types: ['loan_repayment', 'loan_disbursement'] },
];

export default function Transactions() {
  const { accounts, categories, people } = useLedgerContext();
  const lookups = useLookups();
  const openComposer = useUi((s) => s.openComposer);
  const [quick, setQuick] = useState(0);
  const [type, setType] = useState<EntryType | ''>('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [personId, setPersonId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeVoid, setIncludeVoid] = useState(false);
  const types = type ? [type] : QUICK[quick]!.types;
  const q = useEntries({ types, accountId: accountId || undefined, categoryId: categoryId || undefined, personId: personId || undefined, search, from: from || undefined, to: to || undefined, includeVoid });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Every financial event</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Ledger</h1>
        </div>
        <PopButton tone="mint" icon="plus" onClick={() => openComposer()}>
          New entry
        </PopButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((qq, i) => (
          <Chip key={qq.label} active={quick === i && !type} onClick={() => { setQuick(i); setType(''); }}>
            {qq.label}
          </Chip>
        ))}
      </div>
      <Plate className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Icon name="search" size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-mute" />
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search descriptions" className="pl-9" />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
          <option value="">Any type</option>
          {ENTRY_TYPES.map((t) => <option key={t} value={t}>{ENTRY_TYPE_LABEL[t]}</option>)}
        </Select>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Any account</option>
          {accounts.filter((a) => a.type !== 'debit_card').map((a) => <option key={a.id} value={a.id}>{a.nickname || a.name}</option>)}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Any category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.kind === 'income' ? '↓ ' : ''}{c.name}</option>)}
        </Select>
        <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Any person</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <div className="lg:col-span-4"><Toggle checked={includeVoid} onChange={setIncludeVoid} label="Show voided entries" /></div>
      </Plate>
      <Plate className="p-2 sm:p-3">
        <EntryList entries={q.data?.pages.flat() ?? []} lookups={lookups} accountId={accountId || undefined} loading={q.isLoading} hasMore={q.hasNextPage} onMore={() => void q.fetchNextPage()} />
      </Plate>
    </div>
  );
}
