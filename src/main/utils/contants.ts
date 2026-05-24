import icon from '@/main/assets/icons/mono.png?asset';
import offlineIcon from '@/main/assets/icons/mono_offline.png?asset';
import { nativeImage } from 'electron';

export const darkBackgroundColor = '#1f1f1f';
export const lightBackgroundColor = '#ffffff';
export const protocols = [import.meta.env.MONO_ENV_PROTOCOL, 'mailto'];

export const onlineTrayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 });
export const offlineTrayIcon = nativeImage
  .createFromPath(offlineIcon)
  .resize({ width: 16, height: 16 });
