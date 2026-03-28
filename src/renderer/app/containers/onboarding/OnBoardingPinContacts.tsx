import { Button } from '@/renderer/app/components/ui/button';
import { Input } from '@/renderer/app/components/ui/input';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Checkbox } from '@/renderer/app/components/ui/checkbox';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { animated, useSpring, useTrail } from '@react-spring/web';
import { FC, useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useSpacePinAtom } from '@/renderer/app/store/space/pin/useSpacePinAtom';
import { Contact } from '@/renderer/app/lib/db/contact';
import { ellipsisString, ellipsisEmailString } from '@/renderer/app/lib/minimizeEmail';
import { cn } from '@/renderer/app/lib/utils';
import Loader from '@/renderer/app/components/ui/loader';

interface OnBoardingPinContactsProps {
  onContinue: () => void;
}

// Enhanced video preview component with better visual feedback
const VideoPreview: FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const [currentFrame, setCurrentFrame] = useState(0);

  const playButtonSpring = useSpring({
    scale: isPlaying ? 0 : 1,
    opacity: isPlaying ? 0 : 1,
    config: { tension: 300, friction: 25 }
  });

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border bg-gradient-to-br from-muted/50 to-muted">
      <div className="absolute inset-0 flex items-center justify-center">
        <animated.div
          style={playButtonSpring}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 backdrop-blur-sm transition-colors hover:bg-primary/30"
        >
          <MonoIcon type="Mono" className="h-8 w-8 text-primary" />
        </animated.div>
      </div>

      {/* Simulated preview content */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="rounded-lg bg-background/80 p-3 backdrop-blur-sm">
          <div className="mb-2 text-sm font-medium">Quick tip: Pin frequently contacted people</div>
          <div className="text-xs text-muted-foreground">
            Pinned contacts appear at the top for easy access
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced contact item with better visual hierarchy and interactions
const ContactItem: FC<{
  contact: Contact;
  isSelected: boolean;
  onToggle: (contact: Contact) => void;
  isPinned?: boolean;
  isDisabled?: boolean;
}> = ({ contact, isSelected, onToggle, isPinned = false, isDisabled = false }) => {
  const [isHovered, setIsHovered] = useState(false);

  // React Spring animation for the pin icon
  const pinIconSpring = useSpring({
    scale: isSelected ? 1 : 0,
    opacity: isSelected ? 1 : 0,
    config: { tension: 300, friction: 25 }
  });

  const initials =
    contact.displayName
      ?.split(' ')
      .map((name) => name[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || contact.emailAddress.slice(0, 2).toUpperCase();

  // Calculate recent activity indicator
  const mostRecentActivity = Math.max(
    contact.lastSentMessageTimestamp || 0,
    contact.lastReceivedMessageTimestamp || 0
  );
  const isRecentlyActive = mostRecentActivity > Date.now() - 30 * 24 * 60 * 60 * 1000;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg p-3 transition-all duration-200',
        isSelected
          ? 'bg-primary/5'
          : isDisabled
            ? 'cursor-not-allowed border-border bg-muted/30 opacity-60'
            : 'cursor-pointer border-border hover:bg-muted/50'
        // isPinned && 'border-accent bg-accent/30'
      )}
      onClick={() => !isDisabled && onToggle(contact)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative">
        <RecipientAvatar
          className="h-10 w-10"
          recipient={{ email: contact.emailAddress, name: contact.displayName }}
        />

        {isPinned && (
          <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            <MonoIcon type="Pin" className="h-2 w-2" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium">
            {ellipsisString(contact.displayName || contact.emailAddress, 25)}
          </div>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {ellipsisEmailString(contact.emailAddress, 30)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isSelected && (
          <animated.div style={pinIconSpring} className="shrink-0">
            <MonoIcon type="Pin" className="h-4 w-4 text-primary" />
          </animated.div>
        )}
      </div>
    </div>
  );
};

// Enhanced search and filter bar
const SearchAndFilter: FC<{
  searchQuery: string;
  onSearchChange: (query: string) => void;
}> = ({ searchQuery, onSearchChange }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <MonoIcon
          type="Search"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder={t('onboarding.pin_contacts.search_placeholder')}
          sizeVariant={'lg'}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            sizeVariant="sm"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
          >
            <MonoIcon type="X" className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};

const OnBoardingPinContacts: FC<OnBoardingPinContactsProps> = ({ onContinue }) => {
  const { t } = useTranslation();
  const { contactArray } = useContactAtom();
  const { pinMultipleEmailsInSpace } = useSpacePinAtom();

  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const MAX_SELECTIONS = 3;

  // Sort contacts with better algorithm (similar to PinContactPage)
  const sortedContacts = useMemo(() => {
    const uniqueContacts = new Map<string, Contact>();

    contactArray.forEach((contact) => {
      if (!uniqueContacts.has(contact.emailAddress)) {
        uniqueContacts.set(contact.emailAddress, contact);
      }
    });

    return Array.from(uniqueContacts.values()).sort((a, b) => {
      // 1. Pinned contacts first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // 2. Recent activity
      const mostRecentA = Math.max(
        a.lastSentMessageTimestamp || 0,
        a.lastReceivedMessageTimestamp || 0
      );
      const mostRecentB = Math.max(
        b.lastSentMessageTimestamp || 0,
        b.lastReceivedMessageTimestamp || 0
      );

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const aIsRecent = mostRecentA > thirtyDaysAgo;
      const bIsRecent = mostRecentB > thirtyDaysAgo;

      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;

      // 3. Most recent first
      if (mostRecentA > 0 && mostRecentB > 0) {
        return mostRecentB - mostRecentA;
      }

      // 4. Contacts with history
      if (mostRecentA > 0 && mostRecentB === 0) return -1;
      if (mostRecentA === 0 && mostRecentB > 0) return 1;

      // 5. Alphabetical
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }, [contactArray]);

  // Filter contacts based on search and filters
  const filteredContacts = useMemo(() => {
    let filtered = sortedContacts.filter(
      (contact) => !contact.emailAddress.toLowerCase().includes('reply')
    );

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (contact) =>
          contact.displayName?.toLowerCase().includes(query) ||
          contact.emailAddress.toLowerCase().includes(query)
      );
    }

    return filtered.slice(0, 50);
  }, [sortedContacts, searchQuery]);

  // Animation springs
  const trail = useTrail(3, {
    from: { opacity: 0, transform: 'translateY(40px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 300
  });

  const sidebarSpring = useSpring({
    from: { opacity: 0, transform: 'translateX(20px)' },
    to: { opacity: 1, transform: 'translateX(0px)' },
    config: { tension: 200, friction: 20 },
    delay: 800
  });

  const handleContactToggle = (contact: Contact) => {
    setSelectedContacts((prev) => {
      const isSelected = prev.some((c) => c.contactId === contact.contactId);
      if (isSelected) {
        return prev.filter((c) => c.contactId !== contact.contactId);
      } else {
        // Prevent selection if already at max limit
        if (prev.length >= MAX_SELECTIONS) {
          return prev;
        }
        return [...prev, contact];
      }
    });
  };

  const handleContinue = async () => {
    if (selectedContacts.length !== MAX_SELECTIONS) {
      return;
    }

    setIsProcessing(true);
    try {
      const emails = selectedContacts.map((contact) => contact.emailAddress);
      pinMultipleEmailsInSpace(emails);
      onContinue();
    } catch (error) {
      console.error('Failed to pin contacts:', error);
      onContinue();
    } finally {
      setIsProcessing(false);
    }
  };

  const allVisibleSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((contact) =>
      selectedContacts.some((sc) => sc.contactId === contact.contactId)
    );

  return (
    <div className="mx-auto max-w-xl p-6">
      {trail.map((style, index) => {
        if (index === 0) {
          return (
            <animated.h1
              key="title"
              style={style}
              className="mb-3 text-center text-2xl font-semibold"
            >
              {t('onboarding.pin_contacts.title', { default: 'Pin Your Important Contacts' })}
            </animated.h1>
          );
        }
        if (index === 1) {
          return (
            <animated.p
              key="description"
              style={style}
              className="mx-auto mb-8 max-w-3xl text-center text-xl text-muted-foreground"
            >
              {t('onboarding.pin_contacts.description', {
                default:
                  "Select 3 contacts you email frequently. They'll appear at the top of your inbox for quick access."
              })}
            </animated.p>
          );
        }
        if (index === 2) {
          return (
            <animated.div key="content" style={style} className="space-y-3">
              {/* Left Side - Contact Selection */}
              {/* Search and filters */}
              <SearchAndFilter searchQuery={searchQuery} onSearchChange={setSearchQuery} />

              {/* Contacts List */}
              <ScrollArea
                className="relative h-96"
                scrollbarClassName={'opacity-0'}
                viewportClassName="py-4"
                style={{
                  maskImage:
                    'linear-gradient(0deg, transparent 0%, hsl(var(--card)) 10%, hsl(var(--card)) 90%, transparent 100%)'
                }}
              >
                <div className="space-y-2 pr-2">
                  {filteredContacts.length === 0 ? (
                    <div className="py-8 text-center">
                      <MonoIcon
                        type="UserIcon"
                        className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
                      />
                      <p className="text-muted-foreground">
                        {searchQuery
                          ? 'No contacts found matching your search.'
                          : 'No contacts found.'}
                      </p>
                    </div>
                  ) : (
                    filteredContacts.map((contact) => {
                      const isSelected = selectedContacts.some(
                        (c) => c.contactId === contact.contactId
                      );
                      const isDisabled = !isSelected && selectedContacts.length >= MAX_SELECTIONS;

                      return (
                        <ContactItem
                          key={contact.contactId}
                          contact={contact}
                          isSelected={isSelected}
                          onToggle={handleContactToggle}
                          isPinned={contact.pinned}
                          isDisabled={isDisabled}
                        />
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </animated.div>
          );
        }
        return null;
      })}

      {/* Action Buttons */}
      <animated.div
        className="mt-12 flex justify-center"
        style={useSpring({
          from: { opacity: 0, transform: 'translateY(20px)' },
          to: { opacity: 1, transform: 'translateY(0px)' },
          config: { tension: 300, friction: 25 },
          delay: 1000
        })}
      >
        <Button
          onClick={handleContinue}
          className="px-8"
          sizeVariant="xl"
          disabled={isProcessing || selectedContacts.length !== MAX_SELECTIONS}
        >
          {t('onboarding.pin_contacts.continue', { default: 'Continue' })}
        </Button>
      </animated.div>

      <animated.div
        className="mt-4 flex justify-center"
        style={useSpring({
          from: { opacity: 0, transform: 'translateY(20px)' },
          to: { opacity: 1, transform: 'translateY(0px)' },
          config: { tension: 300, friction: 25 },
          delay: 1000
        })}
      >
        <Badge variant="secondary" sizeVariant="sm" className="rounded-sm text-xs">
          {selectedContacts.length} of {MAX_SELECTIONS} selected
        </Badge>
      </animated.div>
    </div>
  );
};

export default OnBoardingPinContacts;
