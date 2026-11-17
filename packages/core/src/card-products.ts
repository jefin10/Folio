/**
 * Ready-made card presets: the factual product details (issuer, network,
 * fees, rewards) so adding a card is "pick it, type your limit".
 *
 * Details were gathered from issuer pages and comparison sites in Nov 2026;
 * where sources disagreed it says so. Card terms change — check your card's
 * MITC. Artwork here is Folio's own colour treatment in the card's tones; for
 * the exact look, upload a photo of your own card's front in the app.
 */
import type { Paise } from './money';
import type { AccountType, CardNetwork, CardTheme } from './types';

export interface CardProduct {
  id: string;
  name: string;
  /** Institution catalog id (see institutions.ts). */
  issuerId: string;
  issuerName: string;
  type: Extract<AccountType, 'credit_card' | 'secured_credit_card'>;
  /** null when the product ships on more than one network: the user picks. */
  network: CardNetwork | null;
  networkNote?: string;
  variant: string;
  annualFee: Paise | null;
  lifetimeFree: boolean;
  /** Approximate base reward value, in basis points of spend. */
  rewardRateBps: number | null;
  rewardsInfo: string;
  theme: CardTheme;
  upi: boolean;
}

export const CARD_PRODUCTS: CardProduct[] = [
  {
    id: 'sbi-elite',
    name: 'SBI ELITE',
    issuerId: 'sbicard',
    issuerName: 'SBI Card',
    type: 'credit_card',
    network: null,
    networkNote: 'Issued on Visa, Mastercard or Amex depending on variant — pick yours.',
    variant: 'ELITE',
    annualFee: 4_999_00n,
    lifetimeFree: false,
    rewardRateBps: 50,
    rewardsInfo: '5X points on dining, departmental stores and groceries; 2 points per ₹100 elsewhere (no points on fuel). 4 points = ₹1. Annual fee ₹4,999 + GST, reversed on ₹10L yearly spend. Milestone bonuses at ₹3L/4L/5L/8L. 1.99% forex mark-up.',
    theme: { preset: 'card:sbi-elite', colors: ['#2a2723', '#0d0c0b', '#5a4a2c'], ink: 'light', pattern: 'lines' },
    upi: false,
  },
  {
    id: 'idfc-quantum-plus',
    name: 'IDFC FIRST Quantum+',
    issuerId: 'idfc',
    issuerName: 'IDFC FIRST Bank',
    type: 'secured_credit_card',
    network: 'rupay',
    networkNote: 'UPI-linked, so RuPay — confirm in the IDFC FIRST app.',
    variant: 'Quantum+',
    annualFee: null,
    lifetimeFree: true,
    rewardRateBps: 100,
    rewardsInfo: 'FD-backed: limit equals the fixed deposit. Lifetime free. Cashback up to 2% (1% on UPI Scan & Pay via the IDFC FIRST app; tiers vary by spend). Check the current MITC for forex and redemption fees.',
    theme: { preset: 'card:idfc-quantum-plus', colors: ['#5c1219', '#1f0709', '#9c1d26'], ink: 'light', pattern: 'waves' },
    upi: true,
  },
  {
    id: 'kiwi-yes-rupay',
    name: 'Kiwi YES BANK RuPay',
    issuerId: 'kiwi',
    issuerName: 'Kiwi · YES BANK',
    type: 'credit_card',
    network: 'rupay',
    variant: 'Kiwi',
    annualFee: null,
    lifetimeFree: true,
    rewardRateBps: 150,
    rewardsInfo: 'Lifetime free RuPay card for UPI (virtual with the YES BANK issue). About 1.5% back on UPI Scan & Pay; optional Neon membership (₹999/yr) raises UPI cashback up to 5%. 1% fuel surcharge waiver; ~2.75% forex mark-up.',
    theme: { preset: 'card:kiwi-yes-rupay', colors: ['#16331f', '#09140c', '#2fbf71'], ink: 'light', pattern: 'dots' },
    upi: true,
  },
  {
    id: 'slice-upi',
    name: 'slice UPI credit card',
    issuerId: 'slice_sfb',
    issuerName: 'slice Small Finance Bank',
    type: 'credit_card',
    network: 'rupay',
    variant: 'slice',
    annualFee: null,
    lifetimeFree: true,
    rewardRateBps: 200,
    rewardsInfo: 'Lifetime free RuPay card on UPI. Around 2% back (up to 3% with slice offers) as slice monies. Reported no forex mark-up; finance charges ~3.5% a month.',
    theme: { preset: 'card:slice-upi', colors: ['#2c1866', '#0f0826', '#6c3ce0'], ink: 'light', pattern: 'rings' },
    upi: true,
  },
  {
    id: 'unity-roarbank',
    name: 'Roarbank credit card',
    issuerId: 'unity',
    issuerName: 'Unity Small Finance Bank',
    type: 'credit_card',
    network: 'rupay',
    variant: 'Roarbank',
    annualFee: null,
    lifetimeFree: true,
    rewardRateBps: null,
    rewardsInfo: 'Lifetime free RuPay card on UPI, linked to a Roarbank savings account (uses balance first, then credit). Up to 20% cashback on two chosen categories each month, capped at ₹2,500/month. 1% fee on fuel, wallet and utility spends (from Jun 2026); ~3.5% forex mark-up.',
    theme: { preset: 'card:unity-roarbank', colors: ['#0b2a4a', '#060f1c', '#f15a24'], ink: 'light', pattern: 'grid' },
    upi: true,
  },
];

export function findCardProduct(id: string | null | undefined): CardProduct | null {
  return CARD_PRODUCTS.find((p) => p.id === id) ?? null;
}
