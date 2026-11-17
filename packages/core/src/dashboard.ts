import { z } from 'zod';
import type { PeriodPreset } from './dates';

export const WIDGET_IDS = [
  'net_worth',
  'stats',
  'bank_carousel',
  'card_carousel',
  'after_obligations',
  'cashflow',
  'income_vs_expense',
  'upcoming',
  'reimbursements',
  'category_breakdown',
  'loans',
  'recent',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const WIDGET_META: Record<WidgetId, { title: string; description: string; zone: 'top' | 'middle' | 'lower'; hasPeriod: boolean; hasChart: boolean }> = {
  net_worth: { title: 'Net worth', description: 'Assets plus money owed to you, minus everything you owe', zone: 'top', hasPeriod: false, hasChart: false },
  stats: { title: 'At a glance', description: 'Bank balance, credit outstanding, owed to you', zone: 'top', hasPeriod: false, hasChart: false },
  bank_carousel: { title: 'Bank accounts', description: 'Swipe through your accounts', zone: 'middle', hasPeriod: false, hasChart: false },
  card_carousel: { title: 'Credit cards', description: 'Swipe through your cards', zone: 'middle', hasPeriod: false, hasChart: false },
  after_obligations: { title: 'After upcoming bills', description: 'What stays once the next 30 days of obligations clear', zone: 'middle', hasPeriod: false, hasChart: false },
  cashflow: { title: 'Cash flow', description: 'Money in versus money out, month by month', zone: 'lower', hasPeriod: true, hasChart: true },
  income_vs_expense: { title: 'Income vs spend', description: 'This period compared', zone: 'lower', hasPeriod: true, hasChart: true },
  upcoming: { title: 'Coming up', description: 'Bills, EMIs and card dues', zone: 'lower', hasPeriod: false, hasChart: false },
  reimbursements: { title: 'Owed to you', description: 'Pending reimbursements by person', zone: 'lower', hasPeriod: false, hasChart: false },
  category_breakdown: { title: 'Where it went', description: 'Spending by category', zone: 'lower', hasPeriod: true, hasChart: true },
  loans: { title: 'Loans', description: 'Principal outstanding and EMIs', zone: 'lower', hasPeriod: false, hasChart: false },
  recent: { title: 'Recent activity', description: 'Latest entries across accounts', zone: 'lower', hasPeriod: false, hasChart: false },
};

export const periodPresetSchema = z.enum(['this_month', 'last_month', 'last_3_months', 'last_6_months', 'this_year', 'financial_year', 'last_12_months', 'all_time']);

export const widgetConfigSchema = z.object({
  id: z.enum(WIDGET_IDS),
  visible: z.boolean().default(true),
  period: periodPresetSchema.optional(),
  chart: z.enum(['bars', 'line', 'area', 'donut', 'list']).optional(),
  expanded: z.boolean().optional(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const dashboardPrefsSchema = z.object({
  version: z.literal(1).default(1),
  widgets: z.array(widgetConfigSchema),
  theme: z.enum(['noir', 'graphite', 'midnight']).default('noir'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3ddc97'),
  hideBalances: z.boolean().default(false),
  compactNumbers: z.boolean().default(false),
  defaultPeriod: periodPresetSchema.default('this_month'),
  carouselStyle: z.enum(['carousel', 'stack']).default('carousel'),
});
export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>;

const DEFAULT_ORDER: WidgetId[] = ['net_worth', 'stats', 'bank_carousel', 'card_carousel', 'after_obligations', 'cashflow', 'income_vs_expense', 'upcoming', 'reimbursements', 'recent', 'category_breakdown', 'loans'];

export function defaultDashboard(): DashboardPrefs {
  return {
    version: 1,
    widgets: DEFAULT_ORDER.map((id) => ({
      id,
      visible: !['category_breakdown', 'loans'].includes(id),
      ...(WIDGET_META[id].hasPeriod ? { period: (id === 'cashflow' ? 'last_6_months' : 'this_month') as PeriodPreset } : {}),
    })),
    theme: 'noir',
    accent: '#3ddc97',
    hideBalances: false,
    compactNumbers: false,
    defaultPeriod: 'this_month',
    carouselStyle: 'carousel',
  };
}

/** Parse stored prefs, repairing anything missing (new widgets appear hidden at the end). */
export function normaliseDashboard(raw: unknown): DashboardPrefs {
  const parsed = dashboardPrefsSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : defaultDashboard();
  const seen = new Set<WidgetId>();
  const widgets: WidgetConfig[] = [];
  for (const w of base.widgets) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    widgets.push(w);
  }
  for (const id of WIDGET_IDS) if (!seen.has(id)) widgets.push({ id, visible: false });
  return { ...base, widgets };
}

export function moveWidget(prefs: DashboardPrefs, id: WidgetId, direction: -1 | 1): DashboardPrefs {
  const idx = prefs.widgets.findIndex((w) => w.id === id);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= prefs.widgets.length) return prefs;
  const widgets = [...prefs.widgets];
  [widgets[idx], widgets[target]] = [widgets[target]!, widgets[idx]!];
  return { ...prefs, widgets };
}

export function toggleWidget(prefs: DashboardPrefs, id: WidgetId): DashboardPrefs {
  return { ...prefs, widgets: prefs.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)) };
}

export function updateWidget(prefs: DashboardPrefs, id: WidgetId, patch: Partial<WidgetConfig>): DashboardPrefs {
  return { ...prefs, widgets: prefs.widgets.map((w) => (w.id === id ? { ...w, ...patch, id } : w)) };
}
