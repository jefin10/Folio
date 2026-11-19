import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Folio for Android. The watch app (apps/wear) must use the SAME
 * applicationId and signing key so the Wear OS Data Layer pairs them.
 */
export const ANDROID_PACKAGE = 'app.folio.android';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Folio',
  slug: 'folio',
  scheme: 'folio',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b0b0b',
  icon: './assets/icon.png',
  android: {
    package: ANDROID_PACKAGE,
    versionCode: 1,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0b0b0b' },
    softwareKeyboardLayoutMode: 'resize',
    permissions: ['USE_BIOMETRIC', 'USE_FINGERPRINT', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'VIBRATE'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_CONTACTS'],
    allowBackup: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-local-authentication', { faceIDPermission: 'Unlock Folio' }],
    ['expo-notifications', { color: '#3ddc97', defaultChannel: 'folio-reminders' }],
    ['expo-image-picker', { photosPermission: 'Pick card artwork and bank logos' }],
    ['expo-splash-screen', { backgroundColor: '#0b0b0b', image: './assets/splash.png', imageWidth: 120 }],
    'expo-font',
    [
      'react-native-android-widget',
      {
        widgets: [
          { name: 'FolioBalance', label: 'Folio · Balance', minWidth: '250dp', minHeight: '110dp', targetCellWidth: 4, targetCellHeight: 2, description: 'Spendable balance, today’s spend and the next bill', previewImage: './assets/widget-preview.png', updatePeriodMillis: 1800000, resizeMode: 'horizontal|vertical' },
          { name: 'FolioQuickAdd', label: 'Folio · Quick add', minWidth: '110dp', minHeight: '40dp', targetCellWidth: 2, targetCellHeight: 1, description: 'Record an expense in one tap', previewImage: './assets/widget-preview.png', updatePeriodMillis: 0 },
        ],
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
});
