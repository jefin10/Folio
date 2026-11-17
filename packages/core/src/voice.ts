/**
 * Natural-language quick entry, shared by the phone (typed / dictated) and
 * mirrored in Kotlin on the watch (apps/wear/.../VoiceParser.kt).
 *
 *   "250 lunch"                          → ₹250, "Lunch"
 *   "spent 1.2k on groceries with sbi"    → ₹1,200, "Groceries", account ~ "sbi"
 *   "10000 household groceries on elite, parents owe 7000"
 *   "uber 340 paid by hdfc split with rahul 170"
 */
import { tryParseAmount, type Paise } from './money';

export interface ParsedQuickEntry {
  amount: Paise | null;
  description: string;
  accountHint: string | null;
  shares: { nameHint: string; amount: Paise | null }[];
  isIncome: boolean;
}

const AMOUNT_RE = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?\s*(?:k|l|lakh|lac|cr)?)\b/i;

export function parseQuickEntry(input: string, opts: { accountNames?: string[] } = {}): ParsedQuickEntry {
  let text = ` ${input.trim().replace(/\s+/g, ' ')} `;
  const isIncome = /\b(received|got|salary|earned|credited|income)\b/i.test(text);
  const shares: ParsedQuickEntry['shares'] = [];

  // "<name> owes 700", "split with <name> 170", "<name> owes half"
  const owesRe = /\b(?:and\s+)?([a-z][a-z ]{1,24}?)\s+(?:owes?|owe me|to pay back|will pay)\s+(?:me\s+)?(₹?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:k|l)?|half)/gi;
  text = text.replace(owesRe, (_m, name: string, amt: string) => {
    shares.push({ nameHint: name.trim(), amount: amt.toLowerCase() === 'half' ? null : tryParseAmount(amt) });
    return ' ';
  });
  const splitRe = /\bsplit(?:ting)?\s+with\s+([a-z][a-z ]{1,24}?)(?:\s+(₹?\s*\d[\d,]*(?:\.\d{1,2})?\s*k?))?(?=\s|$|,)/gi;
  text = text.replace(splitRe, (_m, name: string, amt?: string) => {
    shares.push({ nameHint: name.trim(), amount: amt ? tryParseAmount(amt) : null });
    return ' ';
  });

  // Strong cues always name the payment method; weak cues ("on", "with", "from")
  // only count when followed by card/account or when the phrase matches a known account.
  let accountHint: string | null = null;
  const known = (opts.accountNames ?? []).map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const looksLikeAccount = (phrase: string) => {
    const h = phrase.toLowerCase().replace(/[^a-z0-9]/g, '');
    return h.length > 1 && known.some((n) => n === h || n.includes(h) || h.includes(n));
  };
  const accRe = /\b(using|via|through|paid by|paid with|paid using|on|with|from)\s+(?:my\s+)?([a-z][a-z0-9 ]{1,20}?)\s*(card|account|a\/c|bank|wallet)?(?=\s*(?:,|$|\s(?:for|on|at)\s))/gi;
  for (const m of text.matchAll(accRe)) {
    const cue = m[1]!.toLowerCase();
    const phrase = m[2]!.trim();
    const strong = !['on', 'with', 'from'].includes(cue) || Boolean(m[3]);
    if (strong || looksLikeAccount(phrase)) {
      accountHint = phrase;
      text = text.replace(m[0], ' ');
      break;
    }
  }

  let amount: Paise | null = null;
  const amtMatch = AMOUNT_RE.exec(text);
  if (amtMatch) {
    amount = tryParseAmount(amtMatch[1]!.replace(/\s+/g, ''));
    text = text.replace(amtMatch[0], ' ');
  }

  // Half splits resolve once the amount is known.
  for (const s of shares) if (s.amount === null && amount !== null) s.amount = amount / 2n;

  const description = text
    .replace(/\b(spent|spend|paid|pay|bought|for|on|at|rupees|rs|received|got|i|me|my)\b/gi, ' ')
    .replace(/[,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const pretty = description ? description.charAt(0).toUpperCase() + description.slice(1) : '';
  return { amount, description: pretty, accountHint, shares, isIncome };
}

/** Fuzzy pick of an item by a spoken hint (account nickname, person name). */
export function matchByHint<T>(hint: string | null, items: T[], names: (t: T) => (string | null | undefined)[]): T | null {
  if (!hint) return null;
  const h = hint.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!h) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    for (const raw of names(item)) {
      if (!raw) continue;
      const n = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (n === h) score = 3;
      else if (n.startsWith(h) || h.startsWith(n)) score = 2;
      else if (n.includes(h) || h.includes(n)) score = 1;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return best;
}
