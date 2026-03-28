import React, { FC, memo } from 'react';
import * as Icons from './svg';
import { cn } from '@/renderer/app/lib/utils';

export type MonoIconType = keyof typeof Icons;

interface IconsProps extends React.SVGProps<SVGSVGElement> {
  type: MonoIconType;
}

const MonoIcon: FC<IconsProps> = memo(({ type, className, ...props }) => {
  const SvgIcon = Icons[type];

  if (!SvgIcon) {
    console.error(`Icon for type "${type}" not found.`);
    return null;
  }

  return (
    <SvgIcon
      aria-label={`${type} icon`}
      vectorEffect="non-scaling-stroke"
      shapeRendering="geometricPrecision" // Improves anti-aliasing
      style={{
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'optimizeLegibility'
      }}
      className={cn('h-4 w-4 shrink-0', className)}
      {...props}
    />
  );
});

MonoIcon.displayName = 'MonoIcon';

export default MonoIcon;
