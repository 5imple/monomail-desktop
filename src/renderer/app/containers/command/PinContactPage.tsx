import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { Contact } from '@/renderer/app/lib/db/contact';
import { ellipsisEmailString, ellipsisString } from '@/renderer/app/lib/minimizeEmail';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSpacePinAtom } from '@/renderer/app/store/space/pin/useSpacePinAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface PinContactPageProps {
  pinContact: string;
  setPinContact: (name: string) => void;
  onSelect: () => void;
  onClose: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  bounce: () => void;
}

const COMPLETE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Name in the foreground, the address muted after it — or just the address
// when there's no name (it rendered " (a@b.com)" or the address twice).
const ContactLabel = ({ contact }: { contact: Contact }) => {
  const name = contact.displayName?.trim();
  const hasName = !!name && name.toLowerCase() !== contact.emailAddress.toLowerCase();
  return (
    <span className="flex min-w-0 flex-1 items-baseline">
      <span className="truncate">
        {hasName ? ellipsisString(name) : ellipsisEmailString(contact.emailAddress)}
      </span>
      {hasName && (
        <span className="ml-2 truncate text-xs text-muted-foreground">
          {ellipsisEmailString(contact.emailAddress)}
        </span>
      )}
    </span>
  );
};

const PinContactPage: React.FC<PinContactPageProps> = ({
  pinContact,
  setPinContact,
  onSelect,
  onClose,
  onKeydown,
  bounce
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const { member } = useAuth();
  const { closeDialog } = useDialogs();
  const { contactArray } = useContactAtom();
  const { activeSpace } = useSpaceAtom();
  const { pinMultipleEmailsInSpace, unpinEmailFromSpace } = useSpacePinAtom();

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [currentQueryPart, setCurrentQueryPart] = useState('');
  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);

  const pinnedEmails = activeSpace?.pinnedEmails || [];

  useEffect(() => {
    const queryParts = pinContact.split(/[ ,]+/);
    setCurrentQueryPart(queryParts[queryParts.length - 1]);
  }, [pinContact]);

  // Pinned-at-open, so a toggle doesn't re-sort the row out from under the
  // cursor; the pin indicator and grouping below stay live.
  const [pinnedAtOpen] = useState(() => new Set(pinnedEmails));

  // Sort and ensure uniqueness of contacts (by emailAddress)
  const sortedUniqueContacts = useMemo(() => {
    const uniqueContacts = new Map<string, Contact>();

    contactArray.forEach((contact) => {
      if (!uniqueContacts.has(contact.emailAddress)) {
        uniqueContacts.set(contact.emailAddress, contact);
      }
    });

    // Sort contacts using a balanced approach with multiple factors
    return Array.from(uniqueContacts.values()).sort((a, b) => {
      if (pinnedAtOpen.has(a.emailAddress) && !pinnedAtOpen.has(b.emailAddress)) return -1;
      if (!pinnedAtOpen.has(a.emailAddress) && pinnedAtOpen.has(b.emailAddress)) return 1;

      // 1. Pinned contacts always come first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // 2. Get the most recent activity timestamp for each contact
      const mostRecentA = Math.max(
        a.lastSentMessageTimestamp || 0,
        a.lastReceivedMessageTimestamp || 0
      );

      const mostRecentB = Math.max(
        b.lastSentMessageTimestamp || 0,
        b.lastReceivedMessageTimestamp || 0
      );

      // 3. Recent activity takes precedence (within the last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const aIsRecent = mostRecentA > thirtyDaysAgo;
      const bIsRecent = mostRecentB > thirtyDaysAgo;

      // 4. Recent contacts come before non-recent ones
      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;

      // 5. If neither is recent, but both have some history
      if (mostRecentA > 0 && mostRecentB > 0) {
        return mostRecentB - mostRecentA; // More recent first
      }

      // 6. Contacts with history come before those without
      if (mostRecentA > 0 && mostRecentB === 0) return -1;
      if (mostRecentA === 0 && mostRecentB > 0) return 1;

      // 7. Finally, sort alphabetically by name as last resort
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }, [contactArray, pinnedAtOpen]);

  // Effect to sync `pinContact` emails with `selectedEmails`
  useEffect(() => {
    const emailParts = pinContact.split(/[ ,]+/).filter((part) => part.includes('@'));

    if (
      !selectedEmails.every((email) => emailParts.includes(email)) ||
      !emailParts.every((email) => selectedEmails.includes(email))
    ) {
      setSelectedEmails(emailParts);
    }
  }, [pinContact, selectedEmails]);

  // Selecting a row toggles its pin — and now says which way it went (a
  // pinned contact used to be unpinned without a word).
  const toggleContactPin = async (contact: Contact) => {
    if (pinnedEmails.includes(contact.emailAddress)) {
      await unpinEmailFromSpace(contact.emailAddress);
      toast.success(t('toast.contact_unpinned', { email: contact.emailAddress }));
    } else {
      await pinMultipleEmailsInSpace([contact.emailAddress]);
      toast.success(t('toast.contact_pinned', { email: contact.emailAddress }));
    }
  };

  // Handle contact selection
  const handleContactSelect = (contact: Contact) => {
    toggleContactPin(contact);
    bounce();
  };

  const handlePinContact = async () => {
    if (!member || selectedEmails.length === 0) {
      bounce();
      return;
    }

    await pinMultipleEmailsInSpace(selectedEmails);
    // Pin each selected email in the active space
    toast.success(t('toast.contacts_pinned', { count: selectedEmails.length }));

    setPinContact('');
    bounce();
    closeDialog('commandPalette');
    setTimeout(onClose, 300);
  };

  const filteredContacts = useMemo(() => {
    return sortedUniqueContacts.filter(
      (contact) =>
        !selectedEmails.includes(contact.emailAddress) &&
        (contact.emailAddress.toLowerCase().includes(currentQueryPart.toLowerCase()) ||
          contact.displayName.toLowerCase().includes(currentQueryPart.toLowerCase()))
    );
  }, [sortedUniqueContacts, selectedEmails, currentQueryPart]);
  const pinnedRows = filteredContacts.filter((contact) => pinnedAtOpen.has(contact.emailAddress));
  const otherRows = filteredContacts.filter((contact) => !pinnedAtOpen.has(contact.emailAddress));

  // Typed full addresses with nothing else to pick: offer to pin them (typing
  // jane@washcoll.edu left an empty list and no action). Only then, so Enter
  // on a highlighted contact still pins that contact.
  const pinTypedEmails =
    selectedEmails.length > 0 &&
    selectedEmails.every((email) => COMPLETE_EMAIL.test(email)) &&
    filteredContacts.length === 0;

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          setListHeight(Math.min(commandListRef.current.scrollHeight, 300));
        }
      }, 0);
    }
  }, [filteredContacts, loading, selectedEmails]);

  useEffect(() => {
    setLoading(false);
  }, []);

  const renderRow = (contact: Contact) => {
    const isPinned = pinnedEmails.includes(contact.emailAddress);
    return (
      <CommandItem
        key={contact.emailAddress}
        value={pinContact + contact.emailAddress}
        keywords={[contact.emailAddress, contact.displayName, ...contact.flags]}
        onSelect={() => {
          handleContactSelect(contact);
          onSelect();
        }}
        variant="raycast"
      >
        <RecipientAvatar
          className="mr-3"
          recipient={{ email: contact.emailAddress, name: contact.displayName }}
        />
        <ContactLabel contact={contact} />
        {/* What Enter will do on this row. */}
        <span className="ml-3 shrink-0 text-xs text-muted-foreground">
          {isPinned ? t('command_palette.pin.unpin') : t('command_palette.pin.pin_action')}
        </span>
      </CommandItem>
    );
  };

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.pin.placeholder')}
        value={pinContact}
        onValueChange={setPinContact}
        autoFocus
        renderCondition={(part) => selectedEmails.includes(part)}
        onKeyDown={onKeydown}
      />
      <CommandList
        className="transition-all duration-200 ease-bouncy-in-out"
        style={
          listHeight === undefined
            ? { transition: 'height 300ms' }
            : { transition: 'height 300ms', height: `${listHeight}px` }
        }
      >
        <div ref={commandListRef}>
          {!pinTypedEmails && <CommandEmpty>{t('command_palette.pin.empty')}</CommandEmpty>}
          {pinTypedEmails && (
            <CommandGroup heading={t('command_palette.header.actions')} className="p-2">
              <CommandItem
                value={pinContact + '_action'}
                onSelect={handlePinContact}
                variant="raycast"
              >
                <CommandIcon type="UserPlus" />
                {t('command_palette.pin.pin')} {selectedEmails.length}{' '}
                {selectedEmails.length === 1
                  ? t('command_palette.pin.email')
                  : t('command_palette.pin.emails')}
              </CommandItem>
            </CommandGroup>
          )}
          {pinnedRows.length > 0 && (
            <CommandGroup heading={t('command_palette.header.pinned')} className="p-2">
              {pinnedRows.map(renderRow)}
            </CommandGroup>
          )}
          {otherRows.length > 0 && (
            <CommandGroup
              heading={t('command_palette.header.contacts')}
              className="p-2 transition-all duration-300"
            >
              {otherRows.map(renderRow)}
            </CommandGroup>
          )}
        </div>
      </CommandList>
    </>
  );
};

export default PinContactPage;
