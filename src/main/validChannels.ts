export const validRendererChannel = [
  'renderer:native:focus',
  'renderer:native:blur',
  'renderer:naviagation:to',
  // Push channel: replaces 'renderer:fcm:message-received' in Phase B. The
  // payload shape is unchanged (matches the legacy FCM MessagePayload),
  // it just arrives over a WebSocket now instead of FCM.
  'renderer:push:message-received',
  'renderer:notification:native:clicked',
  'renderer:command:trigger',
  'renderer:update:info',
  'renderer:update:available',

  'renderer:auth:add-account',
  'renderer:auth:token-changed',
  'renderer:auth:signed-out',
  'renderer:auth:accounts-changed',

  'renderer:queue:event',
  'renderer:system:deeplink-query',
  'renderer:mailto:compose',
  'renderer:toast:show',
  // Main asks the renderer to play the chosen alert sound once per new-mail
  // batch (the native banner itself is silent). Payload: AudioType.
  'renderer:notification:sound',
  // A send, reply, move or delete went through (mailChangeNotifier): the
  // list refreshes itself quietly.
  'renderer:mail:changed'
] as const;
export type ValidRendererChannel = (typeof validRendererChannel)[number];

export const isValidRendererChannel = (channel: string): channel is ValidRendererChannel => {
  return (validRendererChannel as readonly string[]).includes(channel);
};
