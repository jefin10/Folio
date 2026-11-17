/**
 * Calendar helpers. Financial dates are plain ISO local dates ("2026-11-17")
 * in the owner's timezone (Asia/Kolkata by default). All arithmetic happens on
 * UTC midnights so the host machine's timezone can never shift a date.
 */

export type ISODate = string; // YYYY-MM-DD

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): value is ISODate {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

function parts(date: ISODate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date "${date}"`);
  return [+m[1]!, +m[2]!, +m[3]!];
}

function fromUTC(d: Date): ISODate {
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return fromUTC(new Date(Date.UTC(year, month - 1, day)));
}

/** Fixed offsets (minutes) used when the runtime's Intl lacks time-zone data (some Hermes builds). */
const FIXED_OFFSETS: Record<string, number> = { 'Asia/Kolkata': 330, 'Asia/Calcutta': 330, UTC: 0, 'Etc/UTC': 0, 'Asia/Dubai': 240, 'Asia/Singapore': 480 };

/** Today's date in the given IANA timezone. */
export function today(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (isISODate(iso)) return iso;
  } catch {
    // fall through to the fixed-offset table
  }
  const offset = FIXED_OFFSETS[timeZone] ?? 0;
  return fromUTC(new Date(now.getTime() + offset * 60_000));
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = parts(date);
  return fromUTC(new Date(Date.UTC(y, m - 1, d + days)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add months, clamping to month end and honouring a preferred day so that a
 * rule anchored on the 31st lands on 28/29 Feb and returns to the 31st in March.
 */
export function addMonths(date: ISODate, months: number, preferredDay?: number): ISODate {
  const [y, m, d] = parts(date);
  const day = preferredDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function addYears(date: ISODate, years: number, preferredDay?: number): ISODate {
  return addMonths(date, years * 12, preferredDay);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function startOfMonth(date: ISODate): ISODate {
  const [y, m] = parts(date);
  return makeDate(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const [y, m] = parts(date);
  return makeDate(y, m, daysInMonth(y, m));
}

export function startOfYear(date: ISODate): ISODate {
  return makeDate(parts(date)[0], 1, 1);
}

/** Indian financial year (1 April – 31 March) containing the date. */
export function financialYear(date: ISODate): { start: ISODate; end: ISODate; label: string } {
  const [y, m] = parts(date);
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: makeDate(startYear, 4, 1),
    end: makeDate(startYear + 1, 3, 31),
    label: `FY${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`,
  };
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function dayOfMonth(date: ISODate): number {
  return parts(date)[2];
}

export function dayOfWeek(date: ISODate): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Enumerate month keys from `from` to `to` inclusive. */
export function monthRange(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor <= last) {
    out.push(monthKey(cursor));
    cursor = addMonths(cursor, 1, 1);
  }
  return out;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** DD/MM/YYYY */
export function formatDate(date: ISODate): string {
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** "17 Nov" or "17 Nov 2025" when not in the reference year. */
export function formatShortDate(date: ISODate, reference?: ISODate): string {
  const [y, m, d] = parts(date);
  const refYear = reference ? parts(reference)[0] : y;
  return `${d} ${MONTHS_SHORT[m - 1]}${y !== refYear ? ` ${y}` : ''}`;
}

export function formatMonth(key: string, withYear = true): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return withYear ? `${MONTHS_SHORT[m - 1]} ${y}` : MONTHS_SHORT[m - 1]!;
}

export function weekdayShort(date: ISODate): string {
  return WEEKDAYS_SHORT[dayOfWeek(date)]!;
}

/** Human relative label used across the UI: Today, Tomorrow, In 3 days, 2 days ago. */
export function relativeDay(date: ISODate, reference: ISODate): string {
  const diff = daysBetween(reference, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatShortDate(date, reference);
}

/** Parse DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and "17 Nov 2026" into ISO. */
export function parseFlexibleDate(input: string): ISODate | null {
  const s = input.trim();
  if (isISODate(s)) return s;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    let y = +m[3]!;
    if (y < 100) y += 2000;
    const iso = makeDate(y, +m[2]!, +m[1]!);
    return isISODate(iso) && +iso.slice(8) === +m[1]! ? iso : null;
  }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{2,4})$/.exec(s);
  if (m) {
    const idx = MONTHS_SHORT.findIndex((mm) => mm.toLowerCase() === m![2]!.slice(0, 3).toLowerCase());
    if (idx < 0) return null;
    let y = +m[3]!;
    if (y < 100) y += 2000;
    return makeDate(y, idx + 1, +m[1]!);
  }
  return null;
}

/** Period presets used by analytics and dashboard widgets. */
export type PeriodPreset = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'financial_year' | 'last_12_months' | 'all_time';

export function periodRange(preset: PeriodPreset, reference: ISODate): { from: ISODate; to: ISODate; label: string } {
  switch (preset) {
    case 'this_month':
      return { from: startOfMonth(reference), to: endOfMonth(reference), label: 'This month' };
    case 'last_month': {
      const prev = addMonths(startOfMonth(reference), -1, 1);
      return { from: prev, to: endOfMonth(prev), label: 'Last month' };
    }
    case 'last_3_months':
      return { from: addMonths(startOfMonth(reference), -2, 1), to: endOfMonth(reference), label: 'Last 3 months' };
    case 'last_6_months':
      return { from: addMonths(startOfMonth(reference), -5, 1), to: endOfMonth(reference), label: 'Last 6 months' };
    case 'last_12_months':
      return { from: addMonths(startOfMonth(reference), -11, 1), to: endOfMonth(reference), label: 'Last 12 months' };
    case 'this_year':
      return { from: startOfYear(reference), to: makeDate(+reference.slice(0, 4), 12, 31), label: 'This year' };
    case 'financial_year': {
      const fy = financialYear(reference);
      return { from: fy.start, to: fy.end, label: fy.label };
    }
    case 'all_time':
      return { from: '1970-01-01', to: '2999-12-31', label: 'All time' };
  }
}
