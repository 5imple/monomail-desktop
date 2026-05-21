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

  'renderer:auth:sign-in',
  'renderer:auth:add-account',
  'renderer:auth:scope-updated',
  'renderer:auth:billing-updated',
  'renderer:auth:token-changed',
  'renderer:auth:signed-out',

  'renderer:system:deeplink-query',
  'renderer:mailto:compose',
  'renderer:toast:show'
] as const;
export type ValidRendererChannel = (typeof validRendererChannel)[number];

export const isValidRendererChannel = (channel: string): channel is ValidRendererChannel => {
  return (validRendererChannel as readonly string[]).includes(channel);
};

export const validMainChannel = [
  'main:auth:set-id-token',
  'main:auth:get-state',
  'main:auth:sign-out',
  'main:auth:refresh',
  'main:system:set-offline-status',
  'main:system:set-alert-sound',
  'main:system:set-window-fullsize-on-creation',
  'main:system:set-strict-pubsub',
  'main:window:open',
  'main:window:close',
  'main:system:theme-toggle',
  'main:dark-mode:system',
  'main:notification:native:show',
  'main:notification:custom:show',
  'main:notification:custom:clicked',
  'main:notification:custom:close',
  'main:compose:create',
  'main:renderer:ready',
  'main:renderer:version',
  'main:renderer:trigger-command',
  'main:toast:show'
] as const;
export type ValidMainChannel = (typeof validMainChannel)[number];

export const isValidMainChannel = (channel: string): channel is ValidMainChannel => {
  return (validMainChannel as readonly string[]).includes(channel);
};
