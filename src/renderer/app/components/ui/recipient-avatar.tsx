import { LRUCache } from 'lru-cache';
import { MonoRecipient } from '@/main/models/types';
import { Avatar, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { getFaviconFromEmail } from '@/renderer/app/lib/faviconUtils';
import { cn } from '@/renderer/app/lib/utils';
import { FC, useEffect, useState, useRef } from 'react';

interface RecipientAvatarProps {
  className?: string;
  recipient: MonoRecipient;
}

const CACHE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour
const imageCache = new LRUCache<string, HTMLImageElement>({
  max: 100, // Maximum number of items
  ttl: CACHE_DURATION_MS // Time-to-live for cache entries
});

const RecipientAvatar: FC<RecipientAvatarProps> = ({ className, recipient }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [inView, setInView] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Create an Intersection Observer to detect when the avatar is in view
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          // Once we've detected it's in view, we can disconnect the observer
          observer.disconnect();
        }
      },
      {
        rootMargin: '100px', // Load images 100px before they come into view
        threshold: 0.1
      }
    );

    // Start observing the avatar element
    if (avatarRef.current) {
      observer.observe(avatarRef.current);
    }

    // Clean up the observer when component unmounts
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // Only load the image when the avatar is in view
    if (!inView) return;

    const loadImage = async () => {
      // Check if image is already in cache
      if (imageCache.has(recipient.email)) {
        setImageElement(imageCache.get(recipient.email)!);
        setImageLoaded(true);
        return;
      }

      // If not cached, load and cache the image
      const img = new Image();
      img.src = getFaviconFromEmail(recipient.email);

      img.onload = () => {
        imageCache.set(recipient.email, img); // Cache the image
        setImageElement(img); // Set the loaded image
        setImageLoaded(true);
      };

      img.onerror = () => {
        // console.error(`Failed to load image for ${recipient.email}`);
        setImageLoaded(false);
      };
    };

    loadImage();
  }, [recipient.email, inView]);

  return (
    <Avatar className={cn('rounded-full', className)} ref={avatarRef}>
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center rounded-md bg-gradient-to-t from-muted-low to-secondary text-xs transition-opacity dark:from-background dark:to-secondary',
          imageLoaded ? 'opacity-0' : 'opacity-100'
        )}
      >
        {recipient && recipient.name.length > 0
          ? recipient.name.slice(0, 1).toUpperCase()
          : recipient.email.slice(0, 1).toUpperCase()}
      </div>
      {imageElement && inView ? (
        <AvatarImage
          className={cn(
            'select-none bg-gradient-to-t from-muted-low to-secondary object-contain transition-opacity duration-300 dark:from-background dark:to-secondary',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          src={imageElement.src} // Use cached image source
          alt={recipient.name?.slice(0, 1)}
        />
      ) : null}
    </Avatar>
  );
};

export default RecipientAvatar;
