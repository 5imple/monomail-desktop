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
  /**
   * When a notification with this id is still on screen: false (default) keeps
   * it and drops the new one; true closes it and shows the new one, so a new
   * reply in an already-notified conversation is not swallowed.
   */
  replace?: boolean;
}
