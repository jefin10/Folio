'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ACCOUNT_TYPE_META,
  ACCOUNT_TYPES,
  CARD_NETWORKS,
  CARD_PRODUCTS,
  CARD_THEME_PRESETS,
  computeEmi,
  containsSensitiveCardData,
  findInstitution,
  formatMoney,
  groupOf,
  INSTITUTION_KIND_LABEL,
  LOAN_KINDS,
  searchInstitutions,
  themeFromInstitution,
  tryParseAmount,
  type AccountType,
  type CardNetwork,
  type CardTheme,
  type CardProduct,
  type CatalogInstitution,
  type LoanKind,
} from '@folio/core';
import { repo, useAccountStatus, useAccounts, useBalances, useDeleteAccount, useFolio, useInstitutions, usePatchAccount, useSaveAccount, useSaveInstitution, useToday } from '@folio/api';
import { cx } from '@/lib/cx';
import { useUi } from '@/lib/store';
import { FinanceCard } from '../cards/FinanceCard';
import { InstitutionBadge } from '../cards/InstitutionBadge';
import { Icon } from '../ui/Icon';
import { AmountInput, Field, GhostButton, PopButton, Segmented, Select, Sheet, TextArea, TextInput, Toggle } from '../ui/primitives';

const TYPE_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Bank', types: ['savings', 'salary', 'current'] },
  { label: 'Cards & credit', types: ['credit_card', 'secured_credit_card', 'debit_card', 'bnpl'] },
  { label: 'Cash & wallets', types: ['cash', 'wallet'] },
  { label: 'Deposits & assets', types: ['fixed_deposit', 'recurring_deposit', 'other_asset'] },
  { label: 'Loans & liabilities', types: ['vehicle_loan', 'personal_loan', 'education_loan', 'home_loan', 'other_loan', 'other_liability'] },
  { label: 'Anything else', types: ['custom'] },
];

const plain = (p: bigint | null | undefined) => (p == null ? '' : formatMoney(p, { symbol: '', decimals: 'auto' }).replace(/,/g, ''));
const pct = (bps: number | null | undefined) => (bps == null ? '' : String(bps / 100));
const toBps = (s: string) => {
  if (!s.trim()) return null;
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
};
const day = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

function InstitutionField({ value, onPick }: { value: string; onPick: (name: string, cat: CatalogInstitution | null) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(value), [value]);
  const results = useMemo(() => searchInstitutions(q, 14), [q]);
  return (
    <div className="relative">
      <div className="relative">
        <span className="absolute top-1/2 left-2.5 -translate-y-1/2">
          <InstitutionBadge name={q || null} size={26} />
        </span>
        <TextInput
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            onPick(e.target.value, findInstitution(e.target.value));
            setOpen(true);
          }}
          placeholder="Search 90+ banks, issuers, wallets — or type your own"
          className="pl-12"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-line-strong bg-ink-2 p-1.5 shadow-2xl">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ(r.name);
                onPick(r.name, r);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink-3"
            >
              <InstitutionBadge name={r.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="block text-[11px] text-mute">{INSTITUTION_KIND_LABEL[r.kind]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountEditor() {
  const target = useUi((s) => s.accountEditor);
  const close = () => useUi.getState().openAccountEditor(null);
  const open = target !== null;
  const t = useToday();
  const { sb } = useFolio();
  const accounts = useAccounts().data ?? [];
  const balances = useBalances().data;
  const institutions = useInstitutions().data ?? [];
  const save = useSaveAccount();
  const saveInst = useSaveInstitution();
  const setStatus = useAccountStatus();
  const del = useDeleteAccount();
  const patchArt = usePatchAccount();
  const existing = target?.id ? accounts.find((a) => a.id === target.id) ?? null : null;

  const [type, setType] = useState<AccountType>('savings');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [institution, setInstitution] = useState('');
  const [catalog, setCatalog] = useState<CatalogInstitution | null>(null);
  const [last4, setLast4] = useState('');
  const [theme, setTheme] = useState<CardTheme>(CARD_THEME_PRESETS.mint!);
  const [opening, setOpening] = useState('');
  const [openedOn, setOpenedOn] = useState(t);
  const [customClass, setCustomClass] = useState<'asset' | 'liability'>('asset');
  const [customLabel, setCustomLabel] = useState('');
  const [includeNW, setIncludeNW] = useState(true);
  const [liquid, setLiquid] = useState(true);
  const [notes, setNotes] = useState('');
  const [linked, setLinked] = useState('');
  const [rate, setRate] = useState('');
  // card
  const [limit, setLimit] = useState('');
  const [stmtDay, setStmtDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [network, setNetwork] = useState<CardNetwork | ''>('');
  const [variant, setVariant] = useState('');
  const [fee, setFee] = useState('');
  const [ltf, setLtf] = useState(false);
  const [rewards, setRewards] = useState('');
  const [rewardRate, setRewardRate] = useState('');
  // loan
  const [loanKind, setLoanKind] = useState<LoanKind>('two_wheeler');
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [emi, setEmi] = useState('');
  const [tenure, setTenure] = useState('');
  const [emiDay, setEmiDay] = useState('');
  const [emiAccount, setEmiAccount] = useState('');
  const [artFile, setArtFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  const applyProduct = (p: CardProduct) => {
    setProductId(p.id);
    setType(p.type);
    setName(p.name);
    setInstitution(p.issuerName);
    setCatalog(findInstitution(p.issuerId));
    setNetwork(p.network ?? '');
    setVariant(p.variant);
    setFee(plain(p.annualFee));
    setLtf(p.lifetimeFree);
    setRewards(p.rewardsInfo.slice(0, 300));
    setRewardRate(pct(p.rewardRateBps));
    setTheme(p.theme);
  };
  const artRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const a = existing;
    const initialType = (a?.type ?? (target?.type as AccountType | undefined) ?? 'savings') as AccountType;
    setType(initialType);
    setName(a?.name ?? '');
    setNickname(a?.nickname ?? '');
    setInstitution(a?.institutionName ?? '');
    setCatalog(findInstitution(a?.institutionName));
    setLast4(a?.last4 ?? '');
    setTheme(a?.theme ?? (groupOf({ type: initialType }) === 'credit' ? CARD_THEME_PRESETS.obsidian! : CARD_THEME_PRESETS.mint!));
    setOpening('');
    setOpenedOn(a?.openedOn ?? t);
    setCustomClass(a?.class ?? 'asset');
    setCustomLabel(a?.customTypeLabel ?? '');
    setIncludeNW(a?.includeInNetWorth ?? true);
    setLiquid(a?.isLiquid ?? ACCOUNT_TYPE_META[initialType].liquid);
    setNotes(a?.notes ?? '');
    setLinked(a?.linkedAccountId ?? '');
    setRate(pct(a?.interestRateBps ?? a?.loan?.interestRateBps));
    setLimit(plain(a?.card?.creditLimit));
    setStmtDay(a?.card?.statementDay?.toString() ?? '');
    setDueDay(a?.card?.dueDay?.toString() ?? '');
    setNetwork(a?.card?.network ?? '');
    setVariant(a?.card?.variant ?? '');
    setFee(plain(a?.card?.annualFee));
    setLtf(a?.card?.lifetimeFree ?? false);
    setRewards(a?.card?.rewardsInfo ?? '');
    setRewardRate(pct(a?.card?.rewardRateBps));
    setLoanKind(a?.loan?.loanKind ?? 'two_wheeler');
    setLender(a?.loan?.lender ?? '');
    setPrincipal(plain(a?.loan?.principalAmount));
    setEmi(plain(a?.loan?.emiAmount));
    setTenure(a?.loan?.tenureMonths?.toString() ?? '');
    setEmiDay(a?.loan?.emiDay?.toString() ?? '');
    setEmiAccount(a?.loan?.emiAccountId ?? '');
    setArtFile(null);
    setLogoFile(null);
    setConfirmDelete(false);
    setProductId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id, target?.type]);

  // The opening balance shown when editing is derived from the current ledger.
  useEffect(() => {
    if (!open || !existing || !balances) return;
    // Opening balance can't be read back without the entry; leave blank = unchanged.
  }, [open, existing, balances]);

  const meta = ACCOUNT_TYPE_META[type];
  const group = groupOf({ type });
  const isCredit = group === 'credit';
  const isLoan = group === 'loan';
  const banks = accounts.filter((a) => (groupOf(a) === 'bank' || a.type === 'wallet') && a.id !== existing?.id && a.status === 'active');

  const suggestedEmi = useMemo(() => {
    const p = tryParseAmount(principal);
    const r = toBps(rate);
    const n = Number(tenure);
    if (!p || r === null || !n) return null;
    try {
      return computeEmi(p, r, n);
    } catch {
      return null;
    }
  }, [principal, rate, tenure]);

  const preview = {
    ...(existing ?? {
      id: 'preview',
      currency: 'INR',
      color: null,
      icon: null,
      status: 'active' as const,
      sortOrder: 0,
      linkedAccountId: null,
      card: null,
      loan: null,
      openedOn: t,
      institutionId: null,
      artworkPath: null,
      interestRateBps: null,
      customTypeLabel: null,
      notes: null,
      includeInNetWorth: true,
      isLiquid: true,
    }),
    name: name || meta.label,
    nickname: nickname || null,
    type,
    class: type === 'custom' ? customClass : meta.class,
    institutionName: institution || null,
    institutionId: institutions.find((i) => i.name === institution)?.id ?? null,
    last4: /^\d{4}$/.test(last4) ? last4 : null,
    theme,
    customTypeLabel: customLabel || null,
    card: isCredit ? { network: network || null, variant, creditLimit: tryParseAmount(limit), statementDay: day(stmtDay), dueDay: day(dueDay), annualFee: null, lifetimeFree: ltf, rewardsInfo: null, rewardRateBps: null, minDueBps: null } : null,
  };
  const previewBalance = existing ? balances?.get(existing.id)?.balance ?? 0n : tryParseAmount(opening) ?? 0n;

  const sensitive = containsSensitiveCardData(`${name} ${nickname} ${notes} ${variant}`);
  const valid = name.trim().length > 0 && (type !== 'debit_card' || !!linked) && (last4 === '' || /^\d{4}$/.test(last4)) && (opening === '' || tryParseAmount(opening) !== null) && !sensitive;

  const onSubmit = async () => {
    try {
      let institutionId: string | null = existing?.institutionId ?? null;
      if (institution.trim()) {
        let logoPath: string | undefined;
        if (logoFile) logoPath = await repo.uploadFile(sb, 'logos', logoFile.name, logoFile, logoFile.type || 'image/png');
        institutionId = await saveInst.mutateAsync({ name: institution.trim(), color: catalog?.colors[0] ?? null, ...(logoPath ? { logoPath } : {}) });
      }
      let artworkPath: string | undefined;
      if (artFile) artworkPath = await repo.uploadFile(sb, 'artwork', artFile.name, artFile, artFile.type || 'image/png');
      const openingBal = tryParseAmount(opening);
      const id = await save.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        nickname: nickname.trim() || null,
        type,
        customClass: type === 'custom' ? customClass : null,
        customTypeLabel: type === 'custom' ? customLabel.trim() || null : null,
        institutionName: institution.trim() || null,
        last4: last4 || null,
        theme,
        color: theme.colors[0] ?? null,
        icon: meta.icon,
        interestRateBps: isLoan ? null : toBps(rate),
        includeInNetWorth: includeNW,
        isLiquid: liquid,
        notes: notes.trim() || null,
        linkedAccountId: type === 'debit_card' ? linked || null : null,
        openedOn,
        ...(artworkPath ? { artworkPath } : {}),
        card: isCredit
          ? { network: network || null, variant: variant || null, creditLimit: tryParseAmount(limit), statementDay: day(stmtDay), dueDay: day(dueDay), annualFee: tryParseAmount(fee), lifetimeFree: ltf, rewardsInfo: rewards || null, rewardRateBps: toBps(rewardRate), minDueBps: null }
          : null,
        loan: isLoan
          ? { loanKind, lender: lender || institution || null, principalAmount: tryParseAmount(principal), interestRateBps: toBps(rate), emiAmount: tryParseAmount(emi), tenureMonths: Number(tenure) || null, emiDay: day(emiDay), startDate: openedOn, emiAccountId: emiAccount || null }
          : null,
        opening: openingBal !== null && type !== 'debit_card' ? { balance: openingBal, on: openedOn } : existing ? null : { balance: 0n, on: openedOn },
      });
      if (institutionId) await repo.linkInstitution(sb, id, institutionId);
      toast.success(existing ? 'Account updated' : 'Account added', { description: name });
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save account');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      eyebrow={existing ? 'Edit account' : 'New account'}
      title={existing ? existing.nickname || existing.name : 'Add anything you own or owe'}
      width={640}
      footer={
        <div className="flex items-center justify-between gap-3">
          {sensitive ? <span className="text-xs text-coral">Remove full card numbers, CVV or OTP — Folio never stores them.</span> : <span className="text-xs text-mute">Only the last 4 digits are ever stored.</span>}
          <PopButton tone="mint" size="lg" onClick={onSubmit} disabled={!valid} loading={save.isPending}>
            {existing ? 'Save' : 'Add account'}
          </PopButton>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex justify-center rounded-3xl border border-line bg-[radial-gradient(ellipse_at_top,rgba(61,220,151,0.08),transparent_60%)] py-6">
          <FinanceCard account={preview as never} balance={previewBalance} available={isCredit && tryParseAmount(limit) ? tryParseAmount(limit)! - previewBalance : null} className="w-full max-w-[340px]" />
        </div>

        {!existing && (
          <div className="space-y-3">
            {TYPE_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 text-[11px] font-bold tracking-[0.14em] text-mute uppercase">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.types.map((ty) => (
                    <button
                      key={ty}
                      type="button"
                      onClick={() => {
                        setType(ty);
                        setLiquid(ACCOUNT_TYPE_META[ty].liquid);
                        if (!catalog) setTheme(groupOf({ type: ty }) === 'credit' ? CARD_THEME_PRESETS.obsidian! : groupOf({ type: ty }) === 'loan' ? CARD_THEME_PRESETS.slate! : CARD_THEME_PRESETS.mint!);
                      }}
                      className={cx('flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold', type === ty ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2 text-chalk-dim hover:text-chalk')}
                    >
                      <Icon name={ACCOUNT_TYPE_META[ty].icon} size={14} />
                      {ACCOUNT_TYPE_META[ty].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {isCredit && !existing && (
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Your card · fills issuer, network, fees and rewards</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {CARD_PRODUCTS.map((p) => (
                <button key={p.id} type="button" onClick={() => applyProduct(p)} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', productId === p.id ? 'border-mint bg-mint/10' : 'border-line bg-ink-2 hover:border-line-strong')}>
                  <span className="h-8 w-12 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${p.theme.colors.join(', ')})` }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="block truncate text-[11px] text-mute">{p.issuerName} · {p.network ? (p.network === 'rupay' ? 'RuPay' : p.network.toUpperCase()) : 'pick network'} · {p.lifetimeFree ? 'Lifetime free' : `₹${Number((p.annualFee ?? 0n) / 100n).toLocaleString('en-IN')}/yr`}</span>
                  </span>
                </button>
              ))}
            </div>
            {productId && CARD_PRODUCTS.find((p) => p.id === productId)?.networkNote && <p className="mt-2 text-xs text-gold">{CARD_PRODUCTS.find((p) => p.id === productId)!.networkNote}</p>}
          </div>
        )}

        <Field label={isLoan ? 'Lender' : 'Bank / issuer / provider'} hint="Pick from the list for matching colours, or type any name.">
          <InstitutionField
            value={institution}
            onPick={(n, cat) => {
              setInstitution(n);
              setCatalog(cat);
              if (cat && (!existing || !existing.theme)) setTheme(themeFromInstitution(cat, theme.pattern ?? 'lines'));
              if (cat && !name) setName(isCredit ? `${cat.short} Card` : cat.name);
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={isCredit ? 'SBI ELITE' : 'IDFC Savings'} maxLength={60} />
          </Field>
          <Field label="Nickname (optional)">
            <TextInput value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Daily spends" maxLength={40} />
          </Field>
        </div>

        {type === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Your type name">
              <TextInput value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="PPF, gold, chit fund…" />
            </Field>
            <Field label="Is it something you…">
              <Segmented
                value={customClass}
                onChange={setCustomClass}
                options={[
                  { value: 'asset', label: 'Own' },
                  { value: 'liability', label: 'Owe' },
                ]}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {(isCredit || type === 'debit_card' || group === 'bank' || type === 'wallet' || isLoan || group === 'deposit') && (
            <Field label={isLoan ? 'Loan a/c last 4' : 'Last 4 digits'} error={last4 && !/^\d{4}$/.test(last4) ? 'Exactly 4 digits' : null}>
              <TextInput value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4321" className="font-mono tracking-[0.3em]" />
            </Field>
          )}
          {type !== 'debit_card' && (
            <Field label={existing ? 'Correct opening balance' : isCredit ? 'Outstanding today' : isLoan ? 'Principal outstanding' : 'Current balance'} hint={existing ? 'Leave blank to keep it unchanged. Corrections are kept in history.' : 'Folio calculates everything from here on.'}>
              <AmountInput value={opening} onChange={setOpening} />
            </Field>
          )}
          <Field label={existing ? 'Opening date' : 'As of'}>
            <TextInput type="date" value={openedOn} max={t} onChange={(e) => setOpenedOn(e.target.value)} />
          </Field>
          {!isCredit && !isLoan && type !== 'debit_card' && type !== 'cash' && (
            <Field label="Interest rate % p.a. (optional)">
              <TextInput value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="3.5" />
            </Field>
          )}
        </div>

        {type === 'debit_card' && (
          <Field label="Spends from" hint="A debit card has no balance of its own — purchases reduce this bank account.">
            <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
              <option value="">Choose bank account…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nickname || b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {isCredit && (
          <div className="space-y-4 rounded-2xl border border-line bg-ink-2/40 p-4">
            <div className="text-sm font-bold">Card details</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Credit limit">
                <AmountInput value={limit} onChange={setLimit} />
              </Field>
              <Field label="Network">
                <Select value={network} onChange={(e) => setNetwork(e.target.value as CardNetwork)}>
                  <option value="">—</option>
                  {CARD_NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n === 'rupay' ? 'RuPay' : n === 'amex' ? 'American Express' : n.charAt(0).toUpperCase() + n.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Statement day" hint="Day of month the bill is generated">
                <TextInput value={stmtDay} onChange={(e) => setStmtDay(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="5" />
              </Field>
              <Field label="Due day">
                <TextInput value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="25" />
              </Field>
              <Field label="Card variant">
                <TextInput value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Elite, Regalia, Millennia…" />
              </Field>
              <Field label="Annual fee">
                <AmountInput value={fee} onChange={setFee} />
              </Field>
              <Field label="Reward rate % (optional)">
                <TextInput value={rewardRate} onChange={(e) => setRewardRate(e.target.value)} inputMode="decimal" placeholder="1.5" />
              </Field>
              <div className="pt-6">
                <Toggle checked={ltf} onChange={setLtf} label="Lifetime free" />
              </div>
            </div>
            <Field label="Rewards notes">
              <TextInput value={rewards} onChange={(e) => setRewards(e.target.value)} placeholder="5x on dining, lounge access…" />
            </Field>
          </div>
        )}

        {isLoan && (
          <div className="space-y-4 rounded-2xl border border-line bg-ink-2/40 p-4">
            <div className="text-sm font-bold">Loan details</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kind">
                <Select value={loanKind} onChange={(e) => setLoanKind(e.target.value as LoanKind)}>
                  {LOAN_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lender (if different)">
                <TextInput value={lender} onChange={(e) => setLender(e.target.value)} />
              </Field>
              <Field label="Loan amount (sanctioned)">
                <AmountInput value={principal} onChange={setPrincipal} />
              </Field>
              <Field label="Interest rate % p.a.">
                <TextInput value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="10.5" />
              </Field>
              <Field label="Tenure (months)">
                <TextInput value={tenure} onChange={(e) => setTenure(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="24" />
              </Field>
              <Field label="EMI" hint={suggestedEmi ? `Calculated: ${formatMoney(suggestedEmi)}` : undefined}>
                <AmountInput value={emi} onChange={setEmi} />
              </Field>
              <Field label="EMI day">
                <TextInput value={emiDay} onChange={(e) => setEmiDay(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="5" />
              </Field>
              <Field label="EMI paid from">
                <Select value={emiAccount} onChange={(e) => setEmiAccount(e.target.value)}>
                  <option value="">—</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nickname || b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {suggestedEmi && !emi && (
              <button type="button" onClick={() => setEmi(plain(suggestedEmi))} className="cursor-pointer text-xs font-bold text-mint hover:underline">
                Use calculated EMI {formatMoney(suggestedEmi)}
              </button>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 text-[11px] font-bold tracking-[0.14em] text-mute uppercase">Card artwork</div>
          <div className="flex flex-wrap gap-2">
            {catalog && (
              <button type="button" onClick={() => setTheme(themeFromInstitution(catalog, theme.pattern ?? 'lines'))} title="Brand colours" className={cx('h-12 w-20 cursor-pointer rounded-lg border-2 transition-transform hover:scale-105', theme.preset === `inst:${catalog.id}` ? 'border-mint' : 'border-transparent')} style={{ background: `linear-gradient(135deg, ${themeFromInstitution(catalog).colors.join(', ')})` }}>
                <span className="sr-only">Brand</span>
              </button>
            )}
            {Object.entries(CARD_THEME_PRESETS).map(([k, p]) => (
              <button key={k} type="button" onClick={() => setTheme(p)} title={p.label} className={cx('h-12 w-20 cursor-pointer rounded-lg border-2 transition-transform hover:scale-105', theme.preset === k ? 'border-mint' : 'border-transparent')} style={{ background: `linear-gradient(135deg, ${p.colors.join(', ')})` }}>
                <span className="sr-only">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented size="sm" value={theme.pattern ?? 'none'} onChange={(v) => setTheme({ ...theme, pattern: v === 'none' ? null : v })} options={['none', 'lines', 'waves', 'dots', 'grid', 'rings'].map((p) => ({ value: p, label: p }))} />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-mute">
              Custom colour
              <input type="color" value={theme.colors[0] ?? '#1a1a1a'} onChange={(e) => setTheme({ ...theme, preset: 'custom', colors: [e.target.value, theme.colors[1] ?? '#0b0b0b', theme.colors[2] ?? e.target.value] })} className="size-7 cursor-pointer rounded border-0 bg-transparent" />
            </label>
            <Segmented size="sm" value={theme.ink} onChange={(v) => setTheme({ ...theme, ink: v })} options={[{ value: 'light', label: 'Light ink' }, { value: 'dark', label: 'Dark ink' }]} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <input ref={artRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setArtFile(e.target.files?.[0] ?? null)} />
            <GhostButton icon="upload" onClick={() => artRef.current?.click()}>
              {artFile ? artFile.name : existing?.artworkPath ? 'Replace card photo' : isCredit || type === 'debit_card' ? 'Use my card photo' : 'Upload card image'}
            </GhostButton>
            {institution && (
              <>
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                <GhostButton icon="upload" onClick={() => logoRef.current?.click()}>
                  {logoFile ? logoFile.name : `Upload ${institution} logo`}
                </GhostButton>
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-faint">A photo of your card's front becomes the card face exactly as it is (front only, never the back with the CVV). Images are stored privately in your Folio database. A logo applies to every account from that bank.</p>
          {existing?.artworkPath && (
            <button type="button" className="mt-2 cursor-pointer text-xs font-bold text-mute hover:text-chalk" onClick={() => void patchArt.mutateAsync({ id: existing.id, patch: { artwork_path: null } }).then(() => toast('Back to Folio artwork'))}>
              Remove photo, use Folio artwork
            </button>
          )}
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line px-4">
          <Toggle checked={includeNW} onChange={setIncludeNW} label="Count towards net worth" description="Turn off for accounts you only want to track." />
          {!isCredit && !isLoan && type !== 'debit_card' && <Toggle checked={liquid} onChange={setLiquid} label="Spendable money" description="Included in available balance and after-bills figures." />}
        </div>

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Branch, IFSC, nominee — anything except full numbers or PINs" maxLength={500} />
        </Field>

        {existing && (
          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            {existing.status === 'active' ? (
              <PopButton
                tone="dark"
                icon="archive"
                onClick={async () => {
                  await setStatus.mutateAsync({ id: existing.id, status: 'archived' });
                  toast('Archived', { description: 'History is kept. Restore it any time from Accounts.' });
                  close();
                }}
              >
                Archive
              </PopButton>
            ) : (
              <PopButton tone="dark" icon="history" onClick={() => setStatus.mutate({ id: existing.id, status: 'active' })}>
                Restore
              </PopButton>
            )}
            {confirmDelete ? (
              <PopButton
                tone="coral"
                icon="trash"
                onClick={async () => {
                  try {
                    await del.mutateAsync(existing.id);
                    toast('Deleted');
                    close();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not delete');
                  }
                }}
              >
                Really delete
              </PopButton>
            ) : (
              <GhostButton icon="trash" onClick={() => setConfirmDelete(true)}>
                Delete
              </GhostButton>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export { ACCOUNT_TYPES };
