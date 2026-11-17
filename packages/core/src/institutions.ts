/**
 * Catalog of Indian financial institutions for quick account setup.
 *
 * It carries names, a short monogram and approximate brand colours so a new
 * account starts with sensible card colours. It deliberately ships no logo
 * artwork: users can upload the logo image of any institution themselves
 * (stored privately in their own storage bucket) and Folio shows it on every
 * card from that institution. Everything here is editable per account, and
 * any institution not listed can be typed in freely.
 */
import type { CardTheme } from './types';

export type InstitutionKind = 'public_bank' | 'private_bank' | 'small_finance_bank' | 'payments_bank' | 'foreign_bank' | 'card_issuer' | 'wallet' | 'bnpl' | 'nbfc' | 'cooperative';

export interface CatalogInstitution {
  id: string;
  name: string;
  /** 2–4 letter monogram shown when no logo has been uploaded. */
  short: string;
  kind: InstitutionKind;
  /** [primary, secondary] — approximate, for generated card artwork. */
  colors: [string, string];
  aliases?: string[];
}

const I = (id: string, name: string, short: string, kind: InstitutionKind, primary: string, secondary: string, aliases: string[] = []): CatalogInstitution => ({ id, name, short, kind, colors: [primary, secondary], aliases });

export const INSTITUTIONS: CatalogInstitution[] = [
  // Public sector banks
  I('sbi', 'State Bank of India', 'SBI', 'public_bank', '#22409a', '#00b5ef', ['sbi', 'state bank']),
  I('bob', 'Bank of Baroda', 'BOB', 'public_bank', '#f26522', '#1d1d1b', ['baroda']),
  I('pnb', 'Punjab National Bank', 'PNB', 'public_bank', '#a6192e', '#fbb034'),
  I('canara', 'Canara Bank', 'CB', 'public_bank', '#0091d5', '#ffd400', ['canara']),
  I('union', 'Union Bank of India', 'UBI', 'public_bank', '#e31e24', '#1b3b8f', ['union bank']),
  I('boi', 'Bank of India', 'BOI', 'public_bank', '#f37021', '#00529b'),
  I('indian', 'Indian Bank', 'IB', 'public_bank', '#1d3c8f', '#f6a01a'),
  I('central', 'Central Bank of India', 'CBI', 'public_bank', '#d71920', '#1b4c9c'),
  I('iob', 'Indian Overseas Bank', 'IOB', 'public_bank', '#003f87', '#e31b23'),
  I('uco', 'UCO Bank', 'UCO', 'public_bank', '#0c4da2', '#f7a800'),
  I('bom', 'Bank of Maharashtra', 'BOM', 'public_bank', '#e2231a', '#1b3e93'),
  I('psb', 'Punjab & Sind Bank', 'PSB', 'public_bank', '#00843d', '#f2b705'),

  I('sbicard', 'SBI Card', 'SBI', 'card_issuer', '#22409a', '#00b5ef', ['sbi card', 'sbi cards']),

  // Private sector banks
  I('hdfc', 'HDFC Bank', 'HDFC', 'private_bank', '#004c8f', '#ed232a', ['hdfc']),
  I('icici', 'ICICI Bank', 'ICICI', 'private_bank', '#ae282e', '#f37e20', ['icici']),
  I('axis', 'Axis Bank', 'AXIS', 'private_bank', '#97144d', '#e8b4c8', ['axis']),
  I('kotak', 'Kotak Mahindra Bank', 'KMB', 'private_bank', '#ed1c24', '#003874', ['kotak', '811']),
  I('indusind', 'IndusInd Bank', 'IIB', 'private_bank', '#98272a', '#f0b323', ['indusind']),
  I('yes', 'Yes Bank', 'YES', 'private_bank', '#0d4b9e', '#e31e24', ['yes bank']),
  I('idfc', 'IDFC FIRST Bank', 'IDFC', 'private_bank', '#9c1d26', '#3f3f3f', ['idfc', 'idfc first']),
  I('federal', 'Federal Bank', 'FB', 'private_bank', '#0b3c80', '#f4a81d', ['federal']),
  I('sib', 'South Indian Bank', 'SIB', 'private_bank', '#ab1e30', '#ffc20e'),
  I('rbl', 'RBL Bank', 'RBL', 'private_bank', '#21409a', '#ed1c24'),
  I('bandhan', 'Bandhan Bank', 'BB', 'private_bank', '#e0322d', '#0a4c8b'),
  I('idbi', 'IDBI Bank', 'IDBI', 'private_bank', '#00836c', '#f58220'),
  I('cub', 'City Union Bank', 'CUB', 'private_bank', '#1b3f93', '#e31b23'),
  I('kvb', 'Karur Vysya Bank', 'KVB', 'private_bank', '#00703c', '#f5a623'),
  I('karnataka', 'Karnataka Bank', 'KBL', 'private_bank', '#6d2c82', '#f6a01a'),
  I('dcb', 'DCB Bank', 'DCB', 'private_bank', '#0072bc', '#7ac143'),
  I('csb', 'CSB Bank', 'CSB', 'private_bank', '#d71f26', '#1d3f8c'),
  I('dhanlaxmi', 'Dhanlaxmi Bank', 'DLB', 'private_bank', '#e37222', '#003e7e'),
  I('tmb', 'Tamilnad Mercantile Bank', 'TMB', 'private_bank', '#1d5aa6', '#e31e24'),
  I('jkbank', 'J&K Bank', 'JKB', 'private_bank', '#cf2027', '#123a7c'),
  I('nainital', 'Nainital Bank', 'NTB', 'private_bank', '#0a4da2', '#f2a900'),

  // Small finance banks
  I('au', 'AU Small Finance Bank', 'AU', 'small_finance_bank', '#6d2077', '#ec6608', ['au bank']),
  I('equitas', 'Equitas Small Finance Bank', 'EQ', 'small_finance_bank', '#f58220', '#0b4f9c'),
  I('ujjivan', 'Ujjivan Small Finance Bank', 'UJ', 'small_finance_bank', '#04a65d', '#0a3e7a'),
  I('jana', 'Jana Small Finance Bank', 'JANA', 'small_finance_bank', '#0b6d4a', '#f6a21a'),
  I('esaf', 'ESAF Small Finance Bank', 'ESAF', 'small_finance_bank', '#ce1e2d', '#1f3b87'),
  I('suryoday', 'Suryoday Small Finance Bank', 'SSFB', 'small_finance_bank', '#f37021', '#00519e'),
  I('utkarsh', 'Utkarsh Small Finance Bank', 'USFB', 'small_finance_bank', '#7a1f5c', '#f7a823'),
  I('unity', 'Unity Small Finance Bank', 'UNITY', 'small_finance_bank', '#0e6bb3', '#f15a24', ['roar', 'roarbank', 'roar bank']),
  I('slice_sfb', 'slice Small Finance Bank', 'SLC', 'small_finance_bank', '#6c3ce0', '#1c1236', ['slice', 'north east small finance']),

  // Payments banks
  I('airtel_pb', 'Airtel Payments Bank', 'APB', 'payments_bank', '#e40000', '#1a1a1a', ['airtel']),
  I('ippb', 'India Post Payments Bank', 'IPPB', 'payments_bank', '#e3242b', '#f7c600', ['india post']),
  I('paytm_pb', 'Paytm Payments Bank', 'PPB', 'payments_bank', '#00baf2', '#002e6e'),
  I('fino', 'Fino Payments Bank', 'FINO', 'payments_bank', '#003b71', '#f7941d'),
  I('jio_pb', 'Jio Payments Bank', 'JIO', 'payments_bank', '#0f3cc9', '#d7000f'),

  // Foreign banks
  I('sc', 'Standard Chartered', 'SC', 'foreign_bank', '#0072aa', '#38d200', ['standard chartered', 'stanchart']),
  I('hsbc', 'HSBC', 'HSBC', 'foreign_bank', '#db0011', '#333333'),
  I('dbs', 'DBS Bank', 'DBS', 'foreign_bank', '#e60012', '#1a1a1a', ['digibank']),
  I('deutsche', 'Deutsche Bank', 'DB', 'foreign_bank', '#0018a8', '#6a7a8c'),
  I('barclays', 'Barclays', 'BARC', 'foreign_bank', '#00aeef', '#00395d'),
  I('amex', 'American Express', 'AMEX', 'card_issuer', '#016fd0', '#e8f1fb', ['amex']),

  // Card issuers & neo-banks (cards often issued with a partner bank)
  I('onecard', 'OneCard', 'ONE', 'card_issuer', '#111111', '#8a8a8a'),
  I('uni', 'Uni Cards', 'UNI', 'card_issuer', '#111111', '#c9f31d'),
  I('scapia', 'Scapia', 'SCP', 'card_issuer', '#1f1446', '#ff7a59'),
  I('jupiter', 'Jupiter', 'JUP', 'card_issuer', '#ff7a59', '#1b1b3a'),
  I('fi', 'Fi Money', 'Fi', 'card_issuer', '#00b899', '#0b1d26'),
  I('niyo', 'Niyo', 'NIYO', 'card_issuer', '#ff5a5f', '#1a1a2e'),
  I('kiwi', 'Kiwi', 'KIWI', 'card_issuer', '#2fbf71', '#0f2b1c'),
  I('tataneu', 'Tata Neu', 'NEU', 'card_issuer', '#4f2d7f', '#f5b0c8'),

  // Wallets / UPI apps
  I('paytm', 'Paytm Wallet', 'PAYTM', 'wallet', '#00baf2', '#002e6e', ['paytm']),
  I('phonepe', 'PhonePe', 'PPE', 'wallet', '#5f259f', '#ffffff', ['phonepe']),
  I('gpay', 'Google Pay', 'GPAY', 'wallet', '#1a73e8', '#34a853', ['gpay', 'google pay']),
  I('amazonpay', 'Amazon Pay', 'APAY', 'wallet', '#232f3e', '#ff9900', ['amazon pay']),
  I('mobikwik', 'MobiKwik', 'MBK', 'wallet', '#232c65', '#00aeef'),
  I('freecharge', 'Freecharge', 'FC', 'wallet', '#f37021', '#1e1e1e'),
  I('cred', 'CRED UPI', 'CRED', 'wallet', '#111111', '#ffffff'),

  // Pay later
  I('simpl', 'Simpl', 'SMPL', 'bnpl', '#00d09c', '#0b1f33'),
  I('lazypay', 'LazyPay', 'LZP', 'bnpl', '#e8505b', '#1b1b1b'),
  I('amazon_pl', 'Amazon Pay Later', 'APL', 'bnpl', '#232f3e', '#ff9900'),
  I('flipkart_pl', 'Flipkart Pay Later', 'FPL', 'bnpl', '#2874f0', '#ffe500'),

  // NBFCs and housing finance (loans)
  I('bajaj', 'Bajaj Finance', 'BFL', 'nbfc', '#0072bc', '#1d1d1b', ['bajaj finserv']),
  I('tatacap', 'Tata Capital', 'TATA', 'nbfc', '#0d4a8f', '#6cc4ee'),
  I('hdb', 'HDB Financial Services', 'HDB', 'nbfc', '#003b7a', '#ed1c24'),
  I('herofin', 'Hero FinCorp', 'HERO', 'nbfc', '#e21f26', '#1d1d1b'),
  I('tvscredit', 'TVS Credit', 'TVS', 'nbfc', '#1b3e94', '#e31e24'),
  I('mahfin', 'Mahindra Finance', 'MMFS', 'nbfc', '#e31837', '#1d1d1b'),
  I('shriram', 'Shriram Finance', 'SFL', 'nbfc', '#0d5aa7', '#f9a01b'),
  I('ltfin', 'L&T Finance', 'LTF', 'nbfc', '#0b3d91', '#fbb03b'),
  I('abfl', 'Aditya Birla Finance', 'ABFL', 'nbfc', '#c0102e', '#f2a900'),
  I('muthoot', 'Muthoot Finance', 'MF', 'nbfc', '#e31e24', '#f6c000', ['gold loan']),
  I('manappuram', 'Manappuram Finance', 'MAFIL', 'nbfc', '#00703c', '#f2b705'),
  I('lichfl', 'LIC Housing Finance', 'LICHF', 'nbfc', '#0068b3', '#f7d117'),
  I('pnbhfl', 'PNB Housing Finance', 'PNBHF', 'nbfc', '#a6192e', '#fbb034'),
  I('chola', 'Cholamandalam Finance', 'CHOLA', 'nbfc', '#0a5c36', '#e31e24'),
  I('poonawalla', 'Poonawalla Fincorp', 'PFL', 'nbfc', '#0f3d6e', '#00a3e0'),

  // Co-operative
  I('saraswat', 'Saraswat Bank', 'SCB', 'cooperative', '#004b8d', '#f7a823'),
  I('cosmos', 'Cosmos Bank', 'COS', 'cooperative', '#1c3f94', '#ed1c24'),
];

export const INSTITUTION_KIND_LABEL: Record<InstitutionKind, string> = {
  public_bank: 'Public sector banks',
  private_bank: 'Private banks',
  small_finance_bank: 'Small finance banks',
  payments_bank: 'Payments banks',
  foreign_bank: 'Foreign banks',
  card_issuer: 'Card issuers',
  wallet: 'Wallets & UPI',
  bnpl: 'Pay later',
  nbfc: 'NBFCs & housing finance',
  cooperative: 'Co-operative banks',
};

/** Search by name, short name or alias. */
export function searchInstitutions(query: string, limit = 12): CatalogInstitution[] {
  const q = query.trim().toLowerCase();
  if (!q) return INSTITUTIONS.slice(0, limit);
  const scored = INSTITUTIONS.map((i) => {
    const hay = [i.name, i.short, ...(i.aliases ?? [])].map((s) => s.toLowerCase());
    let score = 0;
    for (const h of hay) {
      if (h === q) score = Math.max(score, 4);
      else if (h.startsWith(q)) score = Math.max(score, 3);
      else if (h.split(/\s+/).some((w) => w.startsWith(q))) score = Math.max(score, 2);
      else if (h.includes(q)) score = Math.max(score, 1);
    }
    return { i, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name));
  return scored.slice(0, limit).map((x) => x.i);
}

export function findInstitution(nameOrId: string | null | undefined): CatalogInstitution | null {
  if (!nameOrId) return null;
  const n = nameOrId.trim().toLowerCase();
  return INSTITUTIONS.find((i) => i.id === n || i.name.toLowerCase() === n || i.short.toLowerCase() === n || i.aliases?.some((a) => a === n)) ?? null;
}

function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1]!, 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((v >> shift) & 255) * factor)));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const v = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/** Card artwork derived from an institution's colours (dark, premium treatment). */
export function themeFromInstitution(inst: Pick<CatalogInstitution, 'colors' | 'id'>, pattern: string | null = 'lines'): CardTheme {
  const [primary] = inst.colors;
  const deep = shade(primary, 0.35);
  const mid = shade(primary, 0.7);
  return { preset: `inst:${inst.id}`, colors: [mid, deep, primary], ink: luminance(primary) > 0.55 ? 'dark' : 'light', pattern };
}

/** Readable text colour for a monogram badge on the given background. */
export function inkOn(hex: string): '#111111' | '#ffffff' {
  return luminance(hex) > 0.45 ? '#111111' : '#ffffff';
}
