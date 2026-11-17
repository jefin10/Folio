/**
 * Money primitives.
 *
 * Every amount in Folio is an integer number of the currency's minor unit
 * (paise for INR) held in a `bigint`. Floating point is never used for money:
 * parsing goes string -> bigint, arithmetic is bigint, rounding is explicit.
 */

export type Paise = bigint;

export const ZERO: Paise = 0n;
export const PAISE_PER_RUPEE = 100n;

/** Hard ceiling (₹ 9 lakh crore) — anything bigger is almost surely a typo. */
export const MAX_AMOUNT: Paise = 90_000_000_000_000_00n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Convert a value coming from the database / network into paise.
 * Accepts bigint, safe integers, and integer strings ("12345", "-50").
 */
export function toPaise(value: unknown): Paise {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError(`Amount ${value} is not an exact integer number of paise`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  if (value === null || value === undefined) return ZERO;
  throw new MoneyError(`Cannot read ${JSON.stringify(value)} as paise`);
}

/** Serialise for JSON/RPC payloads. Strings keep 64-bit precision end to end. */
export function paiseToWire(p: Paise): string {
  return p.toString();
}

/**
 * Parse human input such as "₹1,23,456.7", "2500", "-40.05", "1.5k", "2L".
 * Returns paise or throws MoneyError. Never goes through floating point.
 */
export function parseAmount(input: string): Paise {
  let s = input.trim().replace(/[₹,\s_]/g, '').replace(/^rs\.?/i, '').replace(/^inr/i, '');
  if (s === '') throw new MoneyError('Enter an amount');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  let multiplier = 1n;
  const suffix = /([kKlLcC]|cr|Cr|CR|lakh|lac|crore)$/.exec(s);
  if (suffix) {
    const token = suffix[1]!.toLowerCase();
    multiplier = token === 'k' ? 1_000n : token === 'l' || token === 'lakh' || token === 'lac' ? 1_00_000n : 1_00_00_000n;
    s = s.slice(0, s.length - suffix[1]!.length);
  }
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) {
    throw new MoneyError(`"${input}" is not a valid amount`);
  }
  const whole = m[1] === '' ? 0n : BigInt(m[1]!);
  const fracRaw = m[2] ?? '';
  // Scale fraction to multiplier * 100 precision without floats.
  // value = (whole + frac/10^len) * multiplier * 100
  const len = BigInt(fracRaw.length);
  const fracInt = fracRaw === '' ? 0n : BigInt(fracRaw);
  const scale = 10n ** len;
  const numerator = (whole * scale + fracInt) * multiplier * PAISE_PER_RUPEE;
  if (numerator % scale !== 0n) {
    throw new MoneyError('Amounts can have at most two decimal places');
  }
  const paise = numerator / scale;
  if (paise > MAX_AMOUNT) throw new MoneyError('That amount is too large');
  return negative ? -paise : paise;
}

/** Same as parseAmount but returns null instead of throwing. */
export function tryParseAmount(input: string): Paise | null {
  try {
    return parseAmount(input);
  } catch {
    return null;
  }
}

export function abs(p: Paise): Paise {
  return p < 0n ? -p : p;
}

export function sum(values: Iterable<Paise>): Paise {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function min(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

export function max(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}

export function sign(p: Paise): -1 | 0 | 1 {
  return p > 0n ? 1 : p < 0n ? -1 : 0;
}

/**
 * Integer division with round-half-away-from-zero, the convention Indian
 * banks use when computing paise.
 */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  const neg = numerator < 0n !== denominator < 0n;
  const n = abs(numerator);
  const d = abs(denominator);
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** amount × basisPoints / 10_000, rounded. 1 bp = 0.01%. */
export function applyBps(amount: Paise, bps: bigint | number): Paise {
  return divRound(amount * BigInt(bps), 10_000n);
}

/** Ratio as basis points (e.g. utilisation). Returns 0 when whole is 0. */
export function ratioBps(part: Paise, whole: Paise): number {
  if (whole === 0n) return 0;
  return Number(divRound(part * 10_000n, whole));
}

/**
 * Split `total` across `weights` so the parts sum exactly to `total`
 * (largest-remainder method). Weights are bigints or integers.
 */
export function allocate(total: Paise, weights: readonly (bigint | number)[]): Paise[] {
  const w = weights.map((x) => BigInt(x));
  const weightSum = sum(w);
  if (w.length === 0) return [];
  if (weightSum === 0n) {
    // Even split.
    return allocate(total, w.map(() => 1n));
  }
  const negative = total < 0n;
  const t = abs(total);
  const parts = w.map((wi) => (t * wi) / weightSum);
  const remainders = w.map((wi, i) => ({ i, r: (t * wi) % weightSum }));
  let leftover = t - sum(parts);
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (leftover <= 0n) break;
    parts[i] = parts[i]! + 1n;
    leftover -= 1n;
  }
  return negative ? parts.map((p) => -p) : parts;
}

/** Split evenly across n people, distributing leftover paise to the first ones. */
export function splitEvenly(total: Paise, n: number): Paise[] {
  if (n <= 0) return [];
  return allocate(total, Array.from({ length: n }, () => 1n));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export interface FormatOptions {
  /** Currency symbol, default ₹. Pass '' for none. */
  symbol?: string;
  /** 'auto' hides .00 for whole rupees. */
  decimals?: 'auto' | 0 | 2;
  /** Prefix + for positive values. */
  showPlus?: boolean;
  /** Indian (1,23,456) or international (123,456) grouping. */
  grouping?: 'indian' | 'international';
  /** Replace digits with dots (privacy mode). */
  masked?: boolean;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

function groupInternational(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(p: Paise, opts: FormatOptions = {}): string {
  const symbol = opts.symbol ?? '₹';
  if (opts.masked) return `${symbol}••••`;
  const negative = p < 0n;
  const a = abs(p);
  const rupees = a / PAISE_PER_RUPEE;
  const paise = a % PAISE_PER_RUPEE;
  const grouped = (opts.grouping ?? 'indian') === 'indian' ? groupIndian(rupees.toString()) : groupInternational(rupees.toString());
  const decimals = opts.decimals ?? 'auto';
  let frac = '';
  if (decimals === 2 || (decimals === 'auto' && paise !== 0n)) {
    frac = `.${paise.toString().padStart(2, '0')}`;
  }
  const signStr = negative ? '−' : opts.showPlus && p > 0n ? '+' : '';
  return `${signStr}${symbol}${grouped}${frac}`;
}

/** Plain-ASCII variant (CSV exports, widgets that lack the minus glyph). */
export function formatMoneyPlain(p: Paise): string {
  const negative = p < 0n;
  const a = abs(p);
  return `${negative ? '-' : ''}${(a / 100n).toString()}.${(a % 100n).toString().padStart(2, '0')}`;
}

/**
 * Compact Indian notation: ₹950, ₹12.4K, ₹3.25L, ₹1.2Cr. Truncates (never
 * rounds up) so a compact figure never overstates a balance.
 */
export function formatCompact(p: Paise, symbol = '₹'): string {
  const negative = p < 0n;
  const rupees = abs(p) / PAISE_PER_RUPEE;
  const fmt = (value: bigint, unit: bigint, suffix: string, places: number) => {
    const scaled = (value * 10n ** BigInt(places)) / unit;
    const whole = scaled / 10n ** BigInt(places);
    let frac = (scaled % 10n ** BigInt(places)).toString().padStart(places, '0').replace(/0+$/, '');
    if (whole >= 100n) frac = '';
    return `${whole}${frac ? `.${frac}` : ''}${suffix}`;
  };
  let body: string;
  if (rupees >= 1_00_00_000n) body = fmt(rupees, 1_00_00_000n, 'Cr', 2);
  else if (rupees >= 1_00_000n) body = fmt(rupees, 1_00_000n, 'L', 2);
  else if (rupees >= 1_000n) body = fmt(rupees, 1_000n, 'K', 1);
  else body = rupees.toString();
  return `${negative ? '−' : ''}${symbol}${body}`;
}

/** Split into parts for typographic rendering: symbol, whole, fraction. */
export function moneyParts(p: Paise, opts: FormatOptions = {}): { sign: string; symbol: string; whole: string; fraction: string } {
  const full = formatMoney(p, { ...opts, decimals: 2 });
  const sign = full.startsWith('−') || full.startsWith('+') ? full[0]! : '';
  const rest = sign ? full.slice(1) : full;
  const symbol = opts.symbol ?? '₹';
  const body = rest.slice(symbol.length);
  const [whole = '0', fraction = '00'] = body.split('.');
  return { sign, symbol, whole, fraction };
}

/** For chart axes only — returns a JS number of rupees. Never use for arithmetic. */
export function toChartRupees(p: Paise): number {
  return Number(p / 100n) + Number(p % 100n) / 100;
}

export function formatBps(bps: number, places = 1): string {
  const pct = bps / 100;
  return `${pct.toFixed(places).replace(/\.0+$/, '')}%`;
}
