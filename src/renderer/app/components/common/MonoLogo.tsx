import MonoDark from '@/renderer/app/assets/icon-dark.png';
import MonoLight from '@/renderer/app/assets/icon-light.png';
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { cn } from '@/renderer/app/lib/utils';
import { FC } from 'react';

interface MonoLogoProps {
  className?: string;
}

const MonoLogo: FC<MonoLogoProps> = ({ className }) => {
  const { currentTheme } = useTheme();
  // Black is a dark theme too: it showed the light (white-tile) logo.
  const isDark = currentTheme === 'dark' || currentTheme === 'black';
  return <img src={isDark ? MonoDark : MonoLight} alt="" className={cn('w-24', className)} />;
};

export default MonoLogo;
