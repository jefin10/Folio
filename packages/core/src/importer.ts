/**
 * Statement import from CSV exported by netbanking / card portals.
 *
 * Banks disagree on everything, so the importer detects columns heuristically
 * (date, description, debit/credit or signed amount, Dr/Cr marker) and lets
 * the UI override the mapping. Output lines use the StatementLine convention:
 * positive = charge / money out, negative = credit / money in.
 *
 * PDF statements are stored as attachments; Folio does not claim to parse
 * arbitrary bank PDFs — the user records the totals and reconciles.
 */
import { parseFlexibleDate } from './dates';
import { parseAmount, tryParseAmount, type Paise } from './money';
import type { StatementLine } from './types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',' || ch === '\t' || ch === ';') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

export interface ColumnMapping {
  headerRow: number;
  date: number;
  description: number;
  amount?: number; // signed or with Dr/Cr marker
  debit?: number;
  credit?: number;
  drCr?: number;
}

const has = (h: string, ...keys: string[]) => keys.some((k) => h.includes(k));

export function detectMapping(rows: string[][]): ColumnMapping | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const header = rows[r]!.map((h) => h.toLowerCase());
    const date = header.findIndex((h) => has(h, 'date') && !has(h, 'value date'));
    const dateAlt = header.findIndex((h) => has(h, 'date'));
    const description = header.findIndex((h) => has(h, 'description', 'narration', 'particular', 'details', 'remarks', 'merchant', 'transaction'));
    const debit = header.findIndex((h) => has(h, 'debit', 'withdrawal', 'dr amount') && !has(h, 'card'));
    const credit = header.findIndex((h) => has(h, 'credit', 'deposit', 'cr amount') && !has(h, 'card'));
    const amount = header.findIndex((h) => has(h, 'amount', 'amt') && !has(h, 'balance'));
    const drCr = header.findIndex((h) => h === 'dr/cr' || h === 'cr/dr' || h === 'type' || h === 'dr / cr');
    const d = date >= 0 ? date : dateAlt;
    if (d >= 0 && description >= 0 && (amount >= 0 || debit >= 0 || credit >= 0)) {
      const mapping: ColumnMapping = { headerRow: r, date: d, description };
      if (debit >= 0 || credit >= 0) {
        if (debit >= 0) mapping.debit = debit;
        if (credit >= 0) mapping.credit = credit;
      } else mapping.amount = amount;
      if (drCr >= 0) mapping.drCr = drCr;
      return mapping;
    }
  }
  return null;
}

export interface ImportResult {
  lines: StatementLine[];
  skipped: { row: number; reason: string }[];
}

function amountOrZero(raw: string | undefined): Paise {
  if (!raw) return 0n;
  const cleaned = raw.replace(/\s*(dr|cr)\.?$/i, '').replace(/[()]/g, '');
  return tryParseAmount(cleaned) ?? 0n;
}

/**
 * `perspective` says how the source expresses amounts:
 *  - 'bank': debit column / Dr = money out of the account (charge)
 *  - 'card': positive amounts are purchases, Cr/negative are payments
 */
export function importStatementCsv(text: string, mapping?: ColumnMapping | null): ImportResult {
  const rows = parseCsv(text);
  const map = mapping ?? detectMapping(rows);
  if (!map) return { lines: [], skipped: [{ row: 0, reason: 'Could not find date / description / amount columns' }] };
  const lines: StatementLine[] = [];
  const skipped: ImportResult['skipped'] = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r]!;
    const date = parseFlexibleDate(row[map.date] ?? '');
    if (!date) {
      if (row.join('').trim()) skipped.push({ row: r + 1, reason: 'No valid date' });
      continue;
    }
    const description = (row[map.description] ?? '').replace(/\s+/g, ' ').trim() || 'Statement line';
    let amount: Paise;
    if (map.debit !== undefined || map.credit !== undefined) {
      const debit = amountOrZero(map.debit !== undefined ? row[map.debit] : undefined);
      const credit = amountOrZero(map.credit !== undefined ? row[map.credit] : undefined);
      amount = (debit < 0n ? -debit : debit) - (credit < 0n ? -credit : credit);
    } else {
      const raw = row[map.amount!] ?? '';
      let a: Paise;
      try {
        a = parseAmount(raw.replace(/\s*(dr|cr)\.?$/i, '').replace(/^\((.*)\)$/, '-$1'));
      } catch {
        skipped.push({ row: r + 1, reason: `Unreadable amount "${raw}"` });
        continue;
      }
      const marker = (map.drCr !== undefined ? row[map.drCr] : raw.match(/(dr|cr)\.?$/i)?.[1]) ?? '';
      if (/^cr/i.test(marker.trim())) a = -(a < 0n ? -a : a);
      else if (/^dr/i.test(marker.trim())) a = a < 0n ? -a : a;
      amount = a;
    }
    if (amount === 0n) {
      skipped.push({ row: r + 1, reason: 'Zero amount' });
      continue;
    }
    lines.push({ occurredOn: date, description, amount });
  }
  return { lines, skipped };
}
