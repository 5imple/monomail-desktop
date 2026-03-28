import MonoIcon from '@/renderer/app/components/icons/icons';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import MultipleSelector, {
  MultipleSelectorProps,
  Option
} from '@/renderer/app/components/ui/multi-selector';
import { Contact } from '@/renderer/app/lib/db/contact';
import { ellipsisEmailString, ellipsisString } from '@/renderer/app/lib/minimizeEmail';
import { cn } from '@/renderer/app/lib/utils';
import React, { useEffect, useMemo, useState } from 'react';
// Legacy AttendeeDraftChange removed - using simpler approach
type AttendeeDraftChange = {
  type: 'added' | 'removed';
  email: string;
  name?: string;
  responseStatus?: string;
};

type Organizer = { name?: string; email: string };

interface ParticipantListInputProps
  extends Omit<MultipleSelectorProps, 'CustomBadge' | 'placeholder'> {
  className?: string;
  contacts: Contact[];
  organizer: Organizer;
  originalAttendees?: Option[];
  placeholder?: string;
  attendeeChanges?: AttendeeDraftChange[]; // Draft changes to show removed attendees
  showDraftChanges?: boolean; // Whether to show draft mode with strikethrough
  onRemoveAttendee?: (email: string) => void; // Custom remove handler for draft mode
  onReAddAttendee?: (email: string) => void; // Custom re-add handler for draft mode
}

const ParticipantListInput: React.FC<ParticipantListInputProps> = ({
  className,
  contacts,
  organizer,
  value = [],
  onChange,
  originalAttendees = [],
  placeholder = 'Add attendee',
  attendeeChanges = [],
  showDraftChanges = false,
  onRemoveAttendee,
  onReAddAttendee,
  ...props
}) => {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    const uniqueContacts = new Map<string, Contact>();

    contacts.forEach((contact) => {
      if (!uniqueContacts.has(contact.emailAddress)) {
        uniqueContacts.set(contact.emailAddress, contact);
      }
    });

    const contactOptions = Array.from(uniqueContacts.values())
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
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
        if (mostRecentA > 0 && mostRecentB > 0) return mostRecentB - mostRecentA;
        if (mostRecentA > 0 && mostRecentB === 0) return -1;
        if (mostRecentA === 0 && mostRecentB > 0) return 1;
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

  const handleSearchSync = (search: string): Option[] => {
    if (!search) return options;
    const searchTerm = search.toLowerCase().trim();
    const words = searchTerm.split(/\s+/).filter((w) => w.length > 0);
    return options.filter((option) => {
      const contact = contacts.find((c) => c.emailAddress === option.value);
      if (!contact) return option.label.toLowerCase().includes(searchTerm);
      const searchable = [
        contact.displayName || '',
        contact.emailAddress || '',
        option.label || ''
      ].join(' ');
      const combined = searchable.toLowerCase();
      return words.every((w) => combined.includes(w));
    });
  };

  const validateEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const listItems = useMemo(() => {
    // Get emails of removed attendees for display logic
    const removedEmails = new Set(
      attendeeChanges
        .filter((change) => change.type === 'removed')
        .map((change) => change.email.toLowerCase())
    );

    // Current attendees - check if they're marked as removed
    const currentItems = value.map((opt) => {
      const email = opt.value;
      const matched = contacts.find((c) => c.emailAddress === email);
      const displayName = matched?.displayName || email.split('@')[0] || email;
      const isNew = !originalAttendees.some((o) => o.value === opt.value);
      const status = (opt as unknown as { responseStatus?: string }).responseStatus;

      // Check if this attendee is marked as removed in draft changes
      const isRemoved = showDraftChanges && removedEmails.has(email.toLowerCase());

      const renderStatusIcon = () => {
        if (!status) return null;
        const iconClass = isRemoved ? 'h-4 w-4 opacity-50' : 'h-4 w-4';
        if (status === 'accepted')
          return <MonoIcon type="CheckCircle" className={`${iconClass} text-primary`} />;
        if (status === 'declined')
          return <MonoIcon type="XCircle" className={`${iconClass} text-destructive`} />;
        if (status === 'tentative')
          return <MonoIcon type="AlertCircle" className={`${iconClass} text-muted-foreground`} />;
        if (status === 'needsAction')
          return <MonoIcon type="Clock" className={`${iconClass} text-muted-foreground`} />;
        return null;
      };

      return (
        <div
          key={email}
          className={`flex items-center gap-4 py-1 ${isRemoved ? 'opacity-60' : ''}`}
        >
          <div className={`h-6 w-6 overflow-hidden rounded-full ${isRemoved ? 'opacity-50' : ''}`}>
            <RecipientAvatar className="h-full w-full" recipient={{ email, name: displayName }} />
          </div>
          <div className="flex-1">
            <div className={`text-sm ${isRemoved ? 'text-muted-foreground line-through' : ''}`}>
              {ellipsisEmailString(email)}
            </div>
          </div>
          {!isNew && renderStatusIcon()}
          {isNew && !isRemoved && <div className="h-2 w-2 rounded-full bg-accent" />}
          {isRemoved && <div className="text-xs text-muted-foreground">Removed</div>}
          <button
            className="ml-2 rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (isRemoved) {
                // Use the dedicated re-add handler if available
                if (onReAddAttendee) {
                  onReAddAttendee(email);
                } else {
                  // Fallback: re-add through onChange
                  const attendeeOption: Option = {
                    value: email,
                    label: `${displayName} (${ellipsisEmailString(email)})`,
                    icon: (
                      <RecipientAvatar
                        className="h-full w-full shrink-0"
                        recipient={{ email, name: displayName }}
                      />
                    )
                  };

                  const updatedValue = value.map((v) => (v.value === email ? attendeeOption : v));
                  onChange?.(updatedValue);
                }
              } else if (onRemoveAttendee && showDraftChanges) {
                // Use custom handler for draft mode
                onRemoveAttendee(email);
              } else {
                // Default behavior: immediate removal
                onChange?.(value.filter((v) => v.value !== email));
              }
            }}
            aria-label={isRemoved ? 'Re-add attendee' : 'Remove attendee'}
          >
            <MonoIcon type={isRemoved ? 'Plus' : 'X'} className="h-3 w-3" />
          </button>
        </div>
      );
    });

    return [...currentItems];
  }, [
    contacts,
    onChange,
    originalAttendees,
    value,
    attendeeChanges,
    showDraftChanges,
    onRemoveAttendee
  ]);

  const HiddenBadge = () => null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Organizer */}
      <div className="flex items-center gap-4">
        <div className="h-6 w-6 overflow-hidden rounded-full">
          <RecipientAvatar
            className="h-full w-full"
            recipient={{ email: organizer.email, name: organizer.name || organizer.email }}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-sm font-medium">{organizer.name || organizer.email}</div>
          <div className="text-xs text-muted-foreground">Organizer</div>
        </div>
      </div>

      {/* Selected attendees list */}
      {value.length > 0 && <div className="space-y-2 pt-1">{listItems}</div>}

      {/* Suggestion input */}
      <MultipleSelector
        {...props}
        className="border-none hover:bg-muted"
        value={value}
        onChange={(opts) => {
          // When MultipleSelector changes (add/remove), we need to handle this properly
          // If in draft mode and an original attendee was removed, we should use the custom handler
          if (showDraftChanges && onRemoveAttendee && value.length > opts.length) {
            // Something was removed, find what was removed
            const removedItems = value.filter((v) => !opts.some((o) => o.value === v.value));
            for (const removedItem of removedItems) {
              const wasOriginal = originalAttendees.some(
                (orig) => orig.value === removedItem.value
              );
              if (wasOriginal) {
                // Use custom handler for original attendees
                onRemoveAttendee(removedItem.value);
                // Don't call the regular onChange for this removal
                return;
              }
            }
          }
          // For additions or removal of newly added attendees, use normal flow
          onChange?.(opts);
        }}
        options={options}
        onSearchSync={handleSearchSync}
        maxSelected={10}
        creatable
        hideClearAllButton
        CustomBadge={HiddenBadge}
        placeholder={placeholder}
        validateCreatable={(v) => validateEmail(v)}
        validationMessage="Please enter a valid email"
        triggerSearchOnFocus
      />
    </div>
  );
};

export default ParticipantListInput;
