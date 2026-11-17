import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadSnapshot } from '../lib/snapshot';
import { BalanceWidget, QuickAddWidget } from './Widgets';

/** Runs headless when Android asks a widget to render. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      if (name === 'FolioQuickAdd') props.renderWidget(<QuickAddWidget />);
      else props.renderWidget(<BalanceWidget s={await loadSnapshot()} />);
      break;
    default:
      break;
  }
}
