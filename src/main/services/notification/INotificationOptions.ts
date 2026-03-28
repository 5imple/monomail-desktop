import { AudioType } from '@/renderer/app/lib/soundManager';

/**
 * The notification options.
 *
 * @export
 * @interface ICustomNotificationOptions
 */
export interface ICustomNotificationOptions {
  id: string;
  type: 'VERIFICATION_URL' | 'VERIFICATION_CODE';
  data: string;
  from: string;
  audio?: AudioType;
}

export interface INativeNotificationOptions<T> {
  id?: string;
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  metadata?: T;
}
