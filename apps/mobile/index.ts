// Entry: register the home-screen widget handler (runs headless, without the
// app UI) and hand over to Expo Router.
import 'react-native-url-polyfill/auto';
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
