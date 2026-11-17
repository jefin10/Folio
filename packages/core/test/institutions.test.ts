import { describe, expect, it } from 'vitest';
import { findInstitution, inkOn, INSTITUTIONS, searchInstitutions, themeFromInstitution } from '../src/institutions';

describe('institution catalog', () => {
  it('has unique ids and valid colours', () => {
    expect(new Set(INSTITUTIONS.map((i) => i.id)).size).toBe(INSTITUTIONS.length);
    for (const i of INSTITUTIONS) for (const c of i.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('searches by name, monogram and alias', () => {
    expect(searchInstitutions('idfc')[0]!.id).toBe('idfc');
    expect(searchInstitutions('state bank')[0]!.id).toBe('sbi');
    expect(searchInstitutions('811')[0]!.id).toBe('kotak');
    expect(findInstitution('HDFC Bank')!.short).toBe('HDFC');
    expect(findInstitution('nope')).toBeNull();
  });
  it('derives a readable card theme', () => {
    const t = themeFromInstitution(findInstitution('sbi')!);
    expect(t.colors).toHaveLength(3);
    expect(t.ink).toBe('light');
    expect(inkOn('#ffd400')).toBe('#111111');
  });
});
