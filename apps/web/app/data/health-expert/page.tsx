'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Select, Space, Switch, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../../hooks/useDeviceList'
import {
  getDeviceHealthExpertAssessment,
  getDeviceHealthExpertHistory,
  postDeviceHealthExpertAction,
  type DeviceHealthExpertMetric,
} from '../../../lib/api/deviceHealthExpert'

const { Title, Text } = Typography

function stringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function DeviceHealthExpertPage() {
  const { devices, loading: devicesLoading, refetch } = useDeviceList()
  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` })),
    [devices],
  )

  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [metric, setMetric] = useState<DeviceHealthExpertMetric>('all')
  const [forceRefresh, setForceRefresh] = useState<boolean>(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assessment, setAssessment] = useState<unknown>(null)
  const [history, setHistory] = useState<unknown>(null)
  const [actionResult, setActionResult] = useState<unknown>(null)

  const metricOptions = useMemo(
    () => [
      { value: 'all', label: 'all' },
      { value: 'health', label: 'health' },
      { value: 'battery', label: 'battery' },
      { value: 'signal', label: 'signal' },
    ],
    [],
  )

  async function runAssessment(): Promise<void> {
    if (!deviceId) return
    try {
      setLoading(true)
      setError(null)
      const resp = await getDeviceHealthExpertAssessment(deviceId, { metric, forceRefresh })
      setAssessment(resp.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setAssessment(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(): Promise<void> {
    if (!deviceId) return
    try {
      setLoading(true)
      setError(null)
      const resp = await getDeviceHealthExpertHistory(deviceId, { limit: 50 })
      setHistory(resp.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setHistory(null)
    } finally {
      setLoading(false)
    }
  }

  async function recalibrate(): Promise<void> {
    if (!deviceId) return
    try {
      setLoading(true)
      setError(null)
      const resp = await postDeviceHealthExpertAction(deviceId, { action: 'recalibrate', parameters: {} })
      setActionResult(resp.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setActionResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Device Health Expert
          </Title>
          <Text type="secondary">`/api/v1/devices/:deviceId/health/expert` 的最小调试页（缓存/历史/动作）</Text>
        </div>
        <Space>
          <Link href="/analysis">概览</Link>
          <Link href="/data">数据浏览器</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={devicesLoading}>
            刷新设备
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      <Card title="请求" size="small">
        <Space wrap>
          <span>device</span>
          <Select
            style={{ minWidth: 420 }}
            value={deviceId}
            showSearch
            allowClear
            loading={devicesLoading}
            options={deviceOptions}
            onChange={(v) => setDeviceId(v)}
            placeholder="选择设备"
          />
          <span>metric</span>
          <Select style={{ minWidth: 140 }} value={metric} options={metricOptions} onChange={(v) => setMetric(v)} />
          <span>forceRefresh</span>
          <Switch checked={forceRefresh} onChange={(v) => setForceRefresh(v)} />
          <Button type="primary" disabled={!deviceId} loading={loading} onClick={() => void runAssessment()}>
            运行评估
          </Button>
          <Button disabled={!deviceId} loading={loading} onClick={() => void loadHistory()}>
            查看历史
          </Button>
          <Button danger disabled={!deviceId} loading={loading} onClick={() => void recalibrate()}>
            Recalibrate
          </Button>
        </Space>
      </Card>

      <Card title="评估结果" size="small">
        {assessment ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {stringify(assessment)}
          </pre>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>

      <Card title="历史记录" size="small">
        {history ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {stringify(history)}
          </pre>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>

      <Card title="动作返回" size="small">
        {actionResult ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {stringify(actionResult)}
          </pre>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>
    </div>
  )
}

