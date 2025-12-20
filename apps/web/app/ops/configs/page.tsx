'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Input, Space, Table, Typography, message } from 'antd'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { apiGetJson, apiPutJson, type ApiSuccessResponse } from '../../../lib/v2Api'

const { Title, Text } = Typography

type ConfigRow = {
  key: string
  value: string
  type: string
  description: string
  updatedAt: string
}

type SystemConfigsResponse = { list: ConfigRow[] }

export default function OpsConfigsPage() {
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGetJson<ApiSuccessResponse<SystemConfigsResponse>>('/api/v1/system/configs')
      const list = json.data?.list ?? []
      setRows(list)
      setDraft(Object.fromEntries(list.map((r) => [r.key, r.value ?? ''])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setDraft({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConfigs()
  }, [fetchConfigs])

  const changed = useMemo(() => {
    const out: Array<{ key: string; value: string }> = []
    for (const r of rows) {
      const next = draft[r.key] ?? ''
      if (next !== (r.value ?? '')) out.push({ key: r.key, value: next })
    }
    return out
  }, [draft, rows])

  const save = async () => {
    if (changed.length === 0) {
      message.info('没有变更')
      return
    }
    setSaving(true)
    try {
      await apiPutJson<ApiSuccessResponse<unknown>>('/api/v1/system/configs', { configs: changed })
      message.success(`已保存 ${changed.length} 项`)
      await fetchConfigs()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            系统配置
          </Title>
          <Text type="secondary">GET：公开配置（无需 token）；PUT：需要 `ADMIN_API_TOKEN`</Text>
        </div>
        <Space>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/api-stats">API Stats</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchConfigs()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => void save()} loading={saving} disabled={changed.length === 0}>
            保存（{changed.length}）
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
          <div className="mt-2">
            <Text type="secondary">如果 PUT 被拒绝，请到“设置”页配置 Bearer Token。</Text>
          </div>
        </Card>
      ) : null}

      <Card>
        <Table
          rowKey="key"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 30 }}
          columns={[
            { title: 'key', dataIndex: 'key', width: 260, render: (v: string) => <span className="font-mono">{v}</span> },
            {
              title: 'value',
              dataIndex: 'value',
              render: (_: unknown, r: ConfigRow) => (
                <Input
                  value={draft[r.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [r.key]: e.target.value }))}
                />
              ),
            },
            { title: 'type', dataIndex: 'type', width: 110 },
            { title: 'description', dataIndex: 'description', width: 260 },
            { title: 'updatedAt', dataIndex: 'updatedAt', width: 180, render: (v: string) => <span className="font-mono">{v}</span> },
          ]}
        />
      </Card>
    </div>
  )
}

