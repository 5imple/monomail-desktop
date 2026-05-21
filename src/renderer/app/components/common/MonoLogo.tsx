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
  return currentTheme === 'dark' ? (
    <img src={MonoDark} className={cn('w-24', className)} />
  ) : (
    <img src={MonoLight} className={cn('w-24', className)} />
  );
};

export default MonoLogo;
