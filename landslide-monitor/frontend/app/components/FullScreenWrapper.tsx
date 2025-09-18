// components/FullScreenWrapper.tsx
'use client';

import React from 'react';

interface FullScreenWrapperProps {
  children: React.ReactNode;
}

const FullScreenWrapper: React.FC<FullScreenWrapperProps> = ({ children }) => {
  return (
    <div className="w-screen h-screen bg-[#001529] overflow-hidden">
      {children}
    </div>
  );
};

export default FullScreenWrapper;
