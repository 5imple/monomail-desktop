import React, { FC } from 'react';

interface GradientBorderProps {}

const GradientBorder: FC<GradientBorderProps> = ({}) => {
  return (
    <div className="relative flex justify-center items-center text-transparent text-2xl font-cursive cursor-pointer bg-card w-[calc(65vh/1.5)] h-[65vh] p-1 rounded-md group">
      <div className="absolute top-0 left-0 w-full h-full rounded-md before:absolute before:top-[-1%] before:left-[-2%] before:w-[104%] before:h-[102%] before:rounded-md before:bg-gradient-to-r before:from-blue-500 before:via-indigo-500 before:to-purple-700 before:animate-spin after:absolute after:top-[calc(65vh/6)] after:left-0 after:right-0 after:h-full after:w-full after:transform after:scale-80 after:blur-[calc(65vh/6)] after:bg-gradient-to-r after:from-blue-500 after:via-indigo-500 after:to-purple-700 after:animate-spin"></div>
      <div className="relative z-10">Magic Card</div>
    </div>
  );
};

export default GradientBorder;
