'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Divider, Input, Select, Space, Typography } from 'antd'
import { apiGetJson } from '../../../lib/v2Api'

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

type Preset = { label: string; path: string }

export default function OpsDebugApiPage() {
  const presets: Preset[] = useMemo(
    () => [
      { label: 'GET /api/v1/system/status', path: '/api/v1/system/status' },
      { label: 'GET /api/v1/dashboard', path: '/api/v1/dashboard' },
      { label: 'GET /api/v1/system/configs', path: '/api/v1/system/configs' },
      { label: 'GET /api/v1/system/logs/api-stats', path: '/api/v1/system/logs/api-stats' },
      { label: 'GET /api/v1/system/logs/operation', path: '/api/v1/system/logs/operation?page=1&pageSize=10' },
      { label: 'GET /api/v1/stations', path: '/api/v1/stations?page=1&pageSize=10' },
      { label: 'GET /api/v1/devices', path: '/api/v1/devices?page=1&pageSize=10' },
      { label: 'GET /api/v1/alerts', path: '/api/v1/alerts?page=1&pageSize=10' },
      { label: 'GET /api/v1/sensors', path: '/api/v1/sensors?page=1&pageSize=10' },
      { label: 'GET /api/v1/telemetry/dlq/stats', path: '/api/v1/telemetry/dlq/stats' },
    ],
    [],
  )

  const [selected, setSelected] = useState<string>(presets[0]?.path ?? '/api/v1/system/status')
  const [path, setPath] = useState<string>(selected)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')

  const run = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult('')
      const json = await apiGetJson<unknown>(path)
      setResult(stringify(json))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setResult('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Debug API
          </Title>
          <Text type="secondary">受 RBAC 保护的“接口连通性”调试页（仅 GET；不内嵌密钥；不直连数据库）。</Text>
        </div>
        <Space>
          <Link href="/ops/system-monitor">系统监控</Link>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/api-stats">API Stats</Link>
        </Space>
      </div>

      <Card>
        <Space wrap>
          <Select
            style={{ width: 420 }}
            value={selected}
            options={presets.map((p) => ({ value: p.path, label: p.label }))}
            onChange={(v) => {
              setSelected(v)
              setPath(v)
            }}
          />
          <Input style={{ width: 520 }} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/v1/..." />
          <Button type="primary" onClick={() => void run()} loading={loading}>
            请求
          </Button>
        </Space>

        <Divider />

        {error ? (
          <div>
            <Text type="danger">请求失败：{error}</Text>
            <div className="mt-2">
              <Text type="secondary">如果提示 401/403，请先登录或在“设置”页配置 Bearer Token。</Text>
            </div>
          </div>
        ) : null}

        {result ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {result}
          </pre>
        ) : (
          <Text type="secondary">{loading ? '请求中…' : '暂无输出'}</Text>
        )}
      </Card>
    </div>
  )
}

