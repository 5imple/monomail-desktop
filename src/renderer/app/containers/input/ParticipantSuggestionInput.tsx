import MonoIcon from '@/renderer/app/components/icons/icons';
import ContactProfileDropdown from '@/renderer/app/components/mail/ContactProfileDropdown';
import { Badge } from '@/renderer/app/components/ui/badge';
import MultipleSelector, {
  MultipleSelectorProps,
  Option
} from '@/renderer/app/components/ui/multi-selector';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { Contact } from '@/renderer/app/lib/db/contact';
import { ellipsisEmailString, ellipsisString } from '@/renderer/app/lib/minimizeEmail';
import { cn } from '@/renderer/app/lib/utils';
import React, { useEffect, useState } from 'react';

interface ParticipantSuggestionInputProps extends MultipleSelectorProps {
  className?: string;
  contacts: Contact[];

  forbiddenInputs?: string[];
  onSelectionChange: (selectedContacts: Contact[]) => void;
  /**
   * Disable wrapping badges with `ContactProfileDropdown`.
   * Useful when the consumer is outside `AuthProvider` and cannot use `useAuth`.
   */
  disableProfileDropdown?: boolean;
  /**
   * Original attendees to track which ones are new
   */
  originalAttendees?: Option[];
  /**
   * Callback for when send invite is triggered for new attendees
   */
  onSendInvite?: (newAttendees: Option[]) => void;
  /**
   * Class name for the badge
   */
  badgeClassName?: string;
}

const ParticipantSuggestionInput: React.FC<ParticipantSuggestionInputProps> = ({
  className,
  contacts,
  badgeClassName,
  onSelectionChange,
  forbiddenInputs = [],
  disableProfileDropdown = false,
  originalAttendees = [],
  onSendInvite,
  defaultValue,
  value,
  ...props
}) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Option[]>(defaultValue ?? []);
  const [activeContacts, setActiveContacts] = useState<Option[]>([]);

  // Sync internal state with external value prop
  useEffect(() => {
    if (value !== undefined) {
      setSelectedContacts(value);
    }
  }, [value]);

  useEffect(() => {
    const uniqueContacts = new Map<string, Contact>();

    contacts.forEach((contact) => {
      if (!uniqueContacts.has(contact.emailAddress)) {
        uniqueContacts.set(contact.emailAddress, contact);
      }
    });

    // Sort contacts using a balanced approach with multiple factors
    const contactOptions = Array.from(uniqueContacts.values())
      .sort((a, b) => {
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

        // 4. For recent contacts, prioritize by message frequency first
        // if (aIsRecent && bIsRecent) {
        //   const aTotal = (a.messagesSent || 0) + (a.messagesReceived || 0);
        //   const bTotal = (b.messagesSent || 0) + (b.messagesReceived || 0);

        //   // If there's a significant difference in message counts
        //   if (Math.abs(aTotal - bTotal) > 5) {
        //     return bTotal - aTotal; // Higher message count first
        //   }

        //   // If message counts are similar, use recency
        //   return mostRecentB - mostRecentA;
        // }

        // 5. Recent contacts come before non-recent ones
        if (aIsRecent && !bIsRecent) return -1;
        if (!aIsRecent && bIsRecent) return 1;

        // 6. If neither is recent, but both have some history
        if (mostRecentA > 0 && mostRecentB > 0) {
          return mostRecentB - mostRecentA; // More recent first
        }

        // 7. Contacts with history come before those without
        if (mostRecentA > 0 && mostRecentB === 0) return -1;
        if (mostRecentA === 0 && mostRecentB > 0) return 1;

        // 8. Finally, sort alphabetically by name as last resort
        return (a.displayName || '').localeCompare(b.displayName || '');
      })
      .map(
        (contact): Option => ({
          icon: (
            <RecipientAvatar
              className="h-full w-full shrink-0"
              key={contact.emailAddress}
              recipient={{ email: contact.emailAddress, name: contact.displayName }}
            />
          ),
          value: `${contact.emailAddress}`,
          label: `${ellipsisString(contact.displayName)} (${ellipsisEmailString(contact.emailAddress)})`
        })
      );

    setOptions(contactOptions);
  }, [contacts]);

  useEffect(() => {
    const selectedContactObjects = selectedContacts.map((option) => {
      return contacts.find((contact) => contact.emailAddress === option.value) as Contact;
    });
    onSelectionChange(selectedContactObjects);
  }, [selectedContacts, contacts, onSelectionChange]);

  const handleSearchSync = (value: string): Option[] => {
    if (!value) return options;

    const searchTerm = value.toLowerCase().trim();

    // Split search term into individual words for multi-word search
    const searchWords = searchTerm.split(/\s+/).filter((word) => word.length > 0);

    return options.filter((option) => {
      // Get the original contact for more comprehensive search
      const contact = contacts.find((c) => c.emailAddress === option.value);

      if (!contact) {
        // Fallback to label search if contact not found
        return option.label.toLowerCase().includes(searchTerm);
      }

      // Search through multiple contact fields
      const searchableFields = [
        contact.displayName || '',
        contact.emailAddress || '',
        option.label || ''
        // Add any other contact fields you want to search through
        // contact.firstName || '',
        // contact.lastName || '',
        // contact.company || '',
      ];

      const combinedText = searchableFields.join(' ').toLowerCase();
      const result = searchWords.every((word) => combinedText.includes(word));

      // Check if all search words are found in the combined text
      // This allows for flexible multi-word matching
      return result;
    });
  };

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const validateCreatable = (value: string): boolean => {
    // Ensure the value is a valid email and not in the forbiddenInputs array
    return validateEmail(value) && !forbiddenInputs.includes(value);
  };
  const handleBadgeClick = (option: Option) => {
    setActiveContacts((prev) => {
      if (prev.find((contact) => contact.value === option.value)) {
        return prev.filter((contact) => contact.value !== option.value);
      } else {
        return [...prev, option];
      }
    });
  };

  const CustomBadge = (
    option: Option,
    handleUnSelect: (option: Option) => void,
    activeValue?: Option[],
    disabled?: boolean
  ) => {
    const isNewAttendee = !originalAttendees.some((orig) => orig.value === option.value);
    const badge = (
      <Badge
        key={option.value}
        variant="outline"
        className={cn(
          'data-[disabled]:bg-muted-foreground data-[disabled]:text-muted',
          'px-3 py-1',
          option.icon && 'pl-1',
          activeValue &&
            activeValue.find((active) => active.value === option.value) &&
            'border-2 border-primary/80 ring-2 ring-primary/20',
          badgeClassName
        )}
        data-fixed={option.fixed}
        data-disabled={disabled}
      >
        {option.icon && <span className="mr-2 h-6 w-6">{option.icon}</span>}
        <div className="max-w-64 overflow-hidden text-ellipsis">
          <span className="whitespace-nowrap">{option.label}</span>
        </div>
        {isNewAttendee && <div className="ml-1 h-2 w-2 rounded-full bg-accent" />}
        {!option.fixed && (
          <button
            className="ml-1 rounded-full outline-none ring-offset-background"
            onClick={() => {
              handleUnSelect(option);
            }}
          >
            <MonoIcon type={'X'} className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </Badge>
    );

    if (disableProfileDropdown) return badge;

    return (
      <ContactProfileDropdown
        key={option.value}
        onOpenChange={(open) => {
          setActiveContacts((prev) => {
            if (open) {
              if (!prev.find((o) => o.value === option.value)) {
                return [...prev, option];
              }
              return prev;
            } else {
              return prev.filter((o) => o.value !== option.value);
            }
          });
        }}
        value={option.value}
      >
        {badge}
      </ContactProfileDropdown>
    );
  };

  return (
    <MultipleSelector
      className={cn('', className)}
      value={selectedContacts}
      onChange={setSelectedContacts}
      options={options}
      onSearchSync={handleSearchSync}
      maxSelected={10}
      // hideOnEmpty
      creatable
      // minLetters={1}
      hideClearAllButton
      activeValue={activeContacts}
      onBadgeClick={handleBadgeClick}
      emptyIndicator={<span>No result</span>}
      CustomBadge={CustomBadge}
      placeholder="user@example.com"
      validateCreatable={validateCreatable}
      validationMessage="Please enter a valid email"
      {...props}
    />
  );
};

export default ParticipantSuggestionInput;
