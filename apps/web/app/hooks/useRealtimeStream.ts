'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildApiUrl, getApiAuthHeaders } from '../../lib/v2Api'

export type RealtimeMessage =
  | {
      type: 'connection'
      clientId: string
      timestamp: string
      message: string
      traceId?: string
    }
  | { type: 'heartbeat'; timestamp: string; connectedClients: number }
  | { type: 'initial_data'; deviceId: string; data: unknown; timestamp: string }
  | { type: 'device_data'; deviceId: string; data: unknown; timestamp: string; sequence?: number }
  | { type: 'anomaly_alert'; deviceId: string; data: unknown; timestamp: string; severity?: string; alertId?: string }
  | { type: 'system_status'; data: unknown; timestamp: string; activeClients?: number; connectedDevices?: string[] }
  | { type: 'error'; timestamp: string; message: string; status?: number; traceId?: string }

export type UseRealtimeStreamOptions = {
  deviceId?: string
  pollMs?: number
  heartbeatMs?: number
  autoReconnect?: boolean
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
  onMessage?: (msg: RealtimeMessage) => void
}

type ConnectionStats = {
  connectedAt?: string
  reconnectCount: number
  messagesReceived: number
  lastHeartbeat?: string
}

function parseSseChunk(
  buffer: string,
  onEvent: (data: string) => void,
): { remaining: string } {
  let rest = buffer
  while (true) {
    const sep = rest.indexOf('\n\n')
    if (sep === -1) break
    const block = rest.slice(0, sep)
    rest = rest.slice(sep + 2)

    const lines = block.split('\n')
    const dataLines: string[] = []
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '')
      if (!trimmed) continue
      if (trimmed.startsWith(':')) continue
      if (trimmed.startsWith('data:')) dataLines.push(trimmed.slice('data:'.length).trimStart())
    }
    if (dataLines.length > 0) onEvent(dataLines.join('\n'))
  }
  return { remaining: rest }
}

export function useRealtimeStream({
  deviceId = 'all',
  pollMs = 5000,
  heartbeatMs = 30000,
  autoReconnect = true,
  reconnectDelayMs = 5000,
  maxReconnectAttempts = 5,
  onMessage,
}: UseRealtimeStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null)
  const [stats, setStats] = useState<ConnectionStats>({ reconnectCount: 0, messagesReceived: 0 })

  const abortRef = useRef<AbortController | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const connectRef = useRef<(() => void) | null>(null)

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null
    setIsConnected(false)
    setIsConnecting(false)
    setConnectionError(null)
  }, [])

  const connect = useCallback(() => {
    if (abortRef.current) return

    setIsConnecting(true)
    setConnectionError(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const run = async () => {
      try {
        const url = new URL(buildApiUrl('/api/v1/realtime/stream'), window.location.origin)
        url.searchParams.set('device_id', deviceId)
        url.searchParams.set('poll_ms', String(pollMs))
        url.searchParams.set('heartbeat_ms', String(heartbeatMs))

        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: { ...getApiAuthHeaders(), Accept: 'text/event-stream' },
          signal: ctrl.signal,
          cache: 'no-store',
        })

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
        }
        if (!resp.body) {
          throw new Error('SSE response body is empty')
        }

        setIsConnected(true)
        setIsConnecting(false)
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
        setStats((prev) => ({
          ...prev,
          connectedAt: new Date().toISOString(),
          reconnectCount: prev.reconnectCount + (prev.connectedAt ? 1 : 0),
        }))

        const reader = resp.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parsed = parseSseChunk(buffer, (data) => {
            try {
              const msg = JSON.parse(data) as RealtimeMessage
              setLastMessage(msg)
              setStats((prev) => ({
                ...prev,
                messagesReceived: prev.messagesReceived + 1,
                lastHeartbeat: msg.type === 'heartbeat' ? msg.timestamp : prev.lastHeartbeat,
              }))
              onMessage?.(msg)
            } catch {
              // ignore parse errors
            }
          })
          buffer = parsed.remaining
        }

        throw new Error('SSE stream closed')
      } catch (caught) {
        if (ctrl.signal.aborted) return
        setIsConnected(false)
        setIsConnecting(false)
        setConnectionError(caught instanceof Error ? caught.message : String(caught))

        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1
          reconnectTimerRef.current = setTimeout(() => {
            abortRef.current = null
            connectRef.current?.()
          }, reconnectDelayMs)
        } else {
          abortRef.current = null
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null
      }
    }

    void run()
  }, [autoReconnect, deviceId, heartbeatMs, maxReconnectAttempts, onMessage, pollMs, reconnectDelayMs])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => () => disconnect(), [disconnect])

  return { isConnected, isConnecting, connectionError, lastMessage, stats, connect, disconnect }
}
