// components/SquircleClip.tsx
import React from 'react';

const SquircleClip: React.FC = () => (
  <svg width="0" height="0">
    <defs>
      <clipPath id="squircleClip" clipPathUnits="objectBoundingBox">
        <path
          d="
          M0.5,0 
          C0.776,0,1,0.224,1,0.5 
          C1,0.776,0.776,1,0.5,1 
          C0.224,1,0,0.776,0,0.5 
          C0,0.224,0.224,0,0.5,0 
          Z"
        />
      </clipPath>
    </defs>
  </svg>
);

export default SquircleClip;
