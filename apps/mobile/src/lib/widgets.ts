import { requestWidgetUpdate } from 'react-native-android-widget';
import { createElement } from 'react';
import { BalanceWidget, QuickAddWidget } from '../widgets/Widgets';
import type { Snapshot } from './snapshot';

/** Re-render any placed widgets with the latest snapshot. */
export async function refreshWidgets(s: Snapshot): Promise<void> {
  try {
    await requestWidgetUpdate({ widgetName: 'FolioBalance', renderWidget: () => createElement(BalanceWidget, { s }) });
    await requestWidgetUpdate({ widgetName: 'FolioQuickAdd', renderWidget: () => createElement(QuickAddWidget) });
  } catch {
    // No widgets placed, or the native module isn't in this build.
  }
}
