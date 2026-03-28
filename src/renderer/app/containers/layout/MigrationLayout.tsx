import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { FC, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface MigrationLayoutProps {
  endTime: Date | string; // ISO string or Date object for when migration should end
  timezone?: string; // Optional timezone parameter - now defaults to user's local timezone
  onRefresh?: () => void;
}

const MigrationLayout: FC<MigrationLayoutProps> = ({
  endTime = new Date('2025-04-11T00:30:00-07:00'),
  timezone, // No default - we'll determine this dynamically
  onRefresh = () => window.location.replace('/')
}) => {
  const { t } = useTranslation();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isOverdue, setIsOverdue] = useState(false);
  const [formattedEndTime, setFormattedEndTime] = useState<string>('--:--');
  const [isLoaded, setIsLoaded] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>('');
  const initialCheckCompleted = useRef(false);

  useEffect(() => {
    // Detect user's timezone
    try {
      // Get user's timezone from browser's Intl API
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimezone(detectedTimezone);
    } catch (e) {
      console.error('Failed to detect timezone:', e);
      // Fallback to a default timezone if detection fails
      setUserTimezone('America/Los_Angeles');
    }
  }, []);

  useEffect(() => {
    // Skip if user timezone hasn't been detected yet
    if (!userTimezone) return;

    // Use the provided timezone or fall back to detected user timezone
    const effectiveTimezone = timezone || userTimezone;

    // Convert endTime to Date object if it's a string
    let targetEndTime: Date;
    if (typeof endTime === 'string') {
      try {
        // Try to parse as ISO string
        targetEndTime = new Date(endTime);
      } catch (e) {
        console.error('Failed to parse endTime:', e);
        targetEndTime = new Date();
      }
    } else {
      targetEndTime = endTime;
    }

    // Format the end time to display to users in their timezone
    try {
      setFormattedEndTime(
        targetEndTime.toLocaleTimeString('en-US', {
          timeZone: effectiveTimezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        })
      );
    } catch (e) {
      console.error('Failed to format time:', e);
      setFormattedEndTime('');
    }

    const calculateTimeRemaining = () => {
      const now = new Date();
      const diff = targetEndTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining(0);
        // Only set isOverdue on the initial check
        if (!initialCheckCompleted.current) {
          setIsOverdue(true);
          initialCheckCompleted.current = true;
        }
      } else {
        // Only set isOverdue state on the initial check
        if (!initialCheckCompleted.current) {
          setIsOverdue(false);
          initialCheckCompleted.current = true;
        }
        // Convert milliseconds to seconds
        setTimeRemaining(Math.floor(diff / 1000));
      }

      // Set loaded state to true once we have our first calculation
      if (!isLoaded) {
        setIsLoaded(true);
      }
    };

    // Calculate immediately
    calculateTimeRemaining();

    // Update every second
    const timer = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(timer);
  }, [endTime, timezone, userTimezone, isLoaded]);

  // Format the time remaining as mm:ss or hh:mm:ss if hours > 0
  const formatTime = () => {
    if (timeRemaining === null) return '--:--';

    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="flex h-screen flex-col items-center justify-center bg-background transition-opacity duration-300"
      style={{ opacity: isLoaded ? 1 : 0 }}
    >
      <BaseHeader />
      <div className="max-w-md px-6 text-center">
        {isOverdue ? (
          <h1 className="mb-2 text-lg font-medium text-foreground">
            {t('layout.migration.overdue')}
          </h1>
        ) : (
          <h1 className="mb-2 text-lg font-medium text-foreground">
            {t('layout.migration.title')}
          </h1>
        )}
        {isOverdue ? (
          <p className="text-sm text-muted-foreground">{t('layout.migration.check_back')}</p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">{t('layout.migration.description')}</p>
        )}

        {isOverdue ? (
          <div className="mb-6"></div>
        ) : (
          <div className="mb-6">
            <div className="flex items-center justify-center text-xl font-medium text-foreground">
              {formatTime()}
            </div>
            <div className="my-3 text-sm text-muted-foreground">
              {t('layout.migration.expected_completion', { time: formattedEndTime })}
            </div>
          </div>
        )}

        <Button variant={'secondary'} onClick={onRefresh} className="mb-3">
          <MonoIcon className="mr-2 h-4 w-4" type={'RotateCcw'} />
          {t('layout.migration.refresh')}
        </Button>
      </div>
    </div>
  );
};

// Usage examples:
// 1. Using a specific time, automatically displayed in user's local timezone:
// <MigrationLayout endTime="2025-04-10T18:30:00Z" />
//
// 2. Setting a relative time (2 hours from now), in user's local timezone:
// <MigrationLayout endTime={new Date(Date.now() + 2 * 60 * 60 * 1000)} />
//
// 3. Overriding with a specific timezone (optional):
// <MigrationLayout endTime="2025-04-10T18:30:00Z" timezone="Europe/London" />

export default MigrationLayout;
