'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface PerformanceMetrics {
  renderTime: number
  memoryUsage: number
  fps: number
  loadTime: number
}

const DEFAULT_METRICS: PerformanceMetrics = {
  renderTime: 0,
  memoryUsage: 0,
  fps: 0,
  loadTime: 0,
}

function readHeapUsedMb(): number {
  const perf = typeof window !== 'undefined' ? (window.performance as Performance & { memory?: { usedJSHeapSize: number } }) : null
  const used = perf?.memory?.usedJSHeapSize
  if (typeof used !== 'number' || !Number.isFinite(used)) return 0
  return used / 1024 / 1024
}

function measureLoadTimeMs(): number {
  if (typeof window === 'undefined') return 0

  const entries = window.performance?.getEntriesByType?.('navigation') ?? []
  const nav = entries[0] as PerformanceNavigationTiming | undefined
  if (nav) {
    const value = nav.loadEventEnd - nav.startTime
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  const timing = window.performance?.timing
  if (timing) {
    const value = timing.loadEventEnd - timing.navigationStart
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  return 0
}

function performanceWarnings(metrics: PerformanceMetrics): string[] {
  const warnings: string[] = []

  if (metrics.fps < 30) warnings.push('FPS过低，可能影响用户体验')
  if (metrics.memoryUsage > 100) warnings.push('内存使用过高，建议优化')
  if (metrics.loadTime > 3000) warnings.push('页面加载时间过长')

  return warnings
}

export default function usePerformanceMonitor(): {
  metrics: PerformanceMetrics
  warnings: string[]
  isPerformanceGood: boolean
} {
  const [metrics, setMetrics] = useState<PerformanceMetrics>(DEFAULT_METRICS)
  const lastPushedRef = useRef<{ fps: number; memoryUsage: number } | null>(null)

  useEffect(() => {
    const loadTime = measureLoadTimeMs()
    if (loadTime > 0) {
      setMetrics((prev) => ({ ...prev, loadTime }))
      return
    }

    const onLoad = () => {
      const next = measureLoadTimeMs()
      setMetrics((prev) => ({ ...prev, loadTime: next }))
    }

    window.addEventListener('load', onLoad, { once: true })
    return () => window.removeEventListener('load', onLoad)
  }, [])

  useEffect(() => {
    let frameCount = 0
    let lastTime = performance.now()
    let animationId: number | null = null

    const sampleMs = 1000

    const measureFPS = (now: number) => {
      frameCount += 1

      if (now - lastTime >= sampleMs) {
        const nextFps = Math.round((frameCount * 1000) / (now - lastTime))
        const nextMemory = readHeapUsedMb()

        const last = lastPushedRef.current
        const shouldUpdate =
          !last || Math.abs(last.fps - nextFps) >= 1 || Math.abs(last.memoryUsage - nextMemory) >= 1

        if (shouldUpdate) {
          lastPushedRef.current = { fps: nextFps, memoryUsage: nextMemory }
          setMetrics((prev) => ({ ...prev, fps: nextFps, memoryUsage: nextMemory }))
        }

        frameCount = 0
        lastTime = now
      }

      animationId = requestAnimationFrame(measureFPS)
    }

    animationId = requestAnimationFrame(measureFPS)

    return () => {
      if (animationId !== null) cancelAnimationFrame(animationId)
    }
  }, [])

  const warnings = useMemo(() => performanceWarnings(metrics), [metrics])
  const isPerformanceGood = metrics.fps >= 30 && metrics.memoryUsage < 100

  return { metrics, warnings, isPerformanceGood }
}
