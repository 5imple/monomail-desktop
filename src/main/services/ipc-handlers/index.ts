import { registerAuthHandlers } from '@/main/services/ipc-handlers/auth';
import { registerGmailHandlers } from '@/main/services/ipc-handlers/gmail';
import { registerNotificationHandlers } from '@/main/services/ipc-handlers/notification';
import { registerQueueHandlers } from '@/main/services/ipc-handlers/queue';
import { registerSystemHandlers } from '@/main/services/ipc-handlers/system';

export function registerIpcHandlers() {
  registerSystemHandlers();
  registerNotificationHandlers();
  registerAuthHandlers();
  registerGmailHandlers();
  registerQueueHandlers();
  // FCM IPC handlers retired in Phase B — push lives on a backend
  // WebSocket now (see services/push/WebSocketPushClient.ts).
}
