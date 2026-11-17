import { describe, expect, it } from 'vitest';
import { CARD_PRODUCTS } from '../src/card-products';
import { findInstitution, INSTITUTIONS } from '../src/institutions';

describe('card presets', () => {
  it('every preset points at a catalog issuer and has valid artwork colours', () => {
    const ids = new Set(INSTITUTIONS.map((i) => i.id));
    for (const p of CARD_PRODUCTS) {
      expect(ids.has(p.issuerId)).toBe(true);
      for (const c of p.theme.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      if (p.lifetimeFree) expect(p.annualFee).toBeNull();
    }
    expect(CARD_PRODUCTS.map((p) => p.id)).toEqual(['sbi-elite', 'idfc-quantum-plus', 'kiwi-yes-rupay', 'slice-upi', 'unity-roarbank']);
    expect(findInstitution('roarbank')!.id).toBe('unity');
  });
});
