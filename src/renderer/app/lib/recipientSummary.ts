import { shortName } from '@/renderer/app/lib/shortName';

export interface SummaryRecipient {
  name?: string | null;
  email?: string | null;
}

export interface RecipientSummaryOptions {
  /** The user's own account addresses; any of them reads as `meLabel`. */
  ownEmails?: readonly (string | null | undefined)[];
  /** Label for the user's own addresses ("me"). */
  meLabel?: string;
  /** Prefix for the first Bcc recipient shown ("bcc: "). */
  bccPrefix?: string;
  /** Names shown before the rest fold into "+N" (when there are more than `maxNames + 1`). */
  maxNames?: number;
  /** With no recipients at all, say `meLabel` (a received Bcc / undisclosed-recipients message reached you). */
  fallbackToMe?: boolean;
  /** Names in `full` before it, too, folds into "+N". */
  maxFullNames?: number;
}

export interface RecipientSummary {
  /** Compact line: "me, Bob +2". Empty when there is no one to name. */
  text: string;
  /** Untruncated-ish list for a tooltip / accessible name: "me, Bob Smith, Carol Lee, Dan Wu". */
  full: string;
  /** Distinct people (you count once, however many of your addresses appear). */
  total: number;
  /** How many are folded into "+N" in `text`. */
  hidden: number;
}

interface Person {
  short: string;
  long: string;
  bcc: boolean;
}

const normalize = (email?: string | null) => email?.trim().toLowerCase() ?? '';

// A "name" that is really an address (or blank) isn't a name.
const usableName = (name?: string | null) => {
  const trimmed =
    name
      ?.trim()
      .replace(/^(['"])(.*)\1$/, '$2')
      .trim() ?? '';
  return trimmed && !trimmed.includes('@') ? trimmed : '';
};

// "Lee, Carol" -> "Carol Lee", so the comma-separated list stays readable
// (the same single-token-before-the-comma shape shortName flips). Only a
// single comma: "Smith, John, Jr." is left alone rather than mangled.
const displayName = (name: string) => name.replace(/^([^,\s]+),\s*([^,\s][^,]*)$/, '$2 $1');

// An empty RFC 5322 group ("undisclosed-recipients:;") parses as a recipient
// whose "address" has no @ — it names nobody.
const isEmptyGroup = (email: string) => !email.includes('@') && /:\s*;?$/.test(email);

const fold = <T>(labels: T[], limit: number) => {
  // "+1" saves nothing over a name, so only fold two or more.
  if (labels.length <= limit + 1) return { shown: labels, hidden: 0 };
  return { shown: labels.slice(0, limit), hidden: labels.length - limit };
};

const join = ({ shown, hidden }: { shown: string[]; hidden: number }) =>
  shown.join(', ') + (hidden > 0 ? ` +${hidden}` : '');

/**
 * The "to …" summary in an expanded message's sender line, Gmail-style:
 * "me, Bob +2". To, then Cc, then Bcc, in order, each person once; any of the
 * user's own addresses reads as "me" (once). Others go by first name.
 */
export function recipientSummary(
  to: readonly SummaryRecipient[] | null | undefined,
  cc: readonly SummaryRecipient[] | null | undefined,
  bcc: readonly SummaryRecipient[] | null | undefined,
  {
    ownEmails = [],
    meLabel = 'me',
    bccPrefix = 'bcc: ',
    maxNames = 2,
    fallbackToMe = false,
    maxFullNames = 12
  }: RecipientSummaryOptions = {}
): RecipientSummary {
  const own = new Set(ownEmails.map(normalize).filter(Boolean));
  const seen = new Set<string>();
  const people: Person[] = [];
  let meAdded = false;

  const add = (list: readonly SummaryRecipient[] | null | undefined, isBcc: boolean) => {
    for (const recipient of list ?? []) {
      let email = normalize(recipient?.email);
      let name = usableName(recipient?.name);
      if (isEmptyGroup(email)) email = '';
      if (isEmptyGroup(name)) name = '';
      if (!email && !name) continue;
      if (email && own.has(email)) {
        if (meAdded) continue;
        meAdded = true;
        people.push({ short: meLabel, long: meLabel, bcc: isBcc });
        continue;
      }
      const key = email || `name:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fallback = email ? (recipient?.email?.trim() ?? '') : '';
      people.push({
        // shortName("Smith, John, Jr.") is "John,": no stray comma in a list.
        short: shortName(name, fallback).replace(/[,;]+$/, '') || fallback,
        long: (name && displayName(name)) || fallback,
        bcc: isBcc
      });
    }
  };
  add(to, false);
  add(cc, false);
  add(bcc, true);

  if (people.length === 0 && fallbackToMe) {
    people.push({ short: meLabel, long: meLabel, bcc: false });
  }

  // Only the first Bcc name carries the prefix: "Ann, bcc: Bob, Carol".
  let bccMarked = false;
  const label = (person: Person, key: 'short' | 'long') => {
    if (!person.bcc || bccMarked) return person[key];
    bccMarked = true;
    return `${bccPrefix}${person[key]}`;
  };

  const compact = fold(people, maxNames);
  const text = join({ shown: compact.shown.map((p) => label(p, 'short')), hidden: compact.hidden });
  bccMarked = false;
  const long = fold(people, maxFullNames);
  const full = join({ shown: long.shown.map((p) => label(p, 'long')), hidden: long.hidden });

  return { text, full, total: people.length, hidden: compact.hidden };
}
