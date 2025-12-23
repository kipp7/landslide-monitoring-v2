'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Select, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../../hooks/useDeviceList'
import { listAiPredictions, type AiPredictionRiskLevel } from '../../../lib/api/aiPredictions'

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

export default function AiPredictionsPage() {
  const { devices, loading: devicesLoading, refetch } = useDeviceList()
  const deviceOptions = useMemo(
    () => [{ value: 'all', label: 'all' }, ...devices.map((d) => ({ value: d.device_id, label: `${d.display_name} (${d.device_id})` }))],
    [devices],
  )

  const riskOptions = useMemo(
    () => [
      { value: 'all', label: 'all' },
      { value: 'low', label: 'low' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
    ],
    [],
  )

  const [selectedDevice, setSelectedDevice] = useState<string>('all')
  const [riskLevel, setRiskLevel] = useState<'all' | AiPredictionRiskLevel>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  async function runQuery(): Promise<void> {
    try {
      setLoading(true)
      setError(null)
      const resp = await listAiPredictions({
        page: 1,
        pageSize: 50,
        deviceId: selectedDevice === 'all' ? undefined : selectedDevice,
        riskLevel: riskLevel === 'all' ? undefined : riskLevel,
      })
      setResult(resp.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            AI Predictions
          </Title>
          <Text type="secondary">`/api/v1/ai/predictions` 的最小查看页（来自 `ai_predictions` 表）</Text>
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

      <Card title="查询" size="small">
        <Space wrap>
          <span>device</span>
          <Select
            style={{ minWidth: 420 }}
            value={selectedDevice}
            showSearch
            loading={devicesLoading}
            options={deviceOptions}
            onChange={(v) => setSelectedDevice(v)}
          />
          <span>riskLevel</span>
          <Select style={{ minWidth: 140 }} value={riskLevel} options={riskOptions} onChange={(v) => setRiskLevel(v)} />
          <Button type="primary" loading={loading} onClick={() => void runQuery()}>
            查询
          </Button>
        </Space>
      </Card>

      <Card title="结果" size="small">
        {result ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {stringify(result)}
          </pre>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>
    </div>
  )
}

