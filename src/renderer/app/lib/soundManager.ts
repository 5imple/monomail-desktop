import Mono from '@/renderer/app/assets/audio/mono.wav?asset';
import Shuffle from '@/renderer/app/assets/audio/shuffle.wav?asset';
import Ping from '@/renderer/app/assets/audio/ping.wav?asset';
import Swipe from '@/renderer/app/assets/audio/swipe.wav?asset';
import Ripple from '@/renderer/app/assets/audio/ripple.wav?asset';

export type AudioType = 'Off' | 'Mono' | 'Shuffle' | 'Ping' | 'Swipe' | 'Ripple';

const audioMap: Record<AudioType, string> = {
  Off: '',
  Mono,
  Shuffle,
  Ping,
  Swipe,
  Ripple
};

export const playSound = (audioName: AudioType = 'Mono') => {
  if (audioName === 'Off') return;
  const audio = new Audio(audioMap[audioName]);
  audio.play().catch((error) => console.error('Error playing sound:', error));
};
