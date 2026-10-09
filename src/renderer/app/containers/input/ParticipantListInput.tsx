import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import MultipleSelector, {
  MultipleSelectorProps,
  Option
} from '@/renderer/app/components/ui/multi-selector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { Contact } from '@/renderer/app/lib/db/contact';
import { matchesAllWords, recipientLabel } from '@/renderer/app/lib/recipientLabel';
import { cn } from '@/renderer/app/lib/utils';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
// Legacy AttendeeDraftChange removed - using simpler approach
type AttendeeDraftChange = {
  type: 'added' | 'removed';
  email: string;
  name?: string;
  responseStatus?: string;
};

type Organizer = { name?: string; email: string };

// Response icons, named — "Clock = awaiting reply" had to be guessed.
const RESPONSE_STATUS: Record<string, { icon: MonoIconType; className: string; labelKey: string }> =
  {
    accepted: {
      icon: 'CheckCircle',
      className: 'text-primary',
      labelKey: 'calendar_card.accepted'
    },
    declined: {
      icon: 'XCircle',
      className: 'text-destructive',
      labelKey: 'calendar_card.declined'
    },
    tentative: {
      icon: 'AlertCircle',
      className: 'text-muted-foreground',
      labelKey: 'calendar_card.maybe'
    },
    needsAction: {
      icon: 'Clock',
      className: 'text-muted-foreground',
      labelKey: 'calendar_card.no_response'
    }
  };

const MAX_ATTENDEES = 10;

interface ParticipantListInputProps
  extends Omit<MultipleSelectorProps, 'CustomBadge' | 'placeholder'> {
  className?: string;
  contacts: Contact[];
  // Omitted when it isn't known (an Outlook invitation lists no organizer).
  organizer?: Organizer;
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
  const { t } = useTranslation();
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
          label: recipientLabel(contact.displayName, contact.emailAddress)
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
        const response = status ? RESPONSE_STATUS[status] : undefined;
        if (!response) return null;
        const label = t(response.labelKey);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0" role="img" aria-label={label}>
                <MonoIcon type={response.icon} className={cn('h-4 w-4', response.className)} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      };

      // The name like the organizer row, with the address muted below it.
      const hasName = !!matched?.displayName && matched.displayName !== email;

      return (
        <div key={email} className={cn('flex items-center gap-4 py-1', isRemoved && 'opacity-60')}>
          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
            <RecipientAvatar className="h-full w-full" recipient={{ email, name: displayName }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className={cn('truncate text-sm', isRemoved && 'text-muted-foreground line-through')}
            >
              {hasName ? matched?.displayName : email}
            </div>
            {hasName && <div className="truncate text-xs text-muted-foreground">{email}</div>}
          </div>
          {!isNew && renderStatusIcon()}
          {isNew && !isRemoved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-selection"
                  role="img"
                  aria-label={t('calendar_event.new_attendee')}
                />
              </TooltipTrigger>
              <TooltipContent>{t('calendar_event.new_attendee')}</TooltipContent>
            </Tooltip>
          )}
          {isRemoved && (
            <div className="text-xs text-muted-foreground">{t('calendar_event.removed')}</div>
          )}
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
                    label: recipientLabel(matched?.displayName, email),
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
            aria-label={
              isRemoved ? t('calendar_event.re_add_attendee') : t('calendar_event.remove_attendee')
            }
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
    onRemoveAttendee,
    t
  ]);

  const HiddenBadge = () => null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Organizer */}
      {organizer && (
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
      )}

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
        maxSelected={MAX_ATTENDEES}
        // Silent at the cap before: an 11th pick just did nothing.
        onMaxSelected={(limit) =>
          toast(t('calendar_event.max_attendees', { count: limit }), { id: 'attendee-limit' })
        }
        creatable
        hideClearAllButton
        CustomBadge={HiddenBadge}
        placeholder={placeholder}
        validateCreatable={(v) => validateEmail(v)}
        validationMessage={t('compose_card.invalid_email')}
        commandProps={{ filter: matchesAllWords, ...props.commandProps }}
        triggerSearchOnFocus
      />
    </div>
  );
};

export default ParticipantListInput;
