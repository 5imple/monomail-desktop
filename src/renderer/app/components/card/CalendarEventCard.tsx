import React, { useState, useEffect } from 'react';
import { Button } from '@/renderer/app/components/ui/button';
import { Card, CardContent } from '@/renderer/app/components/ui/card';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { cn } from '@/renderer/app/lib/utils';
import { parseICS, ICalendarEvent } from '@/renderer/app/lib/icsParser';
import { toast } from 'sonner';
import mailApi from '@/main/api/mail/mailApi';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { MonoAttachment } from '@/main/models/types';
import calendarApi from '@/main/api/calendar/calendarApi'; // Import the new calendar API
import { Tabs, TabsList, TabsTrigger } from '@/renderer/app/components/ui/tabs';

/**
 * Extract ICS content from various response formats
 */
async function extractICSContent(response) {
  try {
    // Case: Blob object
    if (response instanceof Blob) {
      return await readBlobAsText(response);
    }

    // Case: Array containing a Blob object
    if (Array.isArray(response) && response.length > 0 && response[0] instanceof Blob) {
      return await readBlobAsText(response[0]);
    }

    // Case: String representation
    if (typeof response === 'string') {
      return response;
    }

    // Case: Object with data property
    if (response && typeof response === 'object' && response.data) {
      if (response.data instanceof Blob) {
        return await readBlobAsText(response.data);
      }
      if (typeof response.data === 'string') {
        return response.data;
      }
    }

    // Fallback: Try to convert to string
    if (response) {
      const stringVersion = String(response);
      if (stringVersion.includes('BEGIN:VCALENDAR') || stringVersion.includes('BEGIN:VEVENT')) {
        return stringVersion;
      }
    }

    throw new Error('Could not extract valid ICS content from response');
  } catch (error) {
    console.error('Error extracting ICS content:', error);
    throw error;
  }
}

/**
 * Helper function to read a Blob as text
 */
function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read Blob as text'));
    reader.readAsText(blob);
  });
}

/**
 * Helper function to validate dates
 */
function isValidDate(date: any): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Get the user's current response status to the event
 */
function getUserResponseStatus(
  event: ICalendarEvent | null,
  currentUserEmail: string | null
): string | null {
  if (!event || !currentUserEmail || !event.attendees) return null;

  // Find the current user in the attendees list
  const currentUserAttendee = event.attendees.find(
    (attendee) => attendee.email.toLowerCase() === currentUserEmail.toLowerCase()
  );

  if (!currentUserAttendee || !currentUserAttendee.status) return null;

  return currentUserAttendee.status.toUpperCase();
}

/**
 * Check if the event is relevant for the user
 * Show if:
 * 1. User is an attendee
 * 2. Event is not in the past
 */
function isRelevantEvent(event: ICalendarEvent | null, currentUserEmail: string | null): boolean {
  if (!event || !currentUserEmail || !event.attendees) return false;

  // Check if user is an attendee
  const isAttendee = event.attendees.some(
    (attendee) => attendee.email.toLowerCase() === currentUserEmail.toLowerCase()
  );

  if (!isAttendee) return false;

  return true;
  // Check if event is not in the past
  // const now = new Date();
  // return isValidDate(event.end) ? event.end > now : event.start > now;
}

/**
 * Format date and time in a user-friendly way
 */
function formatDateTime(start: Date, end: Date | undefined, allDay: boolean): string {
  if (!isValidDate(start)) return '';

  // Format date
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  const dateStr = start.toLocaleDateString(undefined, options);

  // For all-day events, just return the date
  if (allDay) return dateStr;

  // Format time
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };

  let timeStr = start.toLocaleTimeString(undefined, timeOptions);

  // Add end time if available
  if (end && isValidDate(end)) {
    timeStr += ` - ${end.toLocaleTimeString(undefined, timeOptions)}`;

    // Add timezone
    const timeZoneStr = start
      .toLocaleTimeString(undefined, { timeZoneName: 'short' })
      .split(' ')
      .pop();
    if (timeZoneStr) {
      timeStr += ` ${timeZoneStr}`;
    }
  }

  return `${dateStr}\n${timeStr}`;
}

interface CalendarEventProps {
  attachment: MonoAttachment;
  accountId: string;
  messageId: string;
}

export const CalendarEventCard: React.FC<CalendarEventProps> = ({
  attachment,
  accountId,
  messageId
}) => {
  const { getAccountByUid } = useAuth();
  const [event, setEvent] = useState<ICalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<
    'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION' | string | null
  >(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAndParseICS = async () => {
      try {
        setLoading(true);

        // Get the current user email
        const user = await getAccountByUid(accountId);
        if (!user) return;
        if (isMounted) {
          setCurrentUserEmail(user.email);
        }

        // Fetch the attachment content
        const response = await mailApi.getAttachmentDownload(
          accountId,
          messageId,
          attachment.attachmentId,
          attachment.fileName
        );

        // Extract and parse the ICS content
        const icsContent = await extractICSContent(response);
        const parsedEvent = parseICS(icsContent);

        if (isMounted && parsedEvent) {
          setEvent(parsedEvent);

          // Determine if we should show the card (if user is an attendee and event is relevant)
          const relevant = isRelevantEvent(parsedEvent, user.email);
          setShowCard(relevant);

          // Get the user's current response status
          const status = getUserResponseStatus(parsedEvent, user.email);

          setCurrentResponse((status as any) || 'NEEDS-ACTION');
        }
      } catch (err) {
        console.error('Failed to parse ICS file:', err);
        if (isMounted) {
          setError('Failed to load calendar event');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAndParseICS();

    return () => {
      isMounted = false;
    };
  }, [attachment.attachmentId, accountId, messageId]);

  const handleRsvp = async (status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | string) => {
    if (!event || !event.uid || !status) return;

    setRsvpLoading(true);
    try {
      // Update local state first for immediate feedback
      setCurrentResponse(status);

      // Map our status values to the API's expected values
      const responseStatus =
        status.toLowerCase() === 'accepted'
          ? 'accepted'
          : status.toLowerCase() === 'declined'
            ? 'declined'
            : 'tentative';

      // Call the API to update the RSVP status
      await calendarApi.sendEventRsvp({
        calendarId: 'primary', // Assuming primary calendar
        eventId: event.uid.split('@')[0],
        responseStatus,
        sendNotifications: false,
        uid: accountId
      });

      // Show success toast
      const statusMessages = {
        ACCEPTED: 'You have accepted this event',
        DECLINED: 'You have declined this event',
        TENTATIVE: 'You have tentatively accepted this event'
      };

      toast.success(statusMessages[status]);
    } catch (err) {
      console.error('RSVP error:', err);
      toast.error('Failed to update RSVP status');

      // Revert the local state if the API call fails
      const previousStatus = getUserResponseStatus(event, currentUserEmail);
      setCurrentResponse((previousStatus as any) || 'NEEDS-ACTION');
    } finally {
      setRsvpLoading(false);
    }
  };
  // Don't render anything if loading, has error, or isn't relevant
  if (
    loading ||
    error ||
    !event ||
    !showCard ||
    !(event.uid.split('@').length > 1 && event.uid.split('@')[1].includes('google'))
  ) {
    return null;
  }

  return (
    <Card className="my-2 overflow-hidden shadow-sm">
      <CardContent className="p-4">
        {/* Event Icon and Title */}
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-md">
            <MonoIcon type="GoogleCalendar" className="h-6 w-6" />
          </div>
          <div className="text-md font-medium">{event.summary || 'Calendar Event'}</div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Date and Time */}
          <div className="">
            <div className="mb-1 text-sm text-muted-foreground">Date and Time:</div>
            <div className="whitespace-pre-line text-sm">
              {formatDateTime(event.start, event.end, event.allDay)}
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="">
              <div className="mb-1 text-sm text-muted-foreground">Location:</div>
              <div className="cursor-pointer text-sm">{event.location}</div>
            </div>
          )}

          {/* Invitees */}
          <div className="">
            <div className="mb-1 text-sm text-muted-foreground">Invitees:</div>
            <div>
              {event.organizer && (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-foreground">
                    {event.organizer.name || event.organizer.email}
                  </span>
                  <span className="text-xs text-muted-foreground">– organizer</span>
                </div>
              )}

              {event.attendees &&
                event.attendees.map((attendee, idx) => {
                  // Skip the organizer as we've already shown them
                  if (event.organizer && attendee.email === event.organizer.email) {
                    return null;
                  }

                  // Check if this is the current user
                  const isCurrentUser =
                    currentUserEmail &&
                    attendee.email.toLowerCase() === currentUserEmail.toLowerCase();

                  return (
                    <div key={idx} className="flex items-center gap-1">
                      {isCurrentUser ? (
                        <>
                          <span className="text-sm">{attendee.name || attendee.email}</span>
                          <MonoIcon
                            type={
                              currentResponse === 'ACCEPTED'
                                ? 'CheckCircle'
                                : currentResponse === 'DECLINED'
                                  ? 'XCircle'
                                  : currentResponse === 'TENTATIVE'
                                    ? 'HelpCircle'
                                    : 'HelpCircle'
                            }
                            className={cn(
                              'h-4 w-4',
                              currentResponse === 'ACCEPTED' && 'text-green-600',
                              currentResponse === 'DECLINED' && 'text-red-600',
                              currentResponse === 'TENTATIVE' && 'text-amber-600'
                            )}
                          />
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-foreground">
                            {attendee.name || attendee.email}
                          </span>

                          {attendee.status && (
                            <MonoIcon
                              type={
                                attendee.status.toUpperCase() === 'ACCEPTED'
                                  ? 'CheckCircle'
                                  : attendee.status.toUpperCase() === 'DECLINED'
                                    ? 'XCircle'
                                    : attendee.status.toUpperCase() === 'TENTATIVE'
                                      ? 'HelpCircle'
                                      : 'HelpCircle'
                              }
                              className={cn(
                                'h-4 w-4',
                                attendee.status.toUpperCase() === 'ACCEPTED' && 'text-green-600',
                                attendee.status.toUpperCase() === 'DECLINED' && 'text-red-600',
                                attendee.status.toUpperCase() === 'TENTATIVE' && 'text-amber-600'
                              )}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* RSVP Buttons */}
        <div className="mt-3 flex gap-2">
          <Tabs value={currentResponse as string} onValueChange={handleRsvp}>
            <TabsList className="h-8 px-0.5">
              <TabsTrigger className="h-7" disabled={rsvpLoading} value="ACCEPTED">
                {'Yes'}
              </TabsTrigger>
              <TabsTrigger className="h-7" disabled={rsvpLoading} value="DECLINED">
                {'No'}
              </TabsTrigger>
              <TabsTrigger className="h-7" disabled={rsvpLoading} value="TENTATIVE">
                {'Maybe'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* <Button variant="outline" className="ml-2" onClick={handleAddNote}>
            Add Note...
          </Button> */}
        </div>
      </CardContent>
    </Card>
  );
};
