import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { repo, useFolio, type Sb } from '@folio/api';

/** Displayable URL for an uploaded image (cached for the session). */
export function useArtwork(path: string | null | undefined): string | null {
  const { sb } = useFolio();
  return (
    useQuery({
      queryKey: ['folio', 'art', path ?? '-'],
      queryFn: () => repo.signedUrl(sb, path!),
      enabled: !!path,
      staleTime: Infinity,
      gcTime: 30 * 60_000,
    }).data ?? null
  );
}

/** Pick a photo from the gallery, crop to card shape, upload it. Returns the file ref, or null if cancelled. */
export async function pickAndUploadCardPhoto(sb: Sb, name: string): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [86, 54], quality: 0.6 });
  if (r.canceled || !r.assets[0]) return null;
  const bytes = await (await fetch(r.assets[0].uri)).arrayBuffer();
  return repo.uploadFile(sb, 'artwork', `${name || 'card'}.jpg`, bytes, 'image/jpeg');
}
