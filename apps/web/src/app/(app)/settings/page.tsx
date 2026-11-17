'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { defaultDashboard, findInstitution, type Category } from '@folio/core';
import { forgetThisDevice, repo, signOutOtherDevices, useAudit, useCategories, useDashboardPrefs, useFolio, useInstitutions, useProfile, useSaveCategory, useSaveInstitution, useUpdateProfile } from '@folio/api';
import { InstitutionBadge } from '@/components/cards/InstitutionBadge';
import { Icon, ICON_CHOICES } from '@/components/ui/Icon';
import { deviceLockEnabled, deviceLockSupported, disableDeviceLock, enrollDeviceLock } from '@/lib/device-lock';
import { Badge, Field, GhostButton, Plate, PopButton, SectionTitle, Segmented, Select, Sheet, TextInput } from '@/components/ui/primitives';

const SWATCHES = ['#ff9f68', '#7bd88f', '#9ec1ff', '#6aa8ff', '#ffb86b', '#ff7ab6', '#f5d76e', '#c3a6ff', '#8be9fd', '#ff6b6b', '#a1e3d8', '#bd93f9', '#50e3c2', '#3ddc97', '#a3a3a3'];

function CategoryEditor({ cat, onClose }: { cat: Partial<Category> & { kind: Category['kind'] }; onClose: () => void }) {
  const save = useSaveCategory();
  const categories = useCategories().data ?? [];
  const [name, setName] = useState(cat.name ?? '');
  const [icon, setIcon] = useState(cat.icon ?? 'sparkle');
  const [color, setColor] = useState(cat.color ?? SWATCHES[0]!);
  const [parentId, setParentId] = useState(cat.parentId ?? '');
  return (
    <Sheet open onClose={onClose} eyebrow={cat.kind === 'income' ? 'Income category' : 'Expense category'} title={cat.id ? 'Edit category' : 'New category'} footer={
      <div className="flex justify-between">
        {cat.id && !cat.systemKey ? <GhostButton icon="archive" onClick={async () => { await save.mutateAsync({ ...(cat as Category), archived: !cat.archived }); onClose(); }}>{cat.archived ? 'Restore' : 'Archive'}</GhostButton> : <span />}
        <PopButton tone="mint" size="lg" disabled={!name.trim()} loading={save.isPending} onClick={async () => { try { await save.mutateAsync({ ...cat, name, icon, color, parentId: parentId || null }); onClose(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } }}>Save</PopButton>
      </div>
    }>
      <div className="space-y-5">
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus /></Field>
        <Field label="Inside (optional)"><Select value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">— top level —</option>{categories.filter((c) => c.kind === cat.kind && !c.parentId && c.id !== cat.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Colour"><div className="flex flex-wrap gap-2">{SWATCHES.map((s) => <button key={s} onClick={() => setColor(s)} className={`size-8 cursor-pointer rounded-full border-2 ${color === s ? 'border-chalk' : 'border-transparent'}`} style={{ background: s }} aria-label={s} />)}</div></Field>
        <Field label="Icon"><div className="flex flex-wrap gap-2">{ICON_CHOICES.map((i) => <button key={i} onClick={() => setIcon(i)} className={`grid size-10 cursor-pointer place-items-center rounded-xl border ${icon === i ? 'border-chalk bg-chalk text-ink' : 'border-line bg-ink-2'}`}><Icon name={i} size={18} /></button>)}</div></Field>
      </div>
    </Sheet>
  );
}

export default function SettingsPage() {
  const { sb } = useFolio();
  const profile = useProfile();
  const update = useUpdateProfile();
  const categories = useCategories().data ?? [];
  const institutions = useInstitutions().data ?? [];
  const saveInst = useSaveInstitution();
  const { save: saveDash } = useDashboardPrefs();
  const audit = useAudit();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Category['kind']>('expense');
  const [editing, setEditing] = useState<(Partial<Category> & { kind: Category['kind'] }) | null>(null);
  const [lock, setLock] = useState('60');
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  useEffect(() => {
    void deviceLockSupported().then(setBioSupported);
    setBioOn(deviceLockEnabled());
  }, []);
  const logoRef = useRef<HTMLInputElement>(null);
  const [logoFor, setLogoFor] = useState<string | null>(null);
  useEffect(() => {
    if (profile.data) {
      setName(profile.data.displayName ?? '');
      setLock(String(profile.data.lockTimeoutSeconds));
    }
  }, [profile.data]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl font-semibold">Settings</h1>

      <Plate className="space-y-5 p-6">
        <SectionTitle title="Profile & region" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Lock again after" hint="Biometric lock on the phone (and this browser, if enabled) when you come back">
            <Select value={lock} onChange={(e) => setLock(e.target.value)}>
              {[['0', 'Immediately'], ['30', '30 seconds'], ['60', '1 minute'], ['300', '5 minutes'], ['900', '15 minutes']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge>Currency ₹ INR</Badge><Badge>Indian numbering 1,00,000</Badge><Badge>{profile.data?.timezone ?? 'Asia/Kolkata'}</Badge><Badge>DD/MM/YYYY</Badge>
        </div>
        <PopButton tone="chalk" loading={update.isPending} onClick={async () => { await update.mutateAsync({ displayName: name || null, lockTimeoutSeconds: Number(lock) }); toast.success('Saved'); }}>Save</PopButton>
      </Plate>

      <Plate className="p-6">
        <SectionTitle title="Categories" action={<div className="flex gap-2"><Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /><PopButton size="sm" tone="mint" icon="plus" onClick={() => setEditing({ kind })}>Add</PopButton></div>} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.filter((c) => c.kind === kind).map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className={`flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-ink-2 px-3 py-2.5 text-left hover:border-line-strong ${c.archived ? 'opacity-40' : ''}`}>
              <span className="grid size-8 place-items-center rounded-lg" style={{ background: `${c.color ?? '#888'}22`, color: c.color ?? '#888' }}><Icon name={c.icon ?? 'sparkle'} size={16} /></span>
              <span className="flex-1 truncate text-sm font-semibold">{c.parentId ? '↳ ' : ''}{c.name}</span>
              {c.systemKey && <Badge>system</Badge>}
            </button>
          ))}
        </div>
      </Plate>

      <Plate className="p-6">
        <SectionTitle eyebrow="Logos you upload are stored privately" title="Banks & issuers" />
        {institutions.length === 0 ? <p className="text-sm text-mute">Institutions appear here as you add accounts. Upload a logo once and it shows on every card from that bank.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {institutions.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-xl border border-line bg-ink-2 px-3 py-2.5">
                <InstitutionBadge institutionId={i.id} name={i.name} color={i.color ?? findInstitution(i.name)?.colors[0]} size={34} rounded="md" />
                <span className="flex-1 truncate text-sm font-semibold">{i.name}</span>
                <GhostButton icon="upload" onClick={() => { setLogoFor(i.id); logoRef.current?.click(); }}>{i.logoPath ? 'Replace' : 'Logo'}</GhostButton>
                {i.logoPath && <GhostButton onClick={() => saveInst.mutate({ id: i.id, name: i.name, color: i.color, logoPath: null })}>Remove</GhostButton>}
              </li>
            ))}
          </ul>
        )}
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const inst = institutions.find((x) => x.id === logoFor);
          if (!f || !inst) return;
          const path = await repo.uploadFile(sb, 'logos', f.name, f, f.type || 'image/png');
          await saveInst.mutateAsync({ id: inst.id, name: inst.name, color: inst.color, logoPath: path });
          toast.success('Logo updated');
        }} />
      </Plate>

      <Plate className="space-y-4 p-6">
        <SectionTitle title="Dashboard" />
        <p className="text-sm text-mute">Customise widgets from the home screen. Reset brings back the default layout.</p>
        <PopButton tone="dark" icon="layout" onClick={async () => { await saveDash(defaultDashboard()); toast('Dashboard reset'); }}>Reset dashboard</PopButton>
      </Plate>

      <Plate className="space-y-3 p-6">
        <SectionTitle title="Security" />
        <ul className="space-y-2 text-sm text-chalk-dim">
          <li className="flex gap-2"><Icon name="shield" size={16} className="mt-0.5 text-mint" />Row-level security: every record is readable only by your account.</li>
          <li className="flex gap-2"><Icon name="lock" size={16} className="mt-0.5 text-mint" />Only the last 4 digits of cards are stored. Full numbers, CVV, PIN and OTP are refused by the database.</li>
          <li className="flex gap-2"><Icon name="history" size={16} className="mt-0.5 text-mint" />Every correction keeps the previous version; voided entries can be restored.</li>
          <li className="flex gap-2"><Icon name="info" size={16} className="mt-0.5 text-mint" />Folio never initiates payments. It records, reminds and lets you confirm.</li>
        </ul>
      </Plate>

      <Plate className="p-6">
        <SectionTitle eyebrow="Latest 100 changes" title="Audit trail" />
        <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
          {(audit.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2"><span className="font-mono text-xs text-mute">{new Date(a.at).toLocaleString('en-IN')}</span><span className="flex-1 truncate">{a.table.replace('_', ' ')}</span><Badge tone={a.action === 'delete' ? 'coral' : a.action === 'insert' ? 'mint' : 'neutral'}>{a.action}</Badge></li>
          ))}
        </ul>
      </Plate>

      <Plate className="space-y-4 p-6">
        <SectionTitle title="Devices" />
        <p className="text-sm text-mute">Each phone or browser asks for the passphrase once. Lost a device? Sign out everything except this one. Change the passphrase with <code className="font-mono text-xs">deploy/folio.sh passphrase</code>.</p>
        <div className="flex flex-wrap gap-3">
          <PopButton tone="dark" icon="shield" onClick={async () => { await signOutOtherDevices(sb); toast.success('Every other device is signed out'); }}>Sign out other devices</PopButton>
          {bioSupported && (bioOn ? (
            <PopButton tone="dark" icon="lock" onClick={() => { disableDeviceLock(); setBioOn(false); }}>Turn off biometric unlock here</PopButton>
          ) : (
            <PopButton tone="dark" icon="lock" onClick={async () => setBioOn(await enrollDeviceLock().catch(() => false))}>Use biometric unlock here</PopButton>
          ))}
          <PopButton tone="coral" icon="logout" onClick={() => void forgetThisDevice(sb)}>Forget this browser</PopButton>
        </div>
      </Plate>
      {editing && <CategoryEditor cat={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
