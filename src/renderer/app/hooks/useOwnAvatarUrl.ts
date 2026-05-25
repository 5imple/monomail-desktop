import { useEffect, useState } from 'react';
import electronApi from '@/renderer/app/lib/electronApi';

// Resolved own-photo URLs, keyed by account uid, for the app session.
const ownPhotoCache = new Map<string, string>();

function pickPhotoUrl(data: any): string | undefined {
  const photos = data?.photos;
  if (!Array.isArray(photos)) return undefined;
  // Prefer a real photo; `default: true` is Google's auto-generated monogram,
  // which we skip in favour of the app's own initials fallback.
  return photos.find((photo: any) => photo?.url && !photo.default)?.url;
}

/**
 * Resolve the signed-in user's own avatar URL.
 *
 * Uses the value already on the member (the OAuth `picture`) when present; when
 * it's empty — common for Google Workspace accounts, and for any account signed
 * in before the People-API fallback existed — fetches `people/me` photos through
 * the People API bridge. Result is cached per account for the session.
 */
export function useOwnAvatarUrl(uid?: string, initial?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(
    initial || (uid ? ownPhotoCache.get(uid) : undefined)
  );

  useEffect(() => {
    if (initial) {
      setUrl(initial);
      return;
    }
    if (!uid) return;

    const cached = ownPhotoCache.get(uid);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await electronApi.peopleRequest<any>({
          uid,
          path: '/people/me?personFields=photos',
          headers: { Accept: 'application/json' }
        });
        if (cancelled || !result.ok) return;
        const photoUrl = pickPhotoUrl(result.data);
        if (photoUrl) {
          ownPhotoCache.set(uid, photoUrl);
          if (!cancelled) setUrl(photoUrl);
        }
      } catch {
        // Leave undefined — the avatar shows its initials fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, initial]);

  return url;
}
