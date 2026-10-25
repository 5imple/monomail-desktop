import calendarApi from '@/main/api/calendar/calendarApi';
import { MonoMeeting, MonoMeetingResponse } from '@/main/models/message/meeting';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { MonoRecipient } from '@/main/models/types';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { formatMeetingWhen, personLabel } from '@/renderer/app/lib/meetingText';
import { cn } from '@/renderer/app/lib/utils';
import { threadsMapAtom } from '@/renderer/app/store/thread/atoms';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import {
  answerFromThread,
  DECLINE_HOLD_MS,
  isMeetingGoneError,
  planRsvpClick,
  rememberAnswer,
  shownResponse,
  type MeetingAnswer
} from '@/renderer/app/lib/meetingRsvp';
import { atom, useAtom, useAtomValue, useStore } from 'jotai';
import { atomWithStorage, selectAtom } from 'jotai/utils';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Attendees named before "+N more" (CalendarEventCard uses the same cut-off).
const ATTENDEE_PREVIEW = 5;

// The answers sent from this device, by account and message: after a decline
// Outlook removes the meeting, and this is what still says "You declined".
const meetingAnswersAtom = atomWithStorage<
  Record<string, { response: MonoMeetingResponse; at: number }>
>('global:meeting:answers', {}, undefined, { getOnInit: true });

// Responses on their way, by account and message. Outside the card: leaving
// the email sends a held decline, and a card opened again meanwhile must show
// it as being sent, not as an invitation still to answer.
const meetingSendingAtom = atom<Record<string, MeetingAnswer>>({});

// Invitations Graph reported gone from the calendar (declined or deleted in
// Outlook) though the email still points at the meeting: every card for them,
// including one opened again, shows what's known instead of live buttons.
const meetingGoneAtom = atom<Record<string, true>>({});

interface MeetingCardProps {
  meeting: MonoMeeting;
  accountId: string;
  threadId: string;
  messageId: string;
  // Who sent the message: the organizer of an invitation, the attendee of a reply.
  sender: MonoRecipient;
  // The message was sent from this mailbox (a reply the user sent, an invitation
  // the user organized).
  fromSelf: boolean;
  // The user's addresses: their own replies in the conversation say what they
  // answered once Outlook has removed a declined meeting.
  ownEmails: string[];
}

const RESPONSE_ICON: Record<
  MonoMeetingResponse,
  'CheckCircle' | 'XCircle' | 'HelpCircle' | 'Calendar'
> = {
  organizer: 'Calendar',
  accepted: 'CheckCircle',
  tentative: 'HelpCircle',
  declined: 'XCircle',
  none: 'Calendar'
};

const RESPONSE_TONE: Record<MonoMeetingResponse, string> = {
  organizer: 'text-muted-foreground',
  accepted: 'text-green-600 dark:text-green-400',
  tentative: 'text-amber-600 dark:text-amber-400',
  declined: 'text-destructive',
  none: 'text-muted-foreground'
};

/**
 * The meeting an email is about, shown in place of its (usually empty) body:
 * an invitation with Accept / Tentative / Decline, a cancellation, or an
 * attendee's reply. Outlook sends these as event messages whose text is the
 * meeting itself, so without this the reader showed a blank sheet.
 */
export const MeetingCard: React.FC<MeetingCardProps> = ({
  meeting,
  accountId,
  threadId,
  messageId,
  sender,
  fromSelf,
  ownEmails
}) => {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const { updateThread } = useThreadOperationAtom();
  const [answers, setAnswers] = useAtom(meetingAnswersAtom);
  const answerKey = `${accountId}:${messageId}`;
  // Graph said the meeting is gone (declined or deleted elsewhere) though this
  // copy of the email still points at it.
  const [goneByKey, setGoneByKey] = useAtom(meetingGoneAtom);
  const hasEvent = !!meeting.eventId && !goneByKey[answerKey];
  const [sendingByKey, setSendingByKey] = useAtom(meetingSendingAtom);
  const sending: MonoMeetingResponse | null = sendingByKey[answerKey] ?? null;
  const remembered = answers[answerKey];
  const thread = useAtomValue(
    useMemo(() => selectAtom(threadsMapAtom, (map) => map[threadId]), [threadId])
  );
  const ownEmailsKey = ownEmails.join(',');
  const inThread = useMemo(() => {
    const invite = thread?.items.find((item) => item.id === messageId);
    if (!thread || !invite) return null;
    return answerFromThread(
      thread.items as unknown as Parameters<typeof answerFromThread>[0],
      { id: messageId, timestamp: invite.timestamp, start: meeting.start },
      ownEmails
    );
  }, [thread, messageId, ownEmailsKey, meeting.start]);
  // What Outlook has (the last answer that went through), and what is shown:
  // they differ while a decline is held or a response is on its way.
  const [confirmed, setConfirmed] = useState<MonoMeetingResponse>(() =>
    shownResponse(meeting.myResponse, hasEvent, remembered, inThread)
  );
  const [response, setResponse] = useState<MonoMeetingResponse>(() => sending ?? confirmed);
  const [declineHeld, setDeclineHeld] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A fresh copy of the meeting (a refresh, a change made in Outlook, a reply
  // in the conversation) moves the answer. Not while one is being given here;
  // once that's over, whatever arrived meanwhile is applied.
  useEffect(() => {
    if (sending || declineHeld) return;
    const next = shownResponse(meeting.myResponse, hasEvent, remembered, inThread);
    setConfirmed(next);
    setResponse(next);
  }, [
    meeting.myResponse,
    hasEvent,
    inThread?.response,
    inThread?.at,
    remembered?.response,
    remembered?.at,
    sending,
    declineHeld
  ]);
  const [showAllAttendees, setShowAllAttendees] = useState(false);

  const when = formatMeetingWhen(
    meeting.start,
    meeting.end,
    meeting.isAllDay,
    t('meeting_card.all_day', { defaultValue: 'All day' }),
    i18n.language
  );
  const proposed =
    meeting.proposedStart &&
    formatMeetingWhen(
      meeting.proposedStart,
      meeting.proposedEnd,
      false,
      t('meeting_card.all_day', { defaultValue: 'All day' }),
      i18n.language
    );

  const senderName = personLabel(sender);
  const headline = (() => {
    switch (meeting.kind) {
      case 'cancelled':
        return t('meeting_card.cancelled', { defaultValue: 'Meeting canceled' });
      case 'accepted':
        return t('meeting_card.accepted_by', {
          defaultValue: '{{name}} accepted',
          name: senderName
        });
      case 'tentative':
        return t('meeting_card.tentative_by', {
          defaultValue: '{{name}} tentatively accepted',
          name: senderName
        });
      case 'declined':
        return t('meeting_card.declined_by', {
          defaultValue: '{{name}} declined',
          name: senderName
        });
      default:
        return t('meeting_card.invitation', { defaultValue: 'Meeting invitation' });
    }
  })();

  const yourResponse = (() => {
    if (fromSelf && meeting.kind === 'request') {
      return t('meeting_card.you_organizer', { defaultValue: 'You organized this meeting' });
    }
    switch (response) {
      case 'organizer':
        return t('meeting_card.you_organizer', { defaultValue: 'You organized this meeting' });
      case 'accepted':
        return t('meeting_card.you_accepted', { defaultValue: 'You accepted' });
      case 'tentative':
        return t('meeting_card.you_tentative', { defaultValue: 'You tentatively accepted' });
      case 'declined':
        return t('meeting_card.you_declined', { defaultValue: 'You declined' });
      default:
        return meeting.kind === 'request' && !meeting.isCancelled
          ? t('meeting_card.no_response', { defaultValue: "You haven't responded" })
          : null;
    }
  })();

  // Only an invitation still on the calendar, addressed to this mailbox, takes
  // an answer here. A reply someone sent us, a cancellation, or an invitation we
  // organized does not.
  const canRespond =
    meeting.kind === 'request' &&
    !fromSelf &&
    !meeting.isCancelled &&
    !meeting.isOutOfDate &&
    response !== 'organizer';
  // Declined and no longer on the calendar, or declined from this device (Outlook
  // removes it, even if the copy shown is from before): it can't be changed.
  const declinedForGood =
    confirmed === 'declined' && (!hasEvent || remembered?.response === 'declined');

  const persistResponse = async (next: MonoMeetingResponse) => {
    const thread = store.get(threadsMapAtom)[threadId];
    if (!thread) return;
    const items = thread.items.map((item) =>
      item.type === 'message' && item.id === messageId
        ? new MonoMessage({
            ...(item as MonoMessage).toPlainObject(),
            meeting: { ...meeting, myResponse: next }
          })
        : item
    );
    await updateThread(accountId, new MonoThread({ ...thread.toPlainObject(), items }));
  };

  const send = async (next: MeetingAnswer, previous: MonoMeetingResponse) => {
    if (!meeting.eventId) return;
    setSendingByKey((current) => ({ ...current, [answerKey]: next }));
    setResponse(next);
    try {
      await calendarApi.sendEventRsvp({
        calendarId: 'primary',
        eventId: meeting.eventId,
        responseStatus: next,
        sendNotifications: true,
        uid: accountId
      });
      setConfirmed(next);
      setAnswers((current) => rememberAnswer(current, answerKey, next, Date.now()));
      toast.success(
        t('meeting_card.rsvp_sent', { defaultValue: 'Response sent to the organizer' })
      );
      void persistResponse(next).catch(() => undefined);
    } catch (error) {
      console.error('[MeetingCard] RSVP failed:', error);
      setResponse(previous);
      if (isMeetingGoneError(error)) {
        // Declined or deleted elsewhere: show what's known instead of an
        // invitation that can't be answered.
        setGoneByKey((current) => ({ ...current, [answerKey]: true }));
        toast.error(
          t('meeting_card.gone_error', {
            defaultValue:
              'This meeting is no longer on your calendar. It may have been declined or deleted in Outlook.'
          })
        );
      } else {
        toast.error(
          t('calendar_event.toast.rsvp_error', { defaultValue: 'Could not send your response' })
        );
      }
    } finally {
      setSendingByKey((current) => {
        const { [answerKey]: _done, ...rest } = current;
        return rest;
      });
    }
  };

  // A held decline goes out when its time is up, or right away when the email
  // is left or the app closes: leaving must not lose the answer.
  const sendHeldDeclineRef = useRef<() => void>(() => undefined);
  sendHeldDeclineRef.current = () => {
    if (!holdTimerRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setDeclineHeld(false);
    void send('declined', confirmed);
  };
  useEffect(() => {
    const flush = () => sendHeldDeclineRef.current();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const undoHeldDecline = () => {
    dropHeldDecline();
    setResponse(confirmed);
  };

  const dropHeldDecline = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setDeclineHeld(false);
  };

  const respond = (next: MeetingAnswer) => {
    const plan = planRsvpClick(next, {
      shown: response,
      confirmed,
      declineHeld,
      sending: !!sending
    });
    switch (plan.kind) {
      case 'ignore':
        return;
      case 'restore':
        undoHeldDecline();
        return;
      case 'hold-decline':
        setResponse('declined');
        setDeclineHeld(true);
        holdTimerRef.current = setTimeout(() => sendHeldDeclineRef.current(), DECLINE_HOLD_MS);
        return;
      case 'send':
        dropHeldDecline();
        void send(next, confirmed);
    }
  };

  const attendees = meeting.attendees;
  const shownAttendees = showAllAttendees ? attendees : attendees.slice(0, ATTENDEE_PREVIEW);
  const hiddenAttendees = attendees.length - shownAttendees.length;

  const statusIcon = meeting.isCancelled ? 'XCircle' : RESPONSE_ICON[response];
  const statusTone = meeting.isCancelled ? 'text-destructive' : RESPONSE_TONE[response];

  return (
    <section
      aria-label={headline}
      className="rounded-lg border border-foreground/[0.08] bg-card p-4 text-sm text-foreground"
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0 rounded-md bg-muted p-2', statusTone)}>
          <MonoIcon type={statusIcon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">{headline}</div>
          <h3 className="mt-0.5 truncate text-base font-medium">{meeting.subject || '—'}</h3>

          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">
              {t('meeting_card.when', { defaultValue: 'When' })}
            </dt>
            <dd className={cn(meeting.isCancelled && 'line-through decoration-foreground/40')}>
              {when ? (
                <>
                  <div>{when.date}</div>
                  <div className="text-muted-foreground">{when.time}</div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {t('meeting_card.time_unknown', { defaultValue: 'Time not available' })}
                </span>
              )}
            </dd>
            {proposed && (
              <>
                <dt className="text-muted-foreground">
                  {t('meeting_card.proposed_time', { defaultValue: 'Proposed new time' })}
                </dt>
                <dd>
                  <div>{proposed.date}</div>
                  <div className="text-muted-foreground">{proposed.time}</div>
                </dd>
              </>
            )}
            {meeting.location && (
              <>
                <dt className="text-muted-foreground">
                  {t('meeting_card.where', { defaultValue: 'Where' })}
                </dt>
                <dd className="break-words">{meeting.location}</dd>
              </>
            )}
            {meeting.organizer && (
              <>
                <dt className="text-muted-foreground">
                  {t('meeting_card.organizer', { defaultValue: 'Organizer' })}
                </dt>
                <dd className="truncate" title={meeting.organizer.email}>
                  {personLabel(meeting.organizer)}
                </dd>
              </>
            )}
            {attendees.length > 0 && (
              <>
                <dt className="text-muted-foreground">
                  {t('meeting_card.attendees', { defaultValue: 'Attendees' })}
                </dt>
                <dd className="flex flex-wrap gap-x-2 gap-y-1">
                  {shownAttendees.map((attendee) => (
                    <span
                      key={attendee.email}
                      className="inline-flex items-center gap-1"
                      title={attendee.email}
                    >
                      {attendee.response !== 'none' && attendee.response !== 'organizer' && (
                        <MonoIcon
                          type={RESPONSE_ICON[attendee.response]}
                          className={cn('h-3.5 w-3.5', RESPONSE_TONE[attendee.response])}
                        />
                      )}
                      {personLabel(attendee)}
                    </span>
                  ))}
                  {hiddenAttendees > 0 && (
                    <Button
                      type="button"
                      variant="link"
                      typeVariant="inline"
                      className="h-auto p-0 text-sm"
                      onClick={() => setShowAllAttendees(true)}
                    >
                      {t('calendar_card.more_attendees', {
                        defaultValue: '+{{count}} more',
                        count: hiddenAttendees
                      })}
                    </Button>
                  )}
                  {showAllAttendees && attendees.length > ATTENDEE_PREVIEW && (
                    <Button
                      type="button"
                      variant="link"
                      typeVariant="inline"
                      className="h-auto p-0 text-sm"
                      onClick={() => setShowAllAttendees(false)}
                    >
                      {t('calendar_card.show_fewer', { defaultValue: 'Show fewer' })}
                    </Button>
                  )}
                </dd>
              </>
            )}
          </dl>

          {meeting.isOutOfDate && !meeting.isCancelled && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('meeting_card.out_of_date', {
                defaultValue: 'A newer version of this invitation has been sent.'
              })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canRespond && (hasEvent || declinedForGood) && (
              <div
                role="group"
                aria-label={t('meeting_card.your_answer', { defaultValue: 'Your answer' })}
                className="flex flex-wrap items-center gap-2"
              >
                {(['accepted', 'tentative', 'declined'] as const).map((answer) => (
                  <RsvpButton
                    key={answer}
                    active={response === answer}
                    busy={sending === answer}
                    disabled={!!sending || (declinedForGood && answer !== 'declined')}
                    tone={answer}
                    label={
                      answer === 'accepted'
                        ? t('meeting_card.accept', { defaultValue: 'Accept' })
                        : answer === 'tentative'
                          ? t('meeting_card.tentative', { defaultValue: 'Tentative' })
                          : t('meeting_card.decline', { defaultValue: 'Decline' })
                    }
                    onClick={() => respond(answer)}
                  />
                ))}
              </div>
            )}
            {canRespond && !hasEvent && !declinedForGood && (
              <span className="text-xs text-muted-foreground">
                {t('meeting_card.no_event', {
                  defaultValue: 'This meeting is no longer on your calendar.'
                })}
              </span>
            )}
            {meeting.joinUrl && !meeting.isCancelled && (
              <Button type="button" sizeVariant="sm" variant="secondary" asChild>
                <a href={meeting.joinUrl} target="_blank" rel="noreferrer noopener">
                  <MonoIcon type="ExternalLink" className="mr-1.5 h-3.5 w-3.5" />
                  {t('meeting_card.join', { defaultValue: 'Join meeting' })}
                </a>
              </Button>
            )}
            {yourResponse && !declineHeld && (
              <span className={cn('ml-auto text-xs', statusTone)} aria-live="polite">
                {yourResponse}
              </span>
            )}
          </div>

          {/* What a click on the answers does now, in one line under them. */}
          {canRespond && declineHeld && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span aria-live="polite">
                {t('meeting_card.decline_held', {
                  defaultValue:
                    'Declining in a few seconds. Once sent, Outlook removes the meeting from your calendar and it can’t be changed.'
                })}
              </span>
              <Button
                type="button"
                variant="link"
                typeVariant="inline"
                className="h-auto p-0 text-xs"
                onClick={undoHeldDecline}
              >
                {t('common.undo', 'Undo')}
              </Button>
            </p>
          )}
          {canRespond &&
            hasEvent &&
            !declinedForGood &&
            !declineHeld &&
            !sending &&
            response !== 'none' && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('meeting_card.change_hint', {
                  defaultValue: 'Changed your mind? Pick another answer.'
                })}
              </p>
            )}
          {canRespond && declinedForGood && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('meeting_card.declined_final', {
                defaultValue:
                  'Outlook removed this meeting from your calendar when you declined. To go after all, ask the organizer to send the invitation again.'
              })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

const TONE_ACTIVE: Record<'accepted' | 'tentative' | 'declined', string> = {
  accepted:
    'border-green-600/40 bg-green-600/10 text-green-700 dark:border-green-400/40 dark:text-green-300',
  tentative:
    'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:border-amber-400/40 dark:text-amber-300',
  declined: 'border-destructive/40 bg-destructive/10 text-destructive'
};

// The chosen answer carries a mark, not only a color.
const ACTIVE_ICON: Record<'accepted' | 'tentative' | 'declined', 'Check' | 'HelpCircle' | 'X'> = {
  accepted: 'Check',
  tentative: 'HelpCircle',
  declined: 'X'
};

const RsvpButton: React.FC<{
  active: boolean;
  busy: boolean;
  disabled: boolean;
  tone: 'accepted' | 'tentative' | 'declined';
  label: string;
  onClick: () => void;
}> = ({ active, busy, disabled, tone, label, onClick }) => (
  <Button
    type="button"
    sizeVariant="sm"
    variant={active ? 'outline' : 'secondary'}
    aria-pressed={active}
    disabled={disabled}
    className={cn(active && TONE_ACTIVE[tone])}
    onClick={onClick}
  >
    {busy ? (
      <MonoIcon type="Loader2" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
    ) : active ? (
      <MonoIcon type={ACTIVE_ICON[tone]} className="mr-1.5 h-3.5 w-3.5" />
    ) : null}
    {label}
  </Button>
);

export default MeetingCard;
