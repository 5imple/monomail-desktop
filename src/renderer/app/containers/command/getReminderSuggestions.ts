import dayjs from 'dayjs';
import * as chrono from 'chrono-node';

export type Suggestion = {
  label: string;
  value: string;
  type?: 'relative' | 'absolute' | 'smart';
};

export function getReminderSuggestions(input: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const normalized = input.toLowerCase().trim();
  const now = dayjs();

  // If no input, return smart defaults
  if (!normalized) {
    return getDefaultSuggestions(now);
  }

  // Try chrono parser first for natural language dates
  const chronoSuggestions = getChronoSuggestions(input, now);
  suggestions.push(...chronoSuggestions);

  // Handle specific patterns
  const patternSuggestions = getPatternSuggestions(normalized, now);
  suggestions.push(...patternSuggestions);

  // Handle numeric inputs (dates, times, durations)
  const numericSuggestions = getNumericSuggestions(normalized, now);
  suggestions.push(...numericSuggestions);

  // Handle partial weekdays and time units
  const partialSuggestions = getPartialSuggestions(normalized, now);
  suggestions.push(...partialSuggestions);

  return sortAndDeduplicateSuggestions(suggestions, input);
}

function getDefaultSuggestions(now: dayjs.Dayjs): Suggestion[] {
  return [
    { label: 'In 30 minutes', value: 'in 30 minutes', type: 'relative' },
    { label: 'In 2 hours', value: 'in 2 hours', type: 'relative' },
    { label: 'Tomorrow at 9 AM', value: 'tomorrow at 9am', type: 'smart' },
    { label: 'Next Monday', value: 'next monday', type: 'smart' }
  ];
}

function getChronoSuggestions(input: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];

  try {
    // Parse the input with chrono
    const results = chrono.parse(input, now.toDate());

    for (const result of results) {
      if (result.start && result.start.date() > now.toDate()) {
        const parsedDate = dayjs(result.start.date());
        const label = formatNaturalDate(parsedDate, now);

        suggestions.push({
          label,
          value: input,
          type: 'absolute'
        });
      }
    }
  } catch (error) {
    // Chrono parsing failed, continue with other methods
  }

  return suggestions;
}

function getPatternSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Handle "tomorrow" variations
  if (matchesPattern(normalized, ['tomorrow', 'tmr', 'tmrw', 'tomo'])) {
    const timeMatch = normalized.match(/\d{1,2}(?::\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      suggestions.push({
        label: `Tomorrow at ${formatTime(timeMatch[0])}`,
        value: `tomorrow at ${timeMatch[0]}`,
        type: 'smart'
      });
    } else {
      suggestions.push(
        { label: 'Tomorrow at 9 AM', value: 'tomorrow at 9am', type: 'smart' },
        { label: 'Tomorrow at 2 PM', value: 'tomorrow at 2pm', type: 'smart' }
      );
    }
  }

  // Handle "next" patterns
  if (normalized.startsWith('next')) {
    const timeUnits = ['week', 'month', 'quarter', 'year'];
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    timeUnits.forEach((unit) => {
      if (normalized.includes(unit)) {
        suggestions.push({
          label: `Next ${unit}`,
          value: `next ${unit}`,
          type: 'relative'
        });
      }
    });

    weekdays.forEach((day) => {
      if (normalized.includes(day.substring(0, 3))) {
        suggestions.push(
          { label: `Next ${capitalize(day)} at 9 AM`, value: `next ${day} at 9am`, type: 'smart' },
          { label: `Next ${capitalize(day)} at 2 PM`, value: `next ${day} at 2pm`, type: 'smart' }
        );
      }
    });
  }

  // Handle "in" patterns
  if (normalized.startsWith('in ')) {
    const inSuggestions = getInPatternSuggestions(normalized, now);
    suggestions.push(...inSuggestions);
  }

  // Handle "on" patterns
  if (normalized.startsWith('on ')) {
    const onSuggestions = getOnPatternSuggestions(normalized, now);
    suggestions.push(...onSuggestions);
  }

  return suggestions;
}

function getNumericSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Extract numbers from input
  const numbers = normalized.match(/\d+/g);
  if (!numbers) return suggestions;

  const num = parseInt(numbers[0], 10);

  // Handle date patterns (5/6, 5-6, may 6, etc.)
  if (isDatePattern(normalized)) {
    const dateSuggestions = getDatePatternSuggestions(normalized, now);
    suggestions.push(...dateSuggestions);
    return suggestions;
  }

  // Handle time patterns (3pm, 14:30, etc.)
  if (isTimePattern(normalized)) {
    const timeSuggestions = getTimePatternSuggestions(normalized, now);
    suggestions.push(...timeSuggestions);
    return suggestions;
  }

  // Handle duration numbers
  if (num > 0) {
    // For numbers 1-12, suggest as time
    if (num >= 1 && num <= 12) {
      suggestions.push(
        { label: `Today at ${num} PM`, value: `today at ${num}pm`, type: 'smart' },
        { label: `Tomorrow at ${num} AM`, value: `tomorrow at ${num}am`, type: 'smart' }
      );
    }

    // Suggest as durations
    if (num <= 60) {
      suggestions.push({
        label: `In ${num} minutes`,
        value: `in ${num} minutes`,
        type: 'relative'
      });
    }
    if (num <= 24) {
      suggestions.push({ label: `In ${num} hours`, value: `in ${num} hours`, type: 'relative' });
    }
    if (num <= 31) {
      suggestions.push({ label: `In ${num} days`, value: `in ${num} days`, type: 'relative' });

      // Suggest as date in current/next month
      const currentMonth = now.format('MMMM');
      const nextMonth = now.add(1, 'month').format('MMMM');

      if (num <= now.daysInMonth()) {
        suggestions.push({
          label: `${currentMonth} ${num}`,
          value: `${currentMonth} ${num}`,
          type: 'absolute'
        });
      }

      suggestions.push({
        label: `${nextMonth} ${num}`,
        value: `${nextMonth} ${num}`,
        type: 'absolute'
      });
    }
  }

  return suggestions;
}

function getPartialSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december'
  ];

  // Partial weekday matching
  weekdays.forEach((day) => {
    if (day.startsWith(normalized) && normalized.length >= 2) {
      const nextOccurrence = getNextWeekday(now, weekdays.indexOf(day));
      suggestions.push(
        { label: `${capitalize(day)} at 9 AM`, value: `${day} at 9am`, type: 'smart' },
        { label: `${capitalize(day)} at 2 PM`, value: `${day} at 2pm`, type: 'smart' }
      );
    }
  });

  // Partial month matching
  months.forEach((month, index) => {
    if (month.startsWith(normalized) && normalized.length >= 3) {
      const monthNum = index + 1;
      suggestions.push({
        label: `${capitalize(month)} 1`,
        value: `${month} 1`,
        type: 'absolute'
      });
      suggestions.push({
        label: `${capitalize(month)} 15`,
        value: `${month} 15`,
        type: 'absolute'
      });
    }
  });

  return suggestions;
}

function getInPatternSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const afterIn = normalized.substring(3).trim();

  // Handle quasi-numeric words
  const quasiNumeric: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    couple: 2,
    few: 3,
    several: 5
  };

  Object.entries(quasiNumeric).forEach(([word, value]) => {
    if (afterIn.startsWith(word)) {
      const units = ['minute', 'hour', 'day', 'week', 'month'];
      units.forEach((unit) => {
        const plural = value > 1 ? `${unit}s` : unit;
        suggestions.push({
          label: `In ${word === 'a' || word === 'an' ? word : value} ${plural}`,
          value: `in ${value} ${plural}`,
          type: 'relative'
        });
      });
    }
  });

  // Handle numbers
  const numMatch = afterIn.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const units = ['minutes', 'hours', 'days', 'weeks'];

    units.forEach((unit) => {
      if (afterIn.includes(unit.substring(0, 3))) {
        suggestions.push({
          label: `In ${num} ${unit}`,
          value: `in ${num} ${unit}`,
          type: 'relative'
        });
      }
    });
  }

  return suggestions;
}

function getOnPatternSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const afterOn = normalized.substring(3).trim();

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // Match weekdays
  weekdays.forEach((day) => {
    if (day.startsWith(afterOn) || afterOn.startsWith(day.substring(0, 3))) {
      suggestions.push(
        { label: `On ${capitalize(day)}`, value: `on ${day}`, type: 'smart' },
        { label: `On ${capitalize(day)} at 9 AM`, value: `on ${day} at 9am`, type: 'smart' }
      );
    }
  });

  return suggestions;
}

function getDatePatternSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Handle various date formats
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})/, // 5/6, 5-6
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/, // 5/6/24, 5-6-2024
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})/i, // may 6, march 15
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i // 6 may, 15 march
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      try {
        const parsed = chrono.parseDate(normalized, now.toDate());
        if (parsed && dayjs(parsed).isAfter(now)) {
          const date = dayjs(parsed);
          suggestions.push({
            label: formatNaturalDate(date, now),
            value: normalized,
            type: 'absolute'
          });

          // Add time variations
          suggestions.push({
            label: `${formatNaturalDate(date, now)} at 9 AM`,
            value: `${normalized} at 9am`,
            type: 'absolute'
          });
          suggestions.push({
            label: `${formatNaturalDate(date, now)} at 2 PM`,
            value: `${normalized} at 2pm`,
            type: 'absolute'
          });
        }
      } catch (error) {
        // Parsing failed, continue
      }
      break;
    }
  }

  return suggestions;
}

function getTimePatternSuggestions(normalized: string, now: dayjs.Dayjs): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)?/i, // 2:30, 2:30pm
    /(\d{1,2})\s*(am|pm)/i, // 2pm, 2am
    /(\d{1,2})(\d{2})/i // 1430 (military time)
  ];

  for (const pattern of timePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const timeStr = match[0];

      // Suggest for today and tomorrow
      suggestions.push({
        label: `Today at ${formatTime(timeStr)}`,
        value: `today at ${timeStr}`,
        type: 'smart'
      });
      suggestions.push({
        label: `Tomorrow at ${formatTime(timeStr)}`,
        value: `tomorrow at ${timeStr}`,
        type: 'smart'
      });
      break;
    }
  }

  return suggestions;
}

// Helper functions
function matchesPattern(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => input.startsWith(pattern));
}

function isDatePattern(input: string): boolean {
  const datePatterns = [
    /\d{1,2}[\/\-]\d{1,2}/, // 5/6, 5-6
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, // 5/6/24
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i, // may 6
    /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i // 6 may
  ];
  return datePatterns.some((pattern) => pattern.test(input));
}

function isTimePattern(input: string): boolean {
  const timePatterns = [
    /\d{1,2}:\d{2}\s*(am|pm)?/i, // 2:30, 2:30pm
    /\d{1,2}\s*(am|pm)/i, // 2pm
    /\d{4}/ // 1430 (if exactly 4 digits)
  ];
  return timePatterns.some((pattern) => pattern.test(input));
}

function formatTime(timeStr: string): string {
  // Clean up and format time string
  const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');

  if (cleaned.includes(':')) {
    return cleaned.toUpperCase();
  }

  if (cleaned.includes('am') || cleaned.includes('pm')) {
    return cleaned.replace(/(\d+)(am|pm)/, '$1 $2').toUpperCase();
  }

  // Handle military time (4 digits)
  if (/^\d{4}$/.test(cleaned)) {
    const hours = parseInt(cleaned.substring(0, 2), 10);
    const minutes = cleaned.substring(2);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes} ${period}`;
  }

  return timeStr;
}

function formatNaturalDate(date: dayjs.Dayjs, now: dayjs.Dayjs): string {
  const daysDiff = date.diff(now, 'day');

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Tomorrow';
  if (daysDiff <= 7) return date.format('dddd'); // Monday, Tuesday, etc.
  if (date.year() === now.year()) return date.format('MMM D'); // Mar 15

  return date.format('MMM D, YYYY'); // Mar 15, 2024
}

function getNextWeekday(now: dayjs.Dayjs, targetDay: number): dayjs.Dayjs {
  const currentDay = now.day();
  const daysUntil = targetDay >= currentDay ? targetDay - currentDay : 7 - (currentDay - targetDay);
  return now.add(daysUntil, 'day');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function sortAndDeduplicateSuggestions(
  suggestions: Suggestion[],
  userInput: string,
  maxResults: number = 6
): Suggestion[] {
  const now = dayjs();

  // Remove duplicates
  const seen = new Set<string>();
  const uniqueSuggestions = suggestions.filter((suggestion) => {
    const key = suggestion.value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter out past dates
  const validSuggestions = uniqueSuggestions.filter((suggestion) => {
    try {
      const parsed = chrono.parseDate(suggestion.value, now.toDate());
      return !parsed || dayjs(parsed).isAfter(now);
    } catch {
      return true; // Keep if can't parse
    }
  });

  // Calculate relevance scores
  const scoredSuggestions = validSuggestions.map((suggestion) => ({
    ...suggestion,
    score: calculateRelevanceScore(suggestion, userInput)
  }));

  // Sort by score (highest first)
  scoredSuggestions.sort((a, b) => b.score - a.score);

  // Group by type for better UX
  const grouped = {
    smart: scoredSuggestions.filter((s) => s.type === 'smart'),
    absolute: scoredSuggestions.filter((s) => s.type === 'absolute'),
    relative: scoredSuggestions.filter((s) => s.type === 'relative')
  };

  // Interleave results for variety
  const result: Suggestion[] = [];
  const maxPerType = Math.ceil(maxResults / 3);

  for (let i = 0; i < maxPerType && result.length < maxResults; i++) {
    if (grouped.smart[i] && result.length < maxResults) result.push(grouped.smart[i]);
    if (grouped.absolute[i] && result.length < maxResults) result.push(grouped.absolute[i]);
    if (grouped.relative[i] && result.length < maxResults) result.push(grouped.relative[i]);
  }

  return result.slice(0, maxResults);
}

function calculateRelevanceScore(suggestion: Suggestion, userInput: string): number {
  const normalizedInput = userInput.toLowerCase();
  const normalizedLabel = suggestion.label.toLowerCase();
  const normalizedValue = suggestion.value.toLowerCase();

  let score = 0;

  // Exact matches (highest priority)
  if (normalizedLabel === normalizedInput || normalizedValue === normalizedInput) {
    score += 100;
  }

  // Starts with input
  if (normalizedLabel.startsWith(normalizedInput) || normalizedValue.startsWith(normalizedInput)) {
    score += 50;
  }

  // Contains input
  if (normalizedLabel.includes(normalizedInput) || normalizedValue.includes(normalizedInput)) {
    score += 25;
  }

  // Keyword matching
  const keywords = normalizedInput.split(/\s+/);
  keywords.forEach((keyword) => {
    if (normalizedLabel.includes(keyword) || normalizedValue.includes(keyword)) {
      score += 10;
    }
  });

  // Type bonuses
  if (suggestion.type === 'smart') score += 5;
  if (
    (suggestion.type === 'absolute' && normalizedInput.includes('/')) ||
    normalizedInput.includes('-')
  ) {
    score += 15;
  }

  // Time pattern bonus
  if (normalizedInput.match(/\d+\s*(am|pm|:\d+)/i) && normalizedLabel.includes('at')) {
    score += 20;
  }

  return score;
}
