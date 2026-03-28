// icsParser.ts
import ICAL from 'ical.js';

export interface ICalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  created?: Date;
  lastModified?: Date;
  status?: string;
  organizer?: {
    name?: string;
    email?: string;
  };
  attendees?: Array<{
    name?: string;
    email: string;
    role?: string;
    status?: string;
  }>;
  recurrence?: string;
  allDay: boolean;
}

/**
 * Parse ICS file content and extract event details
 */
export function parseICS(icsContent: string): ICalendarEvent {
  try {
    // Parse the ICS content using ical.js
    const jcalData = ICAL.parse(icsContent);
    const component = new ICAL.Component(jcalData);
    const vevent = component.getFirstSubcomponent('vevent');

    if (!vevent) {
      console.warn('No VEVENT found in ICS content');
      return createDefaultEvent();
    }

    // Extract event properties with proper type handling
    const event: Partial<ICalendarEvent> = {
      uid: String(vevent.getFirstPropertyValue('uid') || generateRandomUid()),
      summary: String(vevent.getFirstPropertyValue('summary') || 'Untitled Event'),
      description: vevent.getFirstPropertyValue('description')
        ? String(vevent.getFirstPropertyValue('description'))
        : '',
      location: vevent.getFirstPropertyValue('location')
        ? String(vevent.getFirstPropertyValue('location'))
        : '',
      allDay: false
    };

    // Parse dates
    const dtstart = vevent.getFirstProperty('dtstart');
    if (dtstart) {
      try {
        const dtStartValue = dtstart.getFirstValue();
        if (dtStartValue instanceof ICAL.Time) {
          const startDate = dtStartValue.toJSDate();
          event.start = startDate;

          // Check if it's an all-day event (no time component)
          event.allDay = dtStartValue.isDate;
        } else {
          console.error('Start date is not an ICAL.Time instance');
          event.start = new Date(); // Fallback
        }
      } catch (error) {
        console.error('Error parsing start date:', error);
        event.start = new Date(); // Fallback
      }
    } else {
      event.start = new Date(); // Fallback if no start date
    }

    // Parse end date
    const dtend = vevent.getFirstProperty('dtend');
    if (dtend) {
      try {
        const dtEndValue = dtend.getFirstValue();
        if (dtEndValue instanceof ICAL.Time) {
          event.end = dtEndValue.toJSDate();
        }
      } catch (error) {
        console.error('Error parsing end date:', error);
        // End date will be set as a fallback later
      }
    }

    // Parse created date
    const created = vevent.getFirstProperty('created');
    if (created) {
      try {
        const createdValue = created.getFirstValue();
        if (createdValue instanceof ICAL.Time) {
          event.created = createdValue.toJSDate();
        }
      } catch (error) {
        console.error('Error parsing created date:', error);
      }
    }

    // Parse last modified date
    const lastModified = vevent.getFirstProperty('last-modified');
    if (lastModified) {
      try {
        const lastModifiedValue = lastModified.getFirstValue();
        if (lastModifiedValue instanceof ICAL.Time) {
          event.lastModified = lastModifiedValue.toJSDate();
        }
      } catch (error) {
        console.error('Error parsing last modified date:', error);
      }
    }

    // Parse organizer
    const organizer = vevent.getFirstProperty('organizer');
    if (organizer) {
      const parameter = organizer.getParameter('cn');
      const orgEmail = organizer.getFirstValue();

      event.organizer = {
        name: parameter ? String(parameter) : undefined,
        email: typeof orgEmail === 'string' ? orgEmail.replace('mailto:', '') : ''
      };
    }

    // Parse attendees
    const attendees = vevent.getAllProperties('attendee');
    if (attendees.length > 0) {
      event.attendees = attendees.map((attendee) => {
        const nameParam = attendee.getParameter('cn');
        const roleParam = attendee.getParameter('role');
        const statusParam = attendee.getParameter('partstat');
        const attendeeValue = attendee.getFirstValue();

        return {
          name: nameParam ? String(nameParam) : undefined,
          email: typeof attendeeValue === 'string' ? attendeeValue.replace('mailto:', '') : '',
          role: roleParam ? String(roleParam) : undefined,
          status: statusParam ? String(statusParam) : undefined
        };
      });
    }

    // Parse status
    const statusValue = vevent.getFirstPropertyValue('status');
    if (statusValue !== null) {
      event.status = String(statusValue);
    }

    // Parse recurrence
    const rrule = vevent.getFirstProperty('rrule');
    if (rrule) {
      event.recurrence = rrule.toICALString();
    }

    // Ensure we have a valid end date (default to start + 1 hour)
    if (!event.end || !(event.end instanceof Date) || isNaN(event.end.getTime())) {
      console.warn('Invalid or missing end date, using start + 1 hour');
      if (event.start) {
        const endDate = new Date(event.start.getTime());
        endDate.setHours(endDate.getHours() + 1);
        event.end = endDate;
      }
    }

    return event as ICalendarEvent;
  } catch (error) {
    console.error('Error parsing ICS content:', error);
    return createDefaultEvent();
  }
}

/**
 * Create a default event when parsing fails
 */
function createDefaultEvent(): ICalendarEvent {
  return {
    uid: generateRandomUid(),
    summary: 'Calendar Event',
    allDay: false,
    start: new Date()
  };
}

/**
 * Generate a random UID for events
 */
function generateRandomUid(): string {
  return `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function isCalendarAttachment(attachment: any): boolean {
  if (!attachment) return false;

  // Check by MIME type
  if (attachment.mimeType === 'text/calendar' || attachment.mimeType === 'application/ics') {
    return true;
  }

  // Check by filename extension
  if (attachment.filename && attachment.filename.toLowerCase().endsWith('.ics')) {
    return true;
  }

  return false;
}
