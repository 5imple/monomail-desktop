import { formatInTimeZone } from 'date-fns-tz';

export interface TimezoneOption {
  id: string;
  name: string;
  abbreviation: string;
  region: string;
  city: string;
  utcOffset: string;
}

// Curated timezone list with only valid IANA timezone identifiers
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // UTC
  { id: 'UTC', name: 'Coordinated Universal Time', abbreviation: 'UTC', region: 'UTC', city: 'UTC', utcOffset: 'UTC+0' },

  // North America
  { id: 'America/New_York', name: 'Eastern Time', abbreviation: 'EST', region: 'North America', city: 'New York', utcOffset: 'UTC-5' },
  { id: 'America/Chicago', name: 'Central Time', abbreviation: 'CST', region: 'North America', city: 'Chicago', utcOffset: 'UTC-6' },
  { id: 'America/Denver', name: 'Mountain Time', abbreviation: 'MST', region: 'North America', city: 'Denver', utcOffset: 'UTC-7' },
  { id: 'America/Phoenix', name: 'Mountain Standard Time', abbreviation: 'MST', region: 'North America', city: 'Phoenix', utcOffset: 'UTC-7' },
  { id: 'America/Los_Angeles', name: 'Pacific Time', abbreviation: 'PST', region: 'North America', city: 'Los Angeles', utcOffset: 'UTC-8' },
  { id: 'America/Anchorage', name: 'Alaska Time', abbreviation: 'AKST', region: 'North America', city: 'Anchorage', utcOffset: 'UTC-9' },
  { id: 'Pacific/Honolulu', name: 'Hawaii-Aleutian Time', abbreviation: 'HST', region: 'North America', city: 'Honolulu', utcOffset: 'UTC-10' },
  { id: 'America/Toronto', name: 'Eastern Time', abbreviation: 'EST', region: 'North America', city: 'Toronto', utcOffset: 'UTC-5' },
  { id: 'America/Vancouver', name: 'Pacific Time', abbreviation: 'PST', region: 'North America', city: 'Vancouver', utcOffset: 'UTC-8' },
  { id: 'America/Montreal', name: 'Eastern Time', abbreviation: 'EST', region: 'North America', city: 'Montreal', utcOffset: 'UTC-5' },
  { id: 'America/Halifax', name: 'Atlantic Time', abbreviation: 'AST', region: 'North America', city: 'Halifax', utcOffset: 'UTC-4' },
  { id: 'America/St_Johns', name: 'Newfoundland Time', abbreviation: 'NST', region: 'North America', city: 'St. Johns', utcOffset: 'UTC-3:30' },
  { id: 'America/Winnipeg', name: 'Central Time', abbreviation: 'CST', region: 'North America', city: 'Winnipeg', utcOffset: 'UTC-6' },
  { id: 'America/Edmonton', name: 'Mountain Time', abbreviation: 'MST', region: 'North America', city: 'Edmonton', utcOffset: 'UTC-7' },
  { id: 'America/Mexico_City', name: 'Central Time', abbreviation: 'CST', region: 'North America', city: 'Mexico City', utcOffset: 'UTC-6' },

  // South America
  { id: 'America/Sao_Paulo', name: 'Brasília Time', abbreviation: 'BRT', region: 'South America', city: 'São Paulo', utcOffset: 'UTC-3' },
  { id: 'America/Argentina/Buenos_Aires', name: 'Argentina Time', abbreviation: 'ART', region: 'South America', city: 'Buenos Aires', utcOffset: 'UTC-3' },
  { id: 'America/Santiago', name: 'Chile Time', abbreviation: 'CLT', region: 'South America', city: 'Santiago', utcOffset: 'UTC-3' },
  { id: 'America/Lima', name: 'Peru Time', abbreviation: 'PET', region: 'South America', city: 'Lima', utcOffset: 'UTC-5' },
  { id: 'America/Bogota', name: 'Colombia Time', abbreviation: 'COT', region: 'South America', city: 'Bogotá', utcOffset: 'UTC-5' },
  { id: 'America/Caracas', name: 'Venezuela Time', abbreviation: 'VET', region: 'South America', city: 'Caracas', utcOffset: 'UTC-4' },

  // Europe
  { id: 'Europe/London', name: 'Greenwich Mean Time', abbreviation: 'GMT', region: 'Europe', city: 'London', utcOffset: 'UTC+0' },
  { id: 'Europe/Paris', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Paris', utcOffset: 'UTC+1' },
  { id: 'Europe/Berlin', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Berlin', utcOffset: 'UTC+1' },
  { id: 'Europe/Rome', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Rome', utcOffset: 'UTC+1' },
  { id: 'Europe/Madrid', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Madrid', utcOffset: 'UTC+1' },
  { id: 'Europe/Amsterdam', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Amsterdam', utcOffset: 'UTC+1' },
  { id: 'Europe/Brussels', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Brussels', utcOffset: 'UTC+1' },
  { id: 'Europe/Zurich', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Zurich', utcOffset: 'UTC+1' },
  { id: 'Europe/Vienna', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Vienna', utcOffset: 'UTC+1' },
  { id: 'Europe/Prague', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Prague', utcOffset: 'UTC+1' },
  { id: 'Europe/Stockholm', name: 'Central European Time', abbreviation: 'CET', region: 'Europe', city: 'Stockholm', utcOffset: 'UTC+1' },
  { id: 'Europe/Helsinki', name: 'Eastern European Time', abbreviation: 'EET', region: 'Europe', city: 'Helsinki', utcOffset: 'UTC+2' },
  { id: 'Europe/Athens', name: 'Eastern European Time', abbreviation: 'EET', region: 'Europe', city: 'Athens', utcOffset: 'UTC+2' },
  { id: 'Europe/Istanbul', name: 'Turkey Time', abbreviation: 'TRT', region: 'Europe', city: 'Istanbul', utcOffset: 'UTC+3' },
  { id: 'Europe/Moscow', name: 'Moscow Time', abbreviation: 'MSK', region: 'Europe', city: 'Moscow', utcOffset: 'UTC+3' },

  // Asia
  { id: 'Asia/Tokyo', name: 'Japan Standard Time', abbreviation: 'JST', region: 'Asia', city: 'Tokyo', utcOffset: 'UTC+9' },
  { id: 'Asia/Seoul', name: 'Korea Standard Time', abbreviation: 'KST', region: 'Asia', city: 'Seoul', utcOffset: 'UTC+9' },
  { id: 'Asia/Shanghai', name: 'China Standard Time', abbreviation: 'CST', region: 'Asia', city: 'Shanghai', utcOffset: 'UTC+8' },
  { id: 'Asia/Hong_Kong', name: 'Hong Kong Time', abbreviation: 'HKT', region: 'Asia', city: 'Hong Kong', utcOffset: 'UTC+8' },
  { id: 'Asia/Singapore', name: 'Singapore Time', abbreviation: 'SGT', region: 'Asia', city: 'Singapore', utcOffset: 'UTC+8' },
  { id: 'Asia/Bangkok', name: 'Indochina Time', abbreviation: 'ICT', region: 'Asia', city: 'Bangkok', utcOffset: 'UTC+7' },
  { id: 'Asia/Jakarta', name: 'Western Indonesia Time', abbreviation: 'WIB', region: 'Asia', city: 'Jakarta', utcOffset: 'UTC+7' },
  { id: 'Asia/Manila', name: 'Philippines Time', abbreviation: 'PHT', region: 'Asia', city: 'Manila', utcOffset: 'UTC+8' },
  { id: 'Asia/Kuala_Lumpur', name: 'Malaysia Time', abbreviation: 'MYT', region: 'Asia', city: 'Kuala Lumpur', utcOffset: 'UTC+8' },
  { id: 'Asia/Kolkata', name: 'India Standard Time', abbreviation: 'IST', region: 'Asia', city: 'Mumbai', utcOffset: 'UTC+5:30' },
  { id: 'Asia/Dubai', name: 'Gulf Standard Time', abbreviation: 'GST', region: 'Asia', city: 'Dubai', utcOffset: 'UTC+4' },
  { id: 'Asia/Riyadh', name: 'Arabia Standard Time', abbreviation: 'AST', region: 'Asia', city: 'Riyadh', utcOffset: 'UTC+3' },
  { id: 'Asia/Tehran', name: 'Iran Standard Time', abbreviation: 'IRST', region: 'Asia', city: 'Tehran', utcOffset: 'UTC+3:30' },
  { id: 'Asia/Jerusalem', name: 'Israel Standard Time', abbreviation: 'IST', region: 'Asia', city: 'Jerusalem', utcOffset: 'UTC+2' },
  { id: 'Asia/Karachi', name: 'Pakistan Standard Time', abbreviation: 'PKT', region: 'Asia', city: 'Karachi', utcOffset: 'UTC+5' },
  { id: 'Asia/Dhaka', name: 'Bangladesh Standard Time', abbreviation: 'BST', region: 'Asia', city: 'Dhaka', utcOffset: 'UTC+6' },
  { id: 'Asia/Yekaterinburg', name: 'Yekaterinburg Time', abbreviation: 'YEKT', region: 'Asia', city: 'Yekaterinburg', utcOffset: 'UTC+5' },
  { id: 'Asia/Vladivostok', name: 'Vladivostok Time', abbreviation: 'VLAT', region: 'Asia', city: 'Vladivostok', utcOffset: 'UTC+10' },

  // Africa
  { id: 'Africa/Cairo', name: 'Eastern European Time', abbreviation: 'EET', region: 'Africa', city: 'Cairo', utcOffset: 'UTC+2' },
  { id: 'Africa/Lagos', name: 'West Africa Time', abbreviation: 'WAT', region: 'Africa', city: 'Lagos', utcOffset: 'UTC+1' },
  { id: 'Africa/Johannesburg', name: 'South Africa Standard Time', abbreviation: 'SAST', region: 'Africa', city: 'Johannesburg', utcOffset: 'UTC+2' },
  { id: 'Africa/Nairobi', name: 'East Africa Time', abbreviation: 'EAT', region: 'Africa', city: 'Nairobi', utcOffset: 'UTC+3' },
  { id: 'Africa/Casablanca', name: 'Western European Time', abbreviation: 'WET', region: 'Africa', city: 'Casablanca', utcOffset: 'UTC+0' },

  // Australia & Oceania
  { id: 'Australia/Sydney', name: 'Australian Eastern Time', abbreviation: 'AEDT', region: 'Australia & Oceania', city: 'Sydney', utcOffset: 'UTC+11' },
  { id: 'Australia/Melbourne', name: 'Australian Eastern Time', abbreviation: 'AEDT', region: 'Australia & Oceania', city: 'Melbourne', utcOffset: 'UTC+11' },
  { id: 'Australia/Brisbane', name: 'Australian Eastern Time', abbreviation: 'AEST', region: 'Australia & Oceania', city: 'Brisbane', utcOffset: 'UTC+10' },
  { id: 'Australia/Perth', name: 'Australian Western Time', abbreviation: 'AWST', region: 'Australia & Oceania', city: 'Perth', utcOffset: 'UTC+8' },
  { id: 'Australia/Adelaide', name: 'Australian Central Time', abbreviation: 'ACDT', region: 'Australia & Oceania', city: 'Adelaide', utcOffset: 'UTC+10:30' },
  { id: 'Pacific/Auckland', name: 'New Zealand Time', abbreviation: 'NZDT', region: 'Australia & Oceania', city: 'Auckland', utcOffset: 'UTC+13' },

  // Pacific
  { id: 'Pacific/Fiji', name: 'Fiji Time', abbreviation: 'FJT', region: 'Pacific', city: 'Suva', utcOffset: 'UTC+12' },
  { id: 'Pacific/Guam', name: 'Chamorro Time', abbreviation: 'ChST', region: 'Pacific', city: 'Hagåtña', utcOffset: 'UTC+10' },

  // Atlantic
  { id: 'Atlantic/Azores', name: 'Azores Time', abbreviation: 'AZOT', region: 'Atlantic', city: 'Azores', utcOffset: 'UTC-1' },
];

// Function to get timezone abbreviation
export const getTimezoneAbbreviation = (timezoneId: string): string => {
  const timezone = TIMEZONE_OPTIONS.find(tz => tz.id === timezoneId);
  return timezone?.abbreviation || timezoneId.split('/').pop() || timezoneId;
};

// Function to get current GMT offset for a timezone
export const getCurrentGMTOffset = (timezoneId: string): string => {
  try {
    const now = new Date();
    const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezoneId }));
    const timeInUTC = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetInMinutes = (timeInTimezone.getTime() - timeInUTC.getTime()) / (1000 * 60);
    const hours = Math.floor(Math.abs(offsetInMinutes) / 60);
    const minutes = Math.abs(offsetInMinutes) % 60;
    const sign = offsetInMinutes >= 0 ? '+' : '-';
    return `GMT${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch (error) {
    console.warn(`Invalid timezone: ${timezoneId}`);
    return 'GMT+00:00';
  }
};

// Function to get current time in timezone with abbreviation
export const getCurrentTimeWithAbbreviation = (timezoneId: string): { time: string; abbreviation: string } => {
  const now = new Date();
  const time = formatInTimeZone(now, timezoneId, 'h:mm a');
  const abbreviation = getTimezoneAbbreviation(timezoneId);
  return { time, abbreviation };
};

// Function to group timezones by region
export const getTimezonesByRegion = (): Record<string, TimezoneOption[]> => {
  return TIMEZONE_OPTIONS.reduce((acc, timezone) => {
    if (!acc[timezone.region]) {
      acc[timezone.region] = [];
    }
    acc[timezone.region].push(timezone);
    return acc;
  }, {} as Record<string, TimezoneOption[]>);
};

// Function to search timezones
export const searchTimezones = (query: string): TimezoneOption[] => {
  const lowercaseQuery = query.toLowerCase().trim();
  
  // Handle GMT offset searches like +9, -5, gmt+9, gmt-5
  const gmtOffsetMatch = lowercaseQuery.match(/^(gmt)?([+-]?\d{1,2}(?::\d{2})?)$/);
  if (gmtOffsetMatch) {
    const offsetPart = gmtOffsetMatch[2];
    return TIMEZONE_OPTIONS.filter(timezone => {
      const currentOffset = getCurrentGMTOffset(timezone.id);
      // Extract the offset part from GMT+09:00 format
      const offsetNumber = currentOffset.replace('GMT', '');
      return offsetNumber.includes(offsetPart) || 
             timezone.utcOffset.toLowerCase().includes(offsetPart);
    });
  }
  
  return TIMEZONE_OPTIONS.filter(
    timezone =>
      timezone.name.toLowerCase().includes(lowercaseQuery) ||
      timezone.city.toLowerCase().includes(lowercaseQuery) ||
      timezone.abbreviation.toLowerCase().includes(lowercaseQuery) ||
      timezone.region.toLowerCase().includes(lowercaseQuery) ||
      timezone.utcOffset.toLowerCase().includes(lowercaseQuery) ||
      getCurrentGMTOffset(timezone.id).toLowerCase().includes(lowercaseQuery)
  );
};

// Popular timezone shortcuts (like Notion Calendar)
export const POPULAR_TIMEZONES: TimezoneOption[] = [
  TIMEZONE_OPTIONS.find(tz => tz.id === 'America/New_York')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'America/Chicago')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'America/Denver')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'America/Los_Angeles')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Europe/London')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Europe/Paris')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Asia/Tokyo')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Asia/Shanghai')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Asia/Kolkata')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'Australia/Sydney')!,
  TIMEZONE_OPTIONS.find(tz => tz.id === 'UTC')!,
];