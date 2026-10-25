import type { MonoMeetingResponse } from '@/main/models/message/meeting';

/**
 * Answering a meeting invitation from its email (MeetingCard).
 *
 * Accept and Tentative can be changed at any time: the meeting stays on the
 * calendar. A decline can't be taken back in Outlook: it removes the meeting
 * from the calendar, and Microsoft Graph then has no meeting left to accept.
 * So a decline waits DECLINE_HOLD_MS before it is sent (or until the email is
 * left), and picking another answer meanwhile simply changes it.
 */

export type MeetingAnswer = 'accepted' | 'tentative' | 'declined';

export const DECLINE_HOLD_MS = 8000;

export type RsvpClick =
  /** Nothing to do (already the answer, or a response is on its way). */
  | { kind: 'ignore' }
  /** A held decline is dropped; the answer already sent stands. */
  | { kind: 'restore' }
  /** Show Declined now, send it after the hold. */
  | { kind: 'hold-decline' }
  /** Send this answer now (dropping a held decline first, if any). */
  | { kind: 'send' };

export function planRsvpClick(
  next: MeetingAnswer,
  state: {
    shown: MonoMeetingResponse;
    confirmed: MonoMeetingResponse;
    declineHeld: boolean;
    sending: boolean;
  }
): RsvpClick {
  if (state.sending) return { kind: 'ignore' };
  if (state.declineHeld) {
    if (next === 'declined') return { kind: 'ignore' };
    if (next === state.confirmed) return { kind: 'restore' };
    return { kind: 'send' };
  }
  if (next === state.shown) return { kind: 'ignore' };
  if (next === 'declined') return { kind: 'hold-decline' };
  return { kind: 'send' };
}

/** An answer and when it was given (ms). */
export interface TimedAnswer {
  response: MonoMeetingResponse;
  at: number;
}

/**
 * The answer to show. While the meeting is on the calendar, the calendar's
 * answer is the truth. Once it's gone (Outlook removes a declined meeting),
 * the newest of what's left: the answer sent from this device, or your own
 * reply in the conversation ("You declined", sent from here, Outlook or a
 * phone).
 */
export function shownResponse(
  calendarResponse: MonoMeetingResponse,
  hasEvent: boolean,
  remembered: TimedAnswer | undefined,
  inThread?: TimedAnswer | null
): MonoMeetingResponse {
  if (hasEvent) return calendarResponse;
  const latest = [remembered, inThread]
    .filter((a): a is TimedAnswer => !!a)
    .sort((a, b) => b.at - a.at)[0];
  return latest?.response ?? calendarResponse;
}

const ANSWER_KINDS = new Set(['accepted', 'tentative', 'declined']);

const SAME_OCCURRENCE_MS = 14 * 60 * 60 * 1000;

function sameOccurrence(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true;
  return Math.abs(ta - tb) < SAME_OCCURRENCE_MS;
}

/**
 * Your own newest reply to an invitation, from its conversation: a meeting
 * response sent from one of your addresses after the invitation arrived.
 */
export function answerFromThread(
  items: ReadonlyArray<{
    id: string;
    type?: string;
    timestamp: number;
    from?: { email?: string } | null;
    meeting?: { kind: string; start?: string | null } | null;
  }>,
  invite: { id: string; timestamp: number; start?: string | null },
  ownEmails: ReadonlyArray<string>
): TimedAnswer | null {
  const own = new Set(ownEmails.map((e) => e.trim().toLowerCase()));
  let latest: TimedAnswer | null = null;
  for (const item of items) {
    if (item.id === invite.id || (item.type && item.type !== 'message')) continue;
    const kind = item.meeting?.kind;
    if (!kind || !ANSWER_KINDS.has(kind)) continue;
    if (!own.has((item.from?.email ?? '').trim().toLowerCase())) continue;
    if (item.timestamp < invite.timestamp) continue;
    // A reply about another occurrence of a series (same conversation).
    // Within 14 hours counts as the same one: an all-day meeting’s start can
    // come back as UTC midnight from the event and as the organizer's local
    // midnight from the message.
    if (!sameOccurrence(item.meeting?.start, invite.start)) continue;
    if (!latest || item.timestamp > latest.at) {
      latest = { response: kind as MonoMeetingResponse, at: item.timestamp };
    }
  }
  return latest;
}

/**
 * Graph's answer when the meeting is no longer on the calendar (declined or
 * deleted elsewhere): 404, or 400 "does not support binding to a
 * non-calendar folder" once it's in Deleted Items.
 */
export function isMeetingGoneError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 404) return true;
  if (status !== 400) return false;
  let text = '';
  try {
    text = JSON.stringify(error);
  } catch {
    text = String((error as { message?: string })?.message ?? '');
  }
  return /non-calendar folder/i.test(text);
}

/** Keeps the remembered answers to the latest `max`. */
export function rememberAnswer(
  answers: Record<string, TimedAnswer>,
  key: string,
  response: MonoMeetingResponse,
  at: number,
  max = 300
): Record<string, TimedAnswer> {
  const next = { ...answers, [key]: { response, at } };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const kept = keys.sort((a, b) => next[b].at - next[a].at).slice(0, max);
  return Object.fromEntries(kept.map((k) => [k, next[k]]));
}
