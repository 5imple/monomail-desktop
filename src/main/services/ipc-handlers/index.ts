import { registerAuthHandlers } from '@/main/services/ipc-handlers/auth';
import { registerNotificationHandlers } from '@/main/services/ipc-handlers/notification';
import { registerSystemHandlers } from '@/main/services/ipc-handlers/system';

export function registerIpcHandlers() {
  registerSystemHandlers();
  registerNotificationHandlers();
  registerAuthHandlers();
  // FCM IPC handlers retired in Phase B — push lives on a backend
  // WebSocket now (see services/push/WebSocketPushClient.ts).
}
