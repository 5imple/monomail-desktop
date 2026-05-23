import { LRUCache } from 'lru-cache';
import { MonoRecipient } from '@/main/models/types';
import { Avatar, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { DBGetContactByEmail } from '@/renderer/app/lib/db/contact';
import { getFaviconFromEmail } from '@/renderer/app/lib/faviconUtils';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useEffect, useState, useRef } from 'react';

interface RecipientAvatarProps {
  className?: string;
  recipient: MonoRecipient;
  accountId?: string;
  preferredImageSrc?: string | null;
}

// Cache resolved photo URLs keyed by email. `false` means "no People API photo, use fallback".
const photoUrlCache = new LRUCache<string, string | false>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000
});

// Cache loaded <img> elements for the final resolved URL
const imageCache = new LRUCache<string, HTMLImageElement>({
  max: 200,
  ttl: 60 * 60 * 1000
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function getCacheKey(email: string, accountId: string) {
  return `${accountId}:${normalizeEmail(email)}`;
}

function getPersonPhotoUrl(person: any): string | null {
  const photo =
    person?.photos?.find((item: any) => item?.url && !item.default) ??
    person?.photos?.find((item: any) => item?.url);

  return photo?.url ?? null;
}

async function fetchStoredContactPhotoUrl(
  email: string,
  accountId: string
): Promise<string | null> {
  const exactContacts = await DBGetContactByEmail(accountId, email);
  const lowerContacts =
    email === normalizeEmail(email)
      ? []
      : await DBGetContactByEmail(accountId, normalizeEmail(email));
  const contact = [...exactContacts, ...lowerContacts].find((item) => item.profileImageUrl);

  return contact?.profileImageUrl ?? null;
}

async function fetchPeoplePhotoUrl(email: string, accountId: string): Promise<string | null> {
  const cacheKey = getCacheKey(email, accountId);
  if (photoUrlCache.has(cacheKey)) return photoUrlCache.get(cacheKey) || null;

  try {
    const bridge = (window as any).electronBridge;
    if (!bridge?.getGoogleAccountToken) return null;

    const tokenResult = await bridge.getGoogleAccountToken(accountId);
    if (!tokenResult?.ok) return null;

    const encodedEmail = encodeURIComponent(email);
    const urls = [
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodedEmail}&readMask=photos,emailAddresses&pageSize=1&sources=READ_SOURCE_TYPE_CONTACT&sources=READ_SOURCE_TYPE_DOMAIN_CONTACT`,
      `https://people.googleapis.com/v1/otherContacts:search?query=${encodedEmail}&readMask=photos,emailAddresses,names&pageSize=1`,
      `https://people.googleapis.com/v1/people:searchDirectoryPeople?query=${encodedEmail}&readMask=photos,emailAddresses,names&pageSize=1&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE`
    ];

    for (const url of urls) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: 'application/json' }
      });

      if (!res.ok) continue;

      const data = await res.json();
      const people = [
        ...(data.results?.map((result: any) => result.person).filter(Boolean) ?? []),
        ...(data.people ?? []),
        ...(data.otherContacts ?? [])
      ];
      const matchingPerson =
        people.find((person: any) =>
          person?.emailAddresses?.some(
            (address: any) => normalizeEmail(address.value ?? '') === normalizeEmail(email)
          )
        ) ?? people[0];
      const photoUrl = getPersonPhotoUrl(matchingPerson);

      if (photoUrl) {
        photoUrlCache.set(cacheKey, photoUrl);
        return photoUrl;
      }
    }

    photoUrlCache.set(cacheKey, false);
    return null;
  } catch {
    photoUrlCache.set(cacheKey, false);
    return null;
  }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const RecipientAvatar: FC<RecipientAvatarProps> = ({
  className,
  recipient,
  accountId,
  preferredImageSrc
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [inView, setInView] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const normalizedRecipientEmail = normalizeEmail(recipient.email);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
    if (avatarRef.current) observer.observe(avatarRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setImageLoaded(false);
    setImageSrc(null);

    if (!inView || !normalizedRecipientEmail) return;

    let cancelled = false;

    const resolve = async () => {
      const cacheKey = `${accountId ?? 'global'}:${normalizedRecipientEmail}:${preferredImageSrc ?? ''}`;

      // Already have a loaded image for this email
      if (imageCache.has(cacheKey)) {
        const cached = imageCache.get(cacheKey)!;
        if (!cancelled) {
          setImageSrc(cached.src);
          setImageLoaded(true);
        }
        return;
      }

      // 1. Prefer the signed-in Gmail account photo when this sender is one of the user's accounts.
      if (preferredImageSrc) {
        try {
          const img = await loadImg(preferredImageSrc);
          imageCache.set(cacheKey, img);
          if (!cancelled) {
            setImageSrc(img.src);
            setImageLoaded(true);
          }
          return;
        } catch {
          // Stored account image didn't load — keep resolving other sources.
        }
      }

      // 2. Try a locally stored Google contact photo.
      if (accountId) {
        const storedPhotoUrl = await fetchStoredContactPhotoUrl(
          normalizedRecipientEmail,
          accountId
        );
        if (!cancelled && storedPhotoUrl) {
          try {
            const img = await loadImg(storedPhotoUrl);
            imageCache.set(cacheKey, img);
            setImageSrc(img.src);
            setImageLoaded(true);
            return;
          } catch {
            // Stored photo URL didn't load — keep resolving other sources.
          }
        }
      }

      // 3. Try Google People API photos.
      if (accountId) {
        const photoUrl = await fetchPeoplePhotoUrl(normalizedRecipientEmail, accountId);
        if (!cancelled && photoUrl) {
          try {
            const img = await loadImg(photoUrl);
            imageCache.set(cacheKey, img);
            setImageSrc(img.src);
            setImageLoaded(true);
            return;
          } catch {
            // Photo URL didn't load — fall through to favicon.
          }
        }
      }

      if (cancelled) return;

      // 4. Fall back to company logo / favicon.
      const faviconUrl = getFaviconFromEmail(normalizedRecipientEmail);
      try {
        const img = await loadImg(faviconUrl);
        if (!cancelled) {
          imageCache.set(cacheKey, img);
          setImageSrc(img.src);
          setImageLoaded(true);
        }
      } catch {
        // No image — show initials
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [normalizedRecipientEmail, accountId, preferredImageSrc, inView]);

  return (
    <Avatar className={cn('rounded-full', className)} ref={avatarRef}>
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-t from-muted-low to-secondary text-xs transition-opacity dark:from-background dark:to-secondary',
          imageLoaded ? 'opacity-0' : 'opacity-100'
        )}
      >
        {recipient.name?.length > 0
          ? recipient.name.slice(0, 1).toUpperCase()
          : recipient.email.slice(0, 1).toUpperCase()}
      </div>
      {imageSrc && (
        <AvatarImage
          className={cn(
            'select-none object-cover transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          src={imageSrc}
          alt={recipient.name?.slice(0, 1)}
        />
      )}
    </Avatar>
  );
};

export default RecipientAvatar;
