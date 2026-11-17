/**
 * Local reminders, scheduled on-device (no push server):
 *  - every due date (EMIs, subscriptions, bills, card payments)
 *  - every end date (last EMI, subscription ending)
 *  - every credit-card statement (bill generation) date
 * All fire LEAD_DAYS before the date at 9 AM IST. Each one is keyed by what
 * it is about plus the date, so rescheduling never duplicates.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, addMonths, cardCycle, formatDate, formatMoney, groupOf, type Account, type DueItem, type ISODate, type RecurringRule } from '@folio/core';

/** Days of warning before every date. */
export const LEAD_DAYS = 2;
const AT = '09:00';
/** How far ahead card statements/dues are scheduled. */
const CARD_HORIZON_DAYS = 70;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('folio-reminders', {
      name: 'Due dates & bills',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#3ddc97',
      vibrationPattern: [0, 120, 80, 120],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** 9 AM IST on (date − LEAD_DAYS), independent of the phone's zone setting. */
function fireAt(date: ISODate): Date {
  const d = addDays(date, -LEAD_DAYS);
  const [h, m] = AT.split(':').map(Number);
  return new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), h! - 5, m! - 30));
}

interface Planned {
  date: Date;
  title: string;
  body: string;
  data: Record<string, string>;
}

/** What should be scheduled right now. Pure apart from the clock; exported for checking. */
export function planReminders(input: { items: DueItem[]; rules: RecurringRule[]; accounts: Account[]; today: ISODate; hideAmounts: boolean; now?: number }): Map<string, Planned> {
  const { items, rules, accounts, today, hideAmounts } = input;
  const now = input.now ?? Date.now();
  const money = (v: bigint | null | undefined) => (v && !hideAmounts ? ` · ${formatMoney(v, { decimals: 0 })}` : '');
  const out = new Map<string, Planned>();
  const add = (key: string, date: ISODate, p: Omit<Planned, 'date'>) => {
    const when = fireAt(date);
    if (when.getTime() > now) out.set(key, { ...p, date: when });
  };
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  // 1. Due dates of every recurring obligation.
  for (const item of items) {
    if (item.state === 'paid' || item.state === 'skipped') continue;
    const rule = ruleById.get(item.ruleId);
    if (!rule || !rule.isActive) continue;
    const income = item.kind === 'income';
    add(`due:${item.key}`, item.dueOn, {
      title: income ? `${item.name} expected in ${LEAD_DAYS} days` : `${item.name} due in ${LEAD_DAYS} days`,
      body: `${income ? 'Expected' : 'Due'} ${formatDate(item.dueOn)}${money(item.amount)}${rule.bankAutopay && !income ? ' · auto-debit at your bank' : ''}`,
      data: { ruleId: item.ruleId, dueOn: item.dueOn, url: `/rule/${item.ruleId}` },
    });
  }

  // 2. End dates: last EMI, subscription ending.
  const loanWithRule = new Set<string>();
  for (const r of rules) {
    if (!r.isActive) continue;
    if (r.kind === 'emi' && r.targetAccountId) loanWithRule.add(r.targetAccountId);
    const end = r.endOn ?? (r.maxOccurrences && r.frequency === 'monthly' ? addMonths(r.startOn, r.maxOccurrences - 1, r.dayOfMonth ?? undefined) : null);
    if (!end || end < today) continue;
    const isLoan = r.kind === 'emi';
    add(`end:${r.id}:${end}`, end, {
      title: isLoan ? `${r.name}: last EMI in ${LEAD_DAYS} days` : `${r.name} ends in ${LEAD_DAYS} days`,
      body: isLoan ? `Final EMI on ${formatDate(end)}${money(r.amount)}` : `Ends ${formatDate(end)} · renew or cancel before then`,
      data: { ruleId: r.id, url: r.targetAccountId && isLoan ? `/loan/${r.targetAccountId}` : `/rule/${r.id}` },
    });
  }
  for (const a of accounts) {
    if (a.status !== 'active' || groupOf(a) !== 'loan' || loanWithRule.has(a.id)) continue;
    const l = a.loan;
    if (!l?.startDate || !l.tenureMonths) continue;
    const end = addMonths(l.startDate, l.tenureMonths - 1, l.emiDay ?? undefined);
    if (end < today) continue;
    add(`end:${a.id}:${end}`, end, {
      title: `${a.nickname || a.name}: last EMI in ${LEAD_DAYS} days`,
      body: `Final EMI on ${formatDate(end)}${money(l.emiAmount)}`,
      data: { url: `/loan/${a.id}` },
    });
  }

  // 3. Credit cards: statement (bill generation) and payment due dates.
  const horizon = addDays(today, CARD_HORIZON_DAYS);
  const cardRule = new Set(rules.filter((r) => r.isActive && r.targetAccountId).map((r) => r.targetAccountId!));
  for (const a of accounts) {
    if (a.status !== 'active' || (a.type !== 'credit_card' && a.type !== 'secured_credit_card') || !a.card?.statementDay) continue;
    const name = a.nickname || a.name;
    const { statementDay, dueDay } = a.card;
    const statements: ISODate[] = [];
    const dues: ISODate[] = [];
    let c = cardCycle(statementDay, dueDay, today);
    if (c.dueOn && c.dueOn >= today) dues.push(c.dueOn);
    for (let i = 0; i < 3 && c.nextStatementOn && c.nextStatementOn <= horizon; i++) {
      const s = c.nextStatementOn;
      statements.push(s);
      c = cardCycle(statementDay, dueDay, s);
      if (c.dueOn && c.dueOn <= horizon && !dues.includes(c.dueOn)) dues.push(c.dueOn);
      c = cardCycle(statementDay, dueDay, addDays(s, 1));
    }
    for (const s of statements)
      add(`stmt:${a.id}:${s}`, s, {
        title: `${name} bill generates in ${LEAD_DAYS} days`,
        body: `Statement on ${formatDate(s)} · spends after that go to the next bill`,
        data: { url: `/card/${a.id}` },
      });
    // A recurring rule for this card's payment already reminds about the due date.
    if (!cardRule.has(a.id))
      for (const d of dues)
        add(`cdue:${a.id}:${d}`, d, {
          title: `${name} payment due in ${LEAD_DAYS} days`,
          body: `Pay by ${formatDate(d)} to avoid interest and late fees`,
          data: { url: `/card/${a.id}` },
        });
  }
  return out;
}

/** Replace all scheduled reminders with the current set (idempotent). */
export async function syncReminders(input: { items: DueItem[]; rules: RecurringRule[]; accounts: Account[]; today: ISODate; hideAmounts: boolean }): Promise<number> {
  const wanted = planReminders(input);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = new Map(scheduled.map((n) => [n.identifier, n]));
  for (const n of scheduled) {
    const w = wanted.get(n.identifier);
    // Cancel anything stale, and anything whose text changed (amount edited, renamed…).
    if (!w || n.content.title !== w.title || n.content.body !== w.body) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      existing.delete(n.identifier);
    }
  }
  for (const [id, n] of wanted) {
    if (existing.has(id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: n.title, body: n.body, data: n.data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: 'folio-reminders' },
    });
  }
  return wanted.size;
}
