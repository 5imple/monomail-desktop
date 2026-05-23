import { LRUCache } from 'lru-cache';
import { MonoRecipient } from '@/main/models/types';
import { Avatar, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { getFaviconFromEmail } from '@/renderer/app/lib/faviconUtils';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useEffect, useState, useRef } from 'react';

interface RecipientAvatarProps {
  className?: string;
  recipient: MonoRecipient;
  accountId?: string;
}

// Cache resolved photo URLs keyed by email — null means "no People API photo, use fallback"
const photoUrlCache = new LRUCache<string, string | null>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000
});

// Cache loaded <img> elements for the final resolved URL
const imageCache = new LRUCache<string, HTMLImageElement>({
  max: 200,
  ttl: 60 * 60 * 1000
});

async function fetchContactPhotoUrl(email: string, accountId: string): Promise<string | null> {
  if (photoUrlCache.has(email)) return photoUrlCache.get(email)!;

  try {
    const bridge = (window as any).electronBridge;
    if (!bridge?.getGoogleAccountToken) return null;

    const tokenResult = await bridge.getGoogleAccountToken(accountId);
    if (!tokenResult?.ok) return null;

    const url =
      `https://people.googleapis.com/v1/people:searchContacts` +
      `?query=${encodeURIComponent(email)}&readMask=photos,emailAddresses&pageSize=1&sources=READ_SOURCE_TYPE_CONTACT&sources=READ_SOURCE_TYPE_DOMAIN_CONTACT`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: 'application/json' }
    });

    if (!res.ok) {
      photoUrlCache.set(email, null);
      return null;
    }

    const data = await res.json();
    const person = data.results?.[0]?.person;
    // Prefer non-default (real) photos; skip the grey silhouette default
    const photo = person?.photos?.find((p: any) => !p.default) ?? null;
    const photoUrl: string | null = photo?.url ?? null;

    photoUrlCache.set(email, photoUrl);
    return photoUrl;
  } catch {
    photoUrlCache.set(email, null);
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

const RecipientAvatar: FC<RecipientAvatarProps> = ({ className, recipient, accountId }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [inView, setInView] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

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
    if (!inView || !recipient.email) return;

    let cancelled = false;

    const resolve = async () => {
      const cacheKey = recipient.email;

      // Already have a loaded image for this email
      if (imageCache.has(cacheKey)) {
        const cached = imageCache.get(cacheKey)!;
        if (!cancelled) {
          setImageSrc(cached.src);
          setImageLoaded(true);
        }
        return;
      }

      // 1. Try Google People API photo
      if (accountId) {
        const photoUrl = await fetchContactPhotoUrl(recipient.email, accountId);
        if (!cancelled && photoUrl) {
          try {
            const img = await loadImg(photoUrl);
            imageCache.set(cacheKey, img);
            setImageSrc(img.src);
            setImageLoaded(true);
            return;
          } catch {
            // photo URL didn't load — fall through to favicon
          }
        }
      }

      if (cancelled) return;

      // 2. Fall back to company logo / favicon
      const faviconUrl = getFaviconFromEmail(recipient.email);
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
    return () => { cancelled = true; };
  }, [recipient.email, accountId, inView]);

  return (
    <Avatar className={cn('rounded-full', className)} ref={avatarRef}>
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded-md bg-gradient-to-t from-muted-low to-secondary text-xs transition-opacity dark:from-background dark:to-secondary',
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
