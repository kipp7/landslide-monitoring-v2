'use client'

export default function usePerformanceMonitor(): { warnings: string[]; isPerformanceGood: boolean } {
  return { warnings: [], isPerformanceGood: true }
}

