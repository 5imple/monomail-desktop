import { registerAuthHandlers } from '@/main/services/ipc-handlers/auth';
import { registerFcmHandlers } from '@/main/services/ipc-handlers/fcm';
import { registerNotificationHandlers } from '@/main/services/ipc-handlers/notification';
import { registerSystemHandlers } from '@/main/services/ipc-handlers/system';

export function registerIpcHandlers() {
  registerSystemHandlers();
  registerNotificationHandlers();
  registerAuthHandlers();
  registerFcmHandlers();
}
