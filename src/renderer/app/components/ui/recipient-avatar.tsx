import { LRUCache } from 'lru-cache';
import { MonoRecipient } from '@/main/models/types';
import { Avatar, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { DBGetContactByEmail } from '@/renderer/app/lib/db/contact';
import electronApi from '@/renderer/app/lib/electronApi';
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

const failedImageUrlCache = new LRUCache<string, true>({
  max: 500,
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
    const encodedEmail = encodeURIComponent(email);
    const paths = [
      `/people:searchContacts?query=${encodedEmail}&readMask=photos,emailAddresses&pageSize=1&sources=READ_SOURCE_TYPE_CONTACT&sources=READ_SOURCE_TYPE_DOMAIN_CONTACT`,
      `/otherContacts:search?query=${encodedEmail}&readMask=photos,emailAddresses,names&pageSize=1`,
      `/people:searchDirectoryPeople?query=${encodedEmail}&readMask=photos,emailAddresses,names&pageSize=1&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE`
    ];

    for (const path of paths) {
      const result = await electronApi.peopleRequest<any>({
        uid: accountId,
        path,
        headers: { Accept: 'application/json' }
      });

      if (!result.ok) continue;

      const data = result.data;
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
  if (failedImageUrlCache.has(src)) {
    return Promise.reject(new Error('Image URL recently failed to load'));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      failedImageUrlCache.set(src, true);
      reject(new Error('Image failed to load'));
    };
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

      // 1. The sender's actual Google/Gmail avatar via the People API.
      if (accountId) {
        const photoUrl = await fetchPeoplePhotoUrl(normalizedRecipientEmail, accountId);
        if (!cancelled && photoUrl) {
          try {
            const img = await loadImg(photoUrl);
            imageCache.set(cacheKey, img);
            if (!cancelled) {
              setImageSrc(img.src);
              setImageLoaded(true);
            }
            return;
          } catch {
            // People photo didn't load — keep resolving other sources.
          }
        }
      }

      // 2. The signed-in account photo — covers the user's own sends, where the
      //    People API won't return a result for the user themselves.
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
          // Account image didn't load — keep resolving other sources.
        }
      }

      // 3. A locally stored Google contact photo.
      if (accountId) {
        const storedPhotoUrl = await fetchStoredContactPhotoUrl(
          normalizedRecipientEmail,
          accountId
        );
        if (!cancelled && storedPhotoUrl) {
          try {
            const img = await loadImg(storedPhotoUrl);
            imageCache.set(cacheKey, img);
            if (!cancelled) {
              setImageSrc(img.src);
              setImageLoaded(true);
            }
            return;
          } catch {
            // Stored photo URL didn't load — keep resolving other sources.
          }
        }
      }

      // No Google/contact photo for this sender — show clean initials, like
      // Gmail. We intentionally do NOT fall back to a domain favicon/logo:
      // those looked poor (tiny scaled favicons) and aren't the sender's avatar.
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
