'use client'

import type React from 'react'

interface FullScreenWrapperProps {
  children: React.ReactNode
}

export default function FullScreenWrapper({ children }: FullScreenWrapperProps) {
  return <div className="h-screen w-screen overflow-hidden bg-[#001529]">{children}</div>
}

