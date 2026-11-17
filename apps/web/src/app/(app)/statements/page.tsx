'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { addDays, addMonths, buildEntry, cardCycle, computeBalances, formatDate, formatMoney, groupOf, importStatementCsv, ledgerLinesFor, reconcile, tryParseAmount, type StatementLine } from '@folio/core';
import { invalidateLedger, repo, useCategories, useEntriesInRange, useFolio, useLedgerContext, useMarkStatement, useSaveStatement, useStatementLines, useStatements, useToday } from '@folio/api';
import { Icon } from '@/components/ui/Icon';
import { AmountInput, Badge, EmptyState, Field, GhostButton, Money, Plate, PopButton, SectionTitle, Select, Sheet, Skeleton, TextInput } from '@/components/ui/primitives';

function StatementsInner() {
  const params = useSearchParams();
  const t = useToday();
  const { sb } = useFolio();
  const qc = useQueryClient();
  const { ctx, accounts } = useLedgerContext();
  const categories = useCategories().data ?? [];
  const eligible = accounts.filter((a) => a.status === 'active' && a.type !== 'debit_card' && (groupOf(a) === 'credit' || groupOf(a) === 'bank' || groupOf(a) === 'loan'));
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  useEffect(() => {
    if (!accountId && eligible[0]) setAccountId(eligible[0].id);
  }, [accountId, eligible]);
  const account = accounts.find((a) => a.id === accountId);
  const statements = useStatements(accountId || undefined);
  const save = useSaveStatement();
  const mark = useMarkStatement();
  const [selected, setSelected] = useState<string | null>(null);
  const stmt = statements.data?.find((s) => s.id === selected) ?? null;
  const lines = useStatementLines(selected);
  const ledger = useEntriesInRange({ accountId: accountId || undefined }, !!accountId);

  // New statement form
  const [creating, setCreating] = useState(false);
  const [stmtDate, setStmtDate] = useState(t);
  const [periodStart, setPeriodStart] = useState(addMonths(t, -1));
  const [dueDate, setDueDate] = useState(addDays(t, 20));
  const [balance, setBalance] = useState('');
  const [minDue, setMinDue] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const startCreate = () => {
    const c = account?.card?.statementDay ? cardCycle(account.card.statementDay, account.card.dueDay, t) : null;
    const sd = c?.lastStatementOn ?? t;
    setStmtDate(sd);
    setPeriodStart(addDays(addMonths(sd, -1), 1));
    setDueDate(c?.dueOn ?? addDays(sd, 20));
    setBalance('');
    setMinDue('');
    setPdf(null);
    setCreating(true);
  };

  const result = useMemo(() => {
    if (!stmt || !account || !ledger.data || !lines.data) return null;
    const ll = ledgerLinesFor(account, ledger.data, stmt.periodStart, stmt.periodEnd);
    const bal = computeBalances([account], ledger.data, stmt.periodEnd).get(account.id)!.balance;
    // For bank statements the closing balance compares with the asset balance; cards compare outstanding.
    return reconcile(lines.data, ll, { statementBalance: stmt.statementBalance, ledgerBalance: bal });
  }, [stmt, account, ledger.data, lines.data]);

  const importCsv = async (file: File) => {
    if (!stmt) return;
    const text = await file.text();
    const res = importStatementCsv(text);
    if (res.lines.length === 0) {
      toast.error(res.skipped[0]?.reason ?? 'No lines found');
      return;
    }
    // Bank CSVs list debits as money out — same convention as card charges here.
    await repo.replaceStatementLines(sb, stmt.id, res.lines);
    void qc.invalidateQueries({ queryKey: ['folio', 'statement-lines', stmt.id] });
    toast.success(`Imported ${res.lines.length} lines`, { description: res.skipped.length ? `${res.skipped.length} rows skipped` : undefined });
  };

  const addMissing = async (line: StatementLine) => {
    if (!ctx || !account) return;
    const other = categories.find((c) => c.systemKey === 'other_expense')!;
    try {
      const entry =
        line.amount > 0n
          ? buildEntry({ kind: 'expense', accountId: account.id, amount: line.amount, categoryId: other.id, description: line.description.slice(0, 140), occurredOn: line.occurredOn, idempotencyKey: `stmt:${stmt!.id}:${line.id}`, source: 'import' }, ctx)
          : groupOf(account) === 'credit'
            ? buildEntry({ kind: 'refund', accountId: account.id, amount: -line.amount, categoryId: other.id, description: line.description.slice(0, 140), occurredOn: line.occurredOn, idempotencyKey: `stmt:${stmt!.id}:${line.id}`, source: 'import' }, ctx)
            : buildEntry({ kind: 'bank_deposit', accountId: account.id, amount: -line.amount, description: line.description.slice(0, 140), occurredOn: line.occurredOn, idempotencyKey: `stmt:${stmt!.id}:${line.id}`, source: 'import' }, ctx);
      entry.statementId = stmt!.id;
      const res = await repo.postEntry(sb, entry);
      if (line.id) await repo.matchStatementLine(sb, line.id, res.id);
      invalidateLedger(qc);
      void qc.invalidateQueries({ queryKey: ['folio', 'statement-lines', stmt!.id] });
      toast.success('Added to ledger', { description: 'Categorised as "Other" — open it to recategorise.' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-mute uppercase">Bills you received, checked against your ledger</div>
          <h1 className="mt-1 font-display text-4xl font-semibold">Statements</h1>
        </div>
        <div className="flex items-end gap-3">
          <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setSelected(null); }} className="w-56">
            {eligible.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.name}</option>)}
          </Select>
          <PopButton tone="mint" icon="plus" onClick={startCreate} disabled={!account}>Record statement</PopButton>
        </div>
      </div>
      <p className="max-w-2xl text-sm text-mute">Folio doesn&apos;t connect to your bank. Record each statement&apos;s totals, attach the PDF for safekeeping, and import the CSV from netbanking to match every line against your entries.</p>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Plate className="p-3">
          {statements.isLoading ? <Skeleton className="h-40" /> : !statements.data?.length ? <EmptyState icon="doc" title="No statements" /> : (
            <ul className="space-y-1">
              {statements.data.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setSelected(s.id)} className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm ${selected === s.id ? 'bg-ink-3' : 'hover:bg-ink-2'}`}>
                    <div><div className="font-semibold">{formatDate(s.statementDate)}</div><div className="text-xs text-mute">{s.filePath ? '📎 PDF · ' : ''}{s.status.replace('_', ' ')}</div></div>
                    <Money value={s.statementBalance} className="font-bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Plate>

        <div>
          {!stmt ? (
            <Plate><EmptyState icon="doc" title="Pick a statement" body="Select one on the left to reconcile it." /></Plate>
          ) : (
            <div className="space-y-6">
              <Plate className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{formatDate(stmt.periodStart)} – {formatDate(stmt.periodEnd)}</div>
                  <Money value={stmt.statementBalance} className="mt-1 block font-display text-3xl font-semibold" />
                  <div className="text-xs text-mute">Due {stmt.dueDate ? formatDate(stmt.dueDate) : '—'}{stmt.minimumDue != null ? <> · min <Money value={stmt.minimumDue} /></> : null}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stmt.filePath && (
                    <GhostButton
                      icon="doc"
                      onClick={async () => {
                        const f = await repo.getFile(sb, stmt.filePath!);
                        const url = URL.createObjectURL(new Blob([repo.base64ToBytes(f.base64) as BlobPart], { type: f.mime }));
                        window.open(url, '_blank', 'noopener');
                        setTimeout(() => URL.revokeObjectURL(url), 60_000);
                      }}
                    >
                      Open PDF
                    </GhostButton>
                  )}
                  <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />
                  <PopButton tone="dark" icon="upload" onClick={() => csvRef.current?.click()}>Import CSV</PopButton>
                  <Select value={stmt.status} onChange={(e) => mark.mutate({ id: stmt.id, status: e.target.value as never })} className="w-40">
                    {['open', 'partially_paid', 'paid', 'reconciled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </Select>
                </div>
              </Plate>

              {result && (
                <Plate className="p-6">
                  <SectionTitle title="Reconciliation" action={result.reconciled ? <Badge tone="mint">Reconciled</Badge> : <Badge tone="gold">Needs attention</Badge>} />
                  <div className="mb-6 grid grid-cols-3 gap-4 text-sm">
                    <div><div className="text-xs text-mute">Statement says</div><Money value={result.statementBalance ?? 0n} className="text-lg font-bold" /></div>
                    <div><div className="text-xs text-mute">Folio says (on {formatDate(stmt.periodEnd)})</div><Money value={result.ledgerBalance} className="text-lg font-bold" /></div>
                    <div><div className="text-xs text-mute">Difference</div><Money value={result.difference ?? 0n} className={`text-lg font-bold ${result.difference === 0n ? 'text-mint' : 'text-coral'}`} /></div>
                  </div>
                  {lines.data?.length === 0 && <p className="mb-4 text-sm text-mute">Import the statement CSV to match line by line. Without lines, only the closing balance is compared.</p>}
                  {result.missingInLedger.length > 0 && (
                    <div className="mb-6">
                      <div className="mb-2 text-sm font-bold text-gold">On the statement, missing in Folio ({result.missingInLedger.length})</div>
                      <ul className="divide-y divide-line rounded-xl border border-line">
                        {result.missingInLedger.map((l, i) => (
                          <li key={l.id ?? i} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="w-20 text-xs text-mute">{formatDate(l.occurredOn)}</span><span className="flex-1 truncate">{l.description}</span><Money value={l.amount} className="font-bold" /><GhostButton icon="plus" onClick={() => void addMissing(l)}>Add</GhostButton></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.missingOnStatement.length > 0 && (
                    <div className="mb-6">
                      <div className="mb-2 text-sm font-bold text-coral">In Folio, not on the statement ({result.missingOnStatement.length})</div>
                      <ul className="divide-y divide-line rounded-xl border border-line">
                        {result.missingOnStatement.map((l) => <li key={l.entryId} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="w-20 text-xs text-mute">{formatDate(l.occurredOn)}</span><span className="flex-1 truncate">{l.description}</span><Money value={l.amount} className="font-bold" /></li>)}
                      </ul>
                      <p className="mt-2 text-xs text-faint">Could be a typo, a duplicate, or something that posts in the next cycle.</p>
                    </div>
                  )}
                  {result.matches.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm font-bold text-mint"><Icon name="check" size={14} className="mr-1 inline" />{result.matches.length} matched</summary>
                      <ul className="mt-2 divide-y divide-line text-sm">{result.matches.map((m, i) => <li key={i} className="flex justify-between gap-3 py-2"><span className="truncate">{m.line.description}</span><span className="text-xs text-faint">↔ {m.ledger.description}</span><Money value={m.line.amount} /></li>)}</ul>
                    </details>
                  )}
                </Plate>
              )}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        eyebrow={account?.nickname || account?.name}
        title="Record a statement"
        footer={
          <PopButton tone="mint" size="lg" loading={busy} disabled={tryParseAmount(balance) === null} onClick={async () => {
            setBusy(true);
            try {
              let filePath: string | null = null;
              if (pdf) filePath = await repo.uploadFile(sb, 'statements', pdf.name, pdf, pdf.type || 'application/pdf');
              const id = await save.mutateAsync({ accountId, periodStart, periodEnd: stmtDate, statementDate: stmtDate, dueDate: dueDate || null, statementBalance: tryParseAmount(balance)!, minimumDue: tryParseAmount(minDue), filePath, notes: null });
              setSelected(id);
              setCreating(false);
              toast.success('Statement saved');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not save');
            } finally {
              setBusy(false);
            }
          }}>Save</PopButton>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Period from"><TextInput type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
            <Field label="Statement date"><TextInput type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} /></Field>
            <Field label={groupOf(account ?? { type: 'savings' }) === 'credit' ? 'Total due' : 'Closing balance'}><AmountInput value={balance} onChange={setBalance} /></Field>
            <Field label="Minimum due"><AmountInput value={minDue} onChange={setMinDue} /></Field>
            <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </div>
          <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          <GhostButton icon="upload" onClick={() => pdfRef.current?.click()}>{pdf ? pdf.name : 'Attach statement PDF (optional)'}</GhostButton>
          <p className="text-xs text-faint">The PDF is stored privately and isn&apos;t parsed. Password-protected PDFs stay protected. Amounts: {formatMoney(tryParseAmount(balance) ?? 0n)}</p>
        </div>
      </Sheet>
    </div>
  );
}

export default function StatementsPage() {
  return (
    <Suspense>
      <StatementsInner />
    </Suspense>
  );
}
