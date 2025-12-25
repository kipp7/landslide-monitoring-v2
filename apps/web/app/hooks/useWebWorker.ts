'use client'

import { useCallback, useEffect, useRef } from 'react'

type WebWorkerMessage = {
  action: string
  data: any
  options?: any
}

type WebWorkerResponse = {
  success: boolean
  action: string
  requestId?: string
  result?: any
  error?: { message: string; stack?: string }
  timestamp: string
}

export type UseWebWorkerOptions = {
  workerPath: string
  timeoutMs?: number
}

export function useWebWorker({ workerPath, timeoutMs = 30_000 }: UseWebWorkerOptions) {
  const workerRef = useRef<Worker | null>(null)
  const pendingRequests = useRef(
    new Map<
      string,
      {
        resolve: (value: any) => void
        reject: (error: any) => void
        timeout: ReturnType<typeof setTimeout>
      }
    >(),
  )

  const generateRequestId = useCallback(() => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, [])

  const initWorker = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (typeof Worker === 'undefined') return null

    try {
      const worker = new Worker(workerPath)

      worker.onmessage = (e: MessageEvent<WebWorkerResponse>) => {
        const { success, action, requestId, result, error } = e.data
        const key = requestId || action

        const pending = pendingRequests.current.get(key)
        if (!pending) return

        clearTimeout(pending.timeout)
        pendingRequests.current.delete(key)

        if (success) pending.resolve(result)
        else pending.reject(new Error(error?.message || 'WebWorker 执行失败'))
      }

      worker.onerror = () => {
        pendingRequests.current.forEach(({ reject, timeout }) => {
          clearTimeout(timeout)
          reject(new Error('WebWorker 遇到错误'))
        })
        pendingRequests.current.clear()
      }

      return worker
    } catch {
      return null
    }
  }, [workerPath])

  const postMessage = useCallback(
    async <T = any>(message: WebWorkerMessage): Promise<T> =>
      new Promise((resolve, reject) => {
        if (!workerRef.current) workerRef.current = initWorker()
        if (!workerRef.current) {
          reject(new Error('无法初始化 WebWorker'))
          return
        }

        const requestId = generateRequestId()
        const timeoutId = setTimeout(() => {
          const pending = pendingRequests.current.get(requestId)
          if (!pending) return
          pendingRequests.current.delete(requestId)
          reject(new Error('WebWorker 请求超时'))
        }, timeoutMs)

        pendingRequests.current.set(requestId, { resolve, reject, timeout: timeoutId })
        workerRef.current.postMessage({ ...message, requestId })
      }),
    [generateRequestId, initWorker, timeoutMs],
  )

  const terminate = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate()
    workerRef.current = null

    pendingRequests.current.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new Error('WebWorker 已终止'))
    })
    pendingRequests.current.clear()
  }, [])

  const isWorkerSupported = useCallback(() => typeof window !== 'undefined' && typeof Worker !== 'undefined', [])

  const getWorkerStatus = useCallback(
    () => ({
      isSupported: isWorkerSupported(),
      isInitialized: Boolean(workerRef.current),
      pendingRequests: pendingRequests.current.size,
    }),
    [isWorkerSupported],
  )

  useEffect(() => () => terminate(), [terminate])

  return { postMessage, terminate, isWorkerSupported, getWorkerStatus }
}

export function useGPSCalculationWorker() {
  const { postMessage, terminate, isWorkerSupported, getWorkerStatus } = useWebWorker({
    workerPath: '/workers/gps-calculation-worker.js',
    timeoutMs: 15_000,
  })

  const calculateGPSBatch = useCallback(
    async (gpsDataList: any[], baseline: any) => postMessage({ action: 'calculateGPSBatch', data: { gpsDataList, baseline } }),
    [postMessage],
  )

  const analyzeTimeSeries = useCallback(
    async (timeSeriesData: any[]) => postMessage({ action: 'analyzeTimeSeries', data: { timeSeriesData } }),
    [postMessage],
  )

  const detectAnomalies = useCallback(
    async (analysisData: any[], threshold = 3) => postMessage({ action: 'detectAnomalies', data: { analysisData }, options: { threshold } }),
    [postMessage],
  )

  const calculateSingleGPS = useCallback(
    async (currentLat: number, currentLng: number, baseLat: number, baseLng: number) =>
      postMessage({ action: 'calculateSingleGPS', data: { currentLat, currentLng, baseLat, baseLng } }),
    [postMessage],
  )

  return {
    calculateGPSBatch,
    analyzeTimeSeries,
    detectAnomalies,
    calculateSingleGPS,

    terminate,
    isWorkerSupported,
    getWorkerStatus,
  }
}

