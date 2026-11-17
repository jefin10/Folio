import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, financialYear, formatDate, parseFlexibleDate, periodRange, relativeDay, today } from '../src/dates';
import { allocate, applyBps, divRound, formatCompact, formatMoney, parseAmount, ratioBps, splitEvenly, toPaise, tryParseAmount } from '../src/money';

describe('money parsing — never via floating point', () => {
  it('parses Indian and plain formats exactly', () => {
    expect(parseAmount('₹1,23,456.78')).toBe(12_345_678n);
    expect(parseAmount('2500')).toBe(250_000n);
    expect(parseAmount('0.1')).toBe(10n);
    expect(parseAmount('0.07')).toBe(7n);
    expect(parseAmount('-40.05')).toBe(-4_005n);
    expect(parseAmount('Rs. 99')).toBe(9_900n);
    expect(parseAmount('1.5k')).toBe(150_000n);
    expect(parseAmount('2L')).toBe(2_00_000_00n);
    expect(parseAmount('1.25cr')).toBe(1_25_00_000_00n);
  });

  it('0.1 + 0.2 is exactly 0.3', () => {
    expect(parseAmount('0.1') + parseAmount('0.2')).toBe(parseAmount('0.3'));
  });

  it('rejects junk and sub-paisa precision', () => {
    expect(tryParseAmount('abc')).toBeNull();
    expect(tryParseAmount('1.234')).toBeNull();
    expect(tryParseAmount('')).toBeNull();
    expect(tryParseAmount('.')).toBeNull();
  });

  it('reads DB values and refuses unsafe numbers', () => {
    expect(toPaise('9007199254740993')).toBe(9_007_199_254_740_993n);
    expect(toPaise(12345)).toBe(12_345n);
    expect(() => toPaise(1.5)).toThrow();
    expect(() => toPaise(2 ** 60)).toThrow();
  });
});

describe('money formatting', () => {
  it('uses Indian grouping', () => {
    expect(formatMoney(12_345_678_90n)).toBe('₹1,23,45,678.90');
    expect(formatMoney(100_000_00n)).toBe('₹1,00,000');
    expect(formatMoney(999n)).toBe('₹9.99');
    expect(formatMoney(-5_000_00n)).toBe('−₹5,000');
    expect(formatMoney(5_000_00n, { decimals: 2 })).toBe('₹5,000.00');
    expect(formatMoney(5_000_00n, { showPlus: true })).toBe('+₹5,000');
    expect(formatMoney(5_000_00n, { masked: true })).toBe('₹••••');
  });

  it('compact notation never rounds up', () => {
    expect(formatCompact(1_29_999_00n)).toBe('₹1.29L');
    expect(formatCompact(2_50_00_000_00n)).toBe('₹2.5Cr');
    expect(formatCompact(12_499_00n)).toBe('₹12.4K');
    expect(formatCompact(950_00n)).toBe('₹950');
  });
});

describe('integer maths', () => {
  it('divRound rounds half away from zero', () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });

  it('allocate always sums to the total', () => {
    const parts = allocate(100_00n, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100_00n);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
    expect(splitEvenly(1n, 3)).toEqual([1n, 0n, 0n]);
    expect(allocate(-10n, [1, 1]).reduce((a, b) => a + b, 0n)).toBe(-10n);
  });

  it('bps helpers', () => {
    expect(applyBps(10_000_00n, 250)).toBe(25_000n);
    expect(ratioBps(45_000_00n, 1_00_000_00n)).toBe(4500);
    expect(ratioBps(1n, 0n)).toBe(0);
  });
});

describe('dates', () => {
  it('clamps month arithmetic and remembers the preferred day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('formats DD/MM/YYYY and parses common bank formats', () => {
    expect(formatDate('2026-11-07')).toBe('07/11/2026');
    expect(parseFlexibleDate('07/11/2026')).toBe('2026-11-07');
    expect(parseFlexibleDate('7-11-26')).toBe('2026-11-07');
    expect(parseFlexibleDate('07 Nov 2026')).toBe('2026-11-07');
    expect(parseFlexibleDate('31/02/2026')).toBeNull();
  });

  it('today in Asia/Kolkata differs from UTC near midnight', () => {
    expect(today('Asia/Kolkata', new Date('2026-11-16T19:00:00Z'))).toBe('2026-11-17');
    expect(today('UTC', new Date('2026-11-16T19:00:00Z'))).toBe('2026-11-16');
  });

  it('financial year and periods', () => {
    expect(financialYear('2026-03-31').label).toBe('FY25-26');
    expect(financialYear('2026-04-01').label).toBe('FY26-27');
    expect(periodRange('last_month', '2026-01-10')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(daysBetween('2026-11-17', '2026-12-01')).toBe(14);
    expect(relativeDay('2026-11-18', '2026-11-17')).toBe('Tomorrow');
  });
});
