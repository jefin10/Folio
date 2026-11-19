import { describe, expect, it } from 'vitest';
import { fdMaturityValue, growStats, maturityDate, rdMaturityValue } from '../src/grow';
import { account } from './fixtures';

describe('deposit compounding', () => {
  it('leaves money alone at zero rate or tenure', () => {
    expect(fdMaturityValue(1_00_000_00n, 0, 12)).toBe(1_00_000_00n);
    expect(fdMaturityValue(1_00_000_00n, 750, 0)).toBe(1_00_000_00n);
  });

  it('compounds an FD quarterly like a bank would', () => {
    // ₹1,00,000 at 7% for 12 months = 4 quarters of 1.75%: 100000 × 1.071859… ≈ ₹1,07,186
    const v = fdMaturityValue(1_00_000_00n, 700, 12);
    expect(v).toBe(1_07_185_90n);
  });

  it('pays simple interest for the odd months after full quarters', () => {
    // 13 months at 7%: 4 quarters compounded (≈107185.90) then 1/3 of a quarter simple.
    const v = fdMaturityValue(1_00_000_00n, 700, 13);
    expect(v).toBeGreaterThan(fdMaturityValue(1_00_000_00n, 700, 12));
    // and less than 14 months (a full 5th quarter would overshoot).
    expect(v).toBeLessThan(fdMaturityValue(1_00_000_00n, 700, 15));
  });

  it('grows with rate, tenure and principal', () => {
    expect(fdMaturityValue(2_00_000_00n, 750, 24)).toBeGreaterThan(fdMaturityValue(1_00_000_00n, 750, 24));
    expect(fdMaturityValue(1_00_000_00n, 750, 24)).toBeGreaterThan(fdMaturityValue(1_00_000_00n, 700, 24));
    expect(fdMaturityValue(1_00_000_00n, 700, 36)).toBeGreaterThan(fdMaturityValue(1_00_000_00n, 700, 24));
  });

  it('values an RD as the sum of every installment stayed to date', () => {
    // ₹2,000 a month for 12 months at 7%: more than the ₹24,000 put in,
    // less than the same ₹24,000 sitting from day one. Reference value
    // computed independently: each installment compounds its full quarters
    // and earns simple interest for the odd month(s) left.
    const v = rdMaturityValue(2_000_00n, 700, 12);
    expect(v).toBeGreaterThan(24_000_00n);
    expect(v).toBeLessThan(fdMaturityValue(24_000_00n, 700, 12));
    expect(v).toBe(24_92_482n);
  });

  it('maturity date advances by the tenure', () => {
    expect(maturityDate('2026-11-17', 24)).toBe('2028-11-17');
    expect(maturityDate('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('grow stats', () => {
  it('reads an FD as invested principal with a maturity projection', () => {
    const a = account('fd', 'fixed_deposit', {
      grow: { principalAmount: 1_00_000_00n, interestRateBps: 750, startDate: '2026-11-17', tenureMonths: 12, compoundingPerYear: 4, investedAmount: null, sipAmount: null, sipFrequency: null },
    });
    const s = growStats(a, 1_00_000_00n);
    expect(s.invested).toBe(1_00_000_00n);
    expect(s.maturityOn).toBe('2027-11-17');
    expect(s.maturityValue).toBeGreaterThan(1_00_000_00n);
    expect(s.interestTotal).toBe(s.maturityValue! - 1_00_000_00n);
  });

  it('reads an RD by its installments paid so far', () => {
    const a = account('rd', 'recurring_deposit', {
      grow: { principalAmount: 2_000_00n, interestRateBps: 700, startDate: '2026-06-01', tenureMonths: 12, compoundingPerYear: 4, investedAmount: null, sipAmount: null, sipFrequency: null },
    });
    const s = growStats(a, 12_000_00n); // 6 installments recorded
    expect(s.invested).toBe(12_000_00n);
    expect(s.value).toBe(12_000_00n);
    expect(s.maturityOn).toBe('2027-06-01');
    expect(s.maturityValue).toBe(rdMaturityValue(2_000_00n, 700, 12));
  });

  it('reads a market account as invested vs current value', () => {
    const a = account('mf', 'mutual_funds', {
      grow: { principalAmount: null, interestRateBps: null, startDate: null, tenureMonths: null, compoundingPerYear: 4, investedAmount: 50_000_00n, sipAmount: 2_000_00n, sipFrequency: 'monthly' },
    });
    const s = growStats(a, 52_470_00n);
    expect(s.invested).toBe(50_000_00n);
    expect(s.gain).toBe(2_470_00n);
    expect(s.gainBps).toBe(494); // 4.94%
    expect(s.maturityOn).toBeNull();
  });

  it('falls back to the balance when invested is unknown', () => {
    const a = account('st', 'stocks', { grow: null });
    const s = growStats(a, 9_000_00n);
    expect(s.invested).toBe(9_000_00n);
    expect(s.gain).toBe(0n);
  });
});
