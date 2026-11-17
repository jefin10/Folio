import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, formatDate as fmtDate, parseFlexibleDate, ACCOUNT_TYPE_META, CARD_PRODUCTS, CARD_THEME_PRESETS, computeEmi, containsSensitiveCardData, findInstitution, formatMoney, groupOf, searchInstitutions, themeFromInstitution, today, tryParseAmount, type AccountType, type CardNetwork, type CardProduct, type CardTheme, type CatalogInstitution } from '@folio/core';
import { repo, useAccountStatus, useAccounts, useFolio, useRules, useSaveAccount, useSaveInstitution, useSaveRule } from '@folio/api';
import { FinanceCard } from '../src/components/cards';
import { AmountInput, Chip, CircleButton, Eyebrow, Field, Ghost, Icon, Input, InstitutionBadge, PopButton, Segmented } from '../src/components/ui';
import { success, warn } from '../src/lib/haptics';
import { C, F } from '../src/lib/theme';

const TYPES: AccountType[] = ['savings', 'salary', 'current', 'credit_card', 'debit_card', 'cash', 'wallet', 'fixed_deposit', 'recurring_deposit', 'stocks', 'mutual_funds', 'vehicle_loan', 'personal_loan', 'education_loan', 'home_loan', 'bnpl', 'other_asset', 'other_liability'];
const NETWORKS: CardNetwork[] = ['visa', 'mastercard', 'rupay', 'amex', 'diners'];
const plain = (p: bigint | null | undefined) => (p == null ? '' : formatMoney(p, { symbol: '', decimals: 'auto' }).replace(/,/g, ''));
const day = (s: string) => (Number(s) >= 1 && Number(s) <= 31 ? Number(s) : null);
const bps = (s: string) => {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
};

export default function AccountEdit() {
  const params = useLocalSearchParams<{ id?: string; type?: string; linkTo?: string }>();
  const insets = useSafeAreaInsets();
  const { sb } = useFolio();
  const accounts = useAccounts().data ?? [];
  const existing = params.id ? accounts.find((a) => a.id === params.id) ?? null : null;
  const save = useSaveAccount();
  const saveInst = useSaveInstitution();
  const setStatus = useAccountStatus();

  const [type, setType] = useState<AccountType>((params.type as AccountType) ?? 'savings');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [institution, setInstitution] = useState('');
  const [catalog, setCatalog] = useState<CatalogInstitution | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [last4, setLast4] = useState('');
  const [opening, setOpening] = useState('');
  const [theme, setTheme] = useState<CardTheme>(CARD_THEME_PRESETS.mint!);
  const [limit, setLimit] = useState('');
  const [stmtDay, setStmtDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [network, setNetwork] = useState<CardNetwork | null>(null);
  const [linked, setLinked] = useState<string | null>(params.linkTo ?? null);
  const [rate, setRate] = useState('');
  const [emi, setEmi] = useState('');
  const [tenure, setTenure] = useState('');
  const [firstEmi, setFirstEmi] = useState('');
  const [lastEmi, setLastEmi] = useState('');
  const [emiFrom, setEmiFrom] = useState<string | null>(null);
  const rules = useRules().data ?? [];
  const saveRule = useSaveRule();
  const [principal, setPrincipal] = useState('');
  const [emiDay, setEmiDay] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [cardPhoto, setCardPhoto] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [annualFee, setAnnualFee] = useState<bigint | null>(null);
  const [ltf, setLtf] = useState(false);
  const [variant, setVariant] = useState<string | null>(null);
  const [rewardsInfo, setRewardsInfo] = useState<string | null>(null);
  const [rewardRateBps, setRewardRateBps] = useState<number | null>(null);

  const applyProduct = (p: CardProduct) => {
    setProductId(p.id);
    setType(p.type);
    setName(p.name);
    setInstitution(p.issuerName);
    setCatalog(findInstitution(p.issuerId));
    setNetwork(p.network);
    setTheme(p.theme);
    setAnnualFee(p.annualFee);
    setLtf(p.lifetimeFree);
    setVariant(p.variant);
    setRewardsInfo(p.rewardsInfo.slice(0, 300));
    setRewardRateBps(p.rewardRateBps);
  };

  const pickCardPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [86, 54], quality: 0.6 });
    if (!r.canceled && r.assets[0]) setCardPhoto(r.assets[0].uri);
  };
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setName(existing.name);
    setNickname(existing.nickname ?? '');
    setInstitution(existing.institutionName ?? '');
    setCatalog(findInstitution(existing.institutionName));
    setLast4(existing.last4 ?? '');
    if (existing.theme) setTheme(existing.theme);
    setLimit(plain(existing.card?.creditLimit));
    setStmtDay(existing.card?.statementDay?.toString() ?? '');
    setDueDay(existing.card?.dueDay?.toString() ?? '');
    setNetwork(existing.card?.network ?? null);
    setLinked(existing.linkedAccountId);
    setRate(existing.loan?.interestRateBps ? String(existing.loan.interestRateBps / 100) : '');
    setEmi(plain(existing.loan?.emiAmount));
    setTenure(existing.loan?.tenureMonths?.toString() ?? '');
    setPrincipal(plain(existing.loan?.principalAmount));
    setEmiDay(existing.loan?.emiDay?.toString() ?? '');
    const sd = existing.loan?.startDate;
    setFirstEmi(sd ? fmtDate(sd) : '');
    setLastEmi(sd && existing.loan?.tenureMonths ? fmtDate(addMonths(sd, existing.loan.tenureMonths - 1, existing.loan.emiDay ?? undefined)) : '');
    setEmiFrom(existing.loan?.emiAccountId ?? null);
  }, [existing]);

  const group = groupOf({ type });
  const isCredit = group === 'credit';
  const isLoan = group === 'loan';
  const results = useMemo(() => searchInstitutions(institution, 8), [institution]);
  const banks = accounts.filter((a) => (groupOf(a) === 'bank' || a.type === 'wallet') && a.status === 'active');
  const first = parseFlexibleDate(firstEmi);
  const last = parseFlexibleDate(lastEmi);
  const tenureFromDates = first && last && last >= first ? (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(last.slice(5, 7)) - Number(first.slice(5, 7))) + 1 : null;
  const suggested = useMemo(() => {
    const p = tryParseAmount(principal);
    const r = bps(rate);
    const n = tenureFromDates ?? Number(tenure);
    return p && r !== null && n ? computeEmi(p, r, n) : null;
  }, [principal, rate, tenure, tenureFromDates]);

  const preview = {
    ...(existing ?? { id: 'preview', currency: 'INR', color: null, icon: null, status: 'active' as const, sortOrder: 0, linkedAccountId: null, loan: null, openedOn: today(), institutionId: null, artworkPath: null, interestRateBps: null, customTypeLabel: null, notes: null, includeInNetWorth: true, isLiquid: true }),
    name: name || ACCOUNT_TYPE_META[type].label,
    nickname: nickname || null,
    type,
    class: ACCOUNT_TYPE_META[type].class,
    institutionName: institution || null,
    last4: /^\d{4}$/.test(last4) ? last4 : null,
    theme,
    card: isCredit ? { network, variant: null, creditLimit: tryParseAmount(limit), statementDay: null, dueDay: null, annualFee: null, lifetimeFree: false, rewardsInfo: null, rewardRateBps: null, minDueBps: null } : null,
  };

  const valid = name.trim().length > 0 && (type !== 'debit_card' || !!linked) && (last4 === '' || /^\d{4}$/.test(last4)) && !containsSensitiveCardData(`${name} ${nickname}`);

  const pickLogo = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setLogoUri(r.assets[0].uri);
  };

  const submit = async () => {
    setError(null);
    try {
      let institutionId: string | null = existing?.institutionId ?? null;
      if (institution.trim()) {
        let logoPath: string | undefined;
        if (logoUri) {
          const bytes = await (await fetch(logoUri)).arrayBuffer();
          logoPath = await repo.uploadFile(sb, 'logos', `${institution}.jpg`, bytes, 'image/jpeg');
        }
        institutionId = await saveInst.mutateAsync({ name: institution.trim(), color: catalog?.colors[0] ?? null, ...(logoPath ? { logoPath } : {}) });
      }
      let artworkPath: string | undefined;
      if (cardPhoto) {
        const bytes = await (await fetch(cardPhoto)).arrayBuffer();
        artworkPath = await repo.uploadFile(sb, 'artwork', `${name || 'card'}.jpg`, bytes, 'image/jpeg');
      }
      const open = tryParseAmount(opening);
      const principalAmt = tryParseAmount(principal);
      const id = await save.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        nickname: nickname.trim() || null,
        type,
        institutionName: institution.trim() || null,
        last4: last4 || null,
        theme,
        color: theme.colors[0] ?? null,
        icon: ACCOUNT_TYPE_META[type].icon,
        linkedAccountId: type === 'debit_card' ? linked : null,
        includeInNetWorth: existing?.includeInNetWorth ?? true,
        card: isCredit
          ? {
              network,
              creditLimit: tryParseAmount(limit),
              statementDay: day(stmtDay),
              dueDay: day(dueDay),
              lifetimeFree: productId ? ltf : existing?.card?.lifetimeFree ?? false,
              variant: productId ? variant : existing?.card?.variant ?? null,
              annualFee: productId ? annualFee : existing?.card?.annualFee ?? null,
              rewardsInfo: productId ? rewardsInfo : existing?.card?.rewardsInfo ?? null,
              rewardRateBps: productId ? rewardRateBps : existing?.card?.rewardRateBps ?? null,
            }
          : null,
        ...(artworkPath ? { artworkPath } : {}),
        loan: isLoan ? { loanKind: type === 'vehicle_loan' ? 'two_wheeler' : type === 'education_loan' ? 'education' : type === 'home_loan' ? 'home' : 'personal', lender: institution || null, principalAmount: principalAmt, interestRateBps: bps(rate), emiAmount: tryParseAmount(emi) ?? suggested, tenureMonths: tenureFromDates ?? (Number(tenure) || null), emiDay: first ? Number(first.slice(8)) : day(emiDay), startDate: first ?? existing?.loan?.startDate ?? today(), emiAccountId: emiFrom } : null,
        opening: open !== null && type !== 'debit_card' ? { balance: open, on: existing?.openedOn ?? today() } : existing ? null : { balance: isLoan && principalAmt ? principalAmt : 0n, on: today() },
      });
      if (institutionId) await repo.linkInstitution(sb, id, institutionId);
      // A loan's EMI becomes a monthly obligation: due dates, end date, reminders, "mark paid".
      const emiAmt = tryParseAmount(emi) ?? suggested;
      if (isLoan && first && emiAmt) {
        const prev = rules.find((r) => r.kind === 'emi' && r.targetAccountId === id);
        await saveRule.mutateAsync({
          id: prev?.id,
          name: `${name.trim()} EMI`,
          kind: 'emi',
          amount: emiAmt,
          isVariable: false,
          frequency: 'monthly',
          intervalDays: null,
          startOn: first,
          endOn: last ?? null,
          maxOccurrences: null,
          dayOfMonth: Number(first.slice(8)),
          sourceAccountId: emiFrom,
          targetAccountId: id,
          categoryId: null,
          personId: null,
          reminderDaysBefore: prev?.reminderDaysBefore ?? 2,
          reminderTime: prev?.reminderTime ?? '09:00',
          isActive: true,
          bankAutopay: prev?.bankAutopay ?? true,
          notes: prev?.notes ?? null,
        });
      }
      success();
      router.back();
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.ink1 }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow>{existing ? 'Edit account' : 'New account'}</Eyebrow>
        <CircleButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <FinanceCard account={preview as never} balance={tryParseAmount(opening) ?? 0n} />
        </View>

        {!existing && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {TYPES.map((ty) => (
              <Chip key={ty} label={ACCOUNT_TYPE_META[ty].label} active={type === ty} onPress={() => setType(ty)} />
            ))}
          </ScrollView>
        )}

        {isCredit && !existing && (
          <Field label="Your card" hint="Fills issuer, network, fees and rewards. Then add your limit and last 4.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {CARD_PRODUCTS.map((p) => (
                <Pressable key={p.id} onPress={() => applyProduct(p)} style={{ width: 150, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: productId === p.id ? C.mint : C.line, backgroundColor: productId === p.id ? 'rgba(61,220,151,0.08)' : C.ink2, gap: 8 }}>
                  <LinearGradient colors={p.theme.colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 50, borderRadius: 8 }} />
                  <Text numberOfLines={1} style={{ color: C.chalk, fontFamily: F.bold, fontSize: 13 }}>{p.name}</Text>
                  <Text numberOfLines={1} style={{ color: C.mute, fontFamily: F.sans, fontSize: 11 }}>{p.network === 'rupay' ? 'RuPay' : p.network ? p.network.toUpperCase() : 'Pick network'} · {p.lifetimeFree ? 'Free' : `₹${Number((p.annualFee ?? 0n) / 100n)}/yr`}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {productId && CARD_PRODUCTS.find((p) => p.id === productId)?.networkNote ? <Text style={{ color: C.gold, fontFamily: F.semibold, fontSize: 12 }}>{CARD_PRODUCTS.find((p) => p.id === productId)!.networkNote}</Text> : null}
          </Field>
        )}

        <Field label={isLoan ? 'Lender' : 'Bank / issuer'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <InstitutionBadge name={institution || null} size={36} />
            <View style={{ flex: 1 }}>
              <Input value={institution} onFocus={() => setShowSearch(true)} onChangeText={(v) => { setInstitution(v); setCatalog(findInstitution(v)); setShowSearch(true); }} placeholder="Search 90+ banks or type your own" />
            </View>
          </View>
          {showSearch && results.length > 0 && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, padding: 4 }}>
              {results.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setInstitution(r.name);
                    setCatalog(r);
                    setShowSearch(false);
                    setTheme(themeFromInstitution(r, theme.pattern ?? 'lines'));
                    if (!name) setName(isCredit ? `${r.short} Card` : r.name);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}
                >
                  <InstitutionBadge name={r.name} size={28} />
                  <Text style={{ color: C.chalk, fontFamily: F.semibold, flex: 1 }}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {institution ? <Ghost label={logoUri ? 'Logo selected' : `Upload ${institution} logo`} icon="upload" onPress={pickLogo} /> : null}
        </Field>

        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder={isCredit ? 'SBI ELITE' : 'IDFC Savings'} maxLength={60} />
        </Field>
        <Field label="Nickname (optional)">
          <Input value={nickname} onChangeText={setNickname} maxLength={40} />
        </Field>
        {type !== 'cash' && (
          <Field label="Last 4 digits" error={last4 && !/^\d{4}$/.test(last4) ? 'Exactly 4 digits' : null} hint="Full numbers, CVV and PINs are never stored.">
            <Input value={last4} onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" style={{ fontFamily: F.mono, letterSpacing: 4 }} />
          </Field>
        )}
        {type !== 'debit_card' && (
          <Field label={existing ? 'Correct opening balance (blank = keep)' : isCredit ? 'Outstanding today' : isLoan ? 'Principal outstanding (blank = loan amount)' : 'Balance today'} hint={isLoan ? 'What you still owe today. Each EMI you mark paid reduces it.' : undefined}>
            <AmountInput value={opening} onChange={setOpening} />
          </Field>
        )}

        {type === 'debit_card' && (
          <Field label="Spends from">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {banks.map((b) => (
                <Chip key={b.id} label={b.nickname || b.name} active={linked === b.id} onPress={() => setLinked(b.id)} />
              ))}
            </View>
          </Field>
        )}

        {isCredit && (
          <>
            <Field label="Credit limit">
              <AmountInput value={limit} onChange={setLimit} />
            </Field>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Statement day">
                  <Input value={stmtDay} onChangeText={(v) => setStmtDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="5" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Due day">
                  <Input value={dueDay} onChangeText={(v) => setDueDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="25" />
                </Field>
              </View>
            </View>
            <Field label="Network">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {NETWORKS.map((n) => (
                  <Chip key={n} label={n === 'rupay' ? 'RuPay' : n.toUpperCase()} active={network === n} onPress={() => setNetwork(n)} />
                ))}
              </View>
            </Field>
          </>
        )}

        {isLoan && (
          <>
            <Field label="Loan amount">
              <AmountInput value={principal} onChange={setPrincipal} />
            </Field>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Rate % p.a.">
                  <Input value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="10.5" />
                </Field>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="First EMI">
                  <Input value={firstEmi} onChangeText={setFirstEmi} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Last EMI">
                  <Input value={lastEmi} onChangeText={setLastEmi} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />
                </Field>
              </View>
            </View>
            <Field label={suggested && !emi ? `EMI · calculated ${formatMoney(suggested, { decimals: 0 })}` : 'EMI'}>
              <AmountInput value={emi} onChange={setEmi} />
            </Field>
            <Field label="EMI paid from">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {banks.map((b) => (
                  <Chip key={b.id} label={b.nickname || b.name} active={emiFrom === b.id} onPress={() => setEmiFrom(b.id)} />
                ))}
              </View>
            </Field>
          </>
        )}

        {type !== 'cash' && (
          <Field label="Exact look" hint="Front only, never the back (CVV). Stored privately in your Folio database.">
            <PopButton tone="dark" size="sm" icon="upload" label={cardPhoto ? 'Photo selected' : existing?.artworkPath ? 'Replace my card photo' : 'Use my card photo'} onPress={pickCardPhoto} />
          </Field>
        )}

        <Field label="Card artwork">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {[...(catalog ? [['brand', { ...themeFromInstitution(catalog), label: 'Brand' }] as const] : []), ...Object.entries(CARD_THEME_PRESETS)].map(([k, p]) => (
              <Pressable key={k} onPress={() => setTheme(p)} style={{ borderRadius: 10, borderWidth: 2, borderColor: theme.preset === p.preset ? C.mint : 'transparent' }}>
                <LinearGradient colors={p.colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 70, height: 44, borderRadius: 8 }} />
              </Pressable>
            ))}
          </ScrollView>
          <Segmented value={theme.pattern ?? 'none'} onChange={(v) => setTheme({ ...theme, pattern: v === 'none' ? null : v })} options={['none', 'lines', 'waves', 'dots', 'rings'].map((p) => ({ value: p, label: p }))} />
        </Field>

        {error && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="alert" size={16} color={C.coral} />
            <Text style={{ color: C.coral, fontFamily: F.semibold, flex: 1 }}>{error}</Text>
          </View>
        )}

        {existing && (
          <Ghost
            label={existing.status === 'active' ? 'Archive account' : 'Restore account'}
            icon="archive"
            onPress={() =>
              Alert.alert(existing.status === 'active' ? 'Archive this account?' : 'Restore this account?', 'Its history is kept either way.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'OK', onPress: () => void setStatus.mutateAsync({ id: existing.id, status: existing.status === 'active' ? 'archived' : 'active' }).then(() => router.back()) },
              ])
            }
          />
        )}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 14, backgroundColor: C.ink1, borderTopWidth: 1, borderTopColor: C.line }}>
        <PopButton tone="mint" size="lg" label={existing ? 'Save' : 'Add account'} onPress={submit} disabled={!valid} loading={save.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}
