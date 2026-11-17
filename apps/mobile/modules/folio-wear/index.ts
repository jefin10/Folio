import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export interface WearNode {
  id: string;
  name: string;
  nearby: boolean;
}

interface FolioWearNative {
  connectedNodes(): Promise<WearNode[]>;
  syncSnapshot(json: string): Promise<boolean>;
  pendingEntries(): Promise<string[]>;
  ackEntry(id: string, ok: boolean, message: string | null): Promise<void>;
  addListener(event: 'onWearEntry' | 'onSyncRequested', cb: (e: { json?: string }) => void): EventSubscription;
}

/** Null when the native module isn't in this build (e.g. Expo Go or web). */
export const FolioWear = requireOptionalNativeModule<FolioWearNative>('FolioWear');
