import MonoIcon from '@/renderer/app/components/icons/icons';
import {
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
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSpacePinAtom } from '@/renderer/app/store/space/pin/useSpacePinAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PinContactPageProps {
  pinContact: string;
  setPinContact: (name: string) => void;
  onSelect: () => void;
  onClose: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  bounce: () => void;
}

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
  const [listHeight, setListHeight] = useState(300); // Initial height is 300px

  const pinnedEmails = activeSpace?.pinnedEmails || [];
  // Get unpinned contacts (emails)
  const unpinnedContacts = useMemo(() => {
    return contactArray.filter((contact) => !pinnedEmails.includes(contact.emailAddress));
  }, [activeSpace?.pinnedEmails, contactArray]);

  useEffect(() => {
    const queryParts = pinContact.split(/[ ,]+/);
    setCurrentQueryPart(queryParts[queryParts.length - 1]);
  }, [pinContact]);

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
      if (pinnedEmails.includes(a.emailAddress) && !pinnedEmails.includes(b.emailAddress))
        return -1;
      if (!pinnedEmails.includes(a.emailAddress) && pinnedEmails.includes(b.emailAddress)) return 1;

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
  }, [unpinnedContacts]);

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

  const toggleContactPin = async (contact: Contact) => {
    if (pinnedEmails.includes(contact.emailAddress)) {
      await unpinEmailFromSpace(contact.emailAddress);
    } else {
      await pinMultipleEmailsInSpace([contact.emailAddress]);
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
        className={cn('h-[300px] transition-all duration-200 ease-bouncy-in-out')}
        style={{ transition: 'height 300ms', height: `${listHeight}px` }}
      >
        <div ref={commandListRef}>
          {/* {selectedEmails.length > 0 && (
            <CommandGroup heading="Actions" className="p-2">
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
          )} */}
          {filteredContacts.length > 0 && (
            <CommandGroup
              heading={t('command_palette.header.contacts')}
              className="p-2 transition-all duration-300"
            >
              {filteredContacts.map((contact) => (
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
                    recipient={{ email: contact.emailAddress, name: contact.displayName }}
                  />
                  <span className="ml-2">
                    {ellipsisString(contact.displayName)} (
                    {ellipsisEmailString(contact.emailAddress)})
                  </span>
                  {pinnedEmails.includes(contact.emailAddress) && (
                    <div className="ml-auto mr-2 text-accent">
                      <MonoIcon type="Pin" />
                    </div>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </div>
      </CommandList>
    </>
  );
};

export default PinContactPage;
