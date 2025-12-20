'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { apiGetJson, type ApiSuccessResponse } from '../../../lib/v2Api'

const { Title, Text } = Typography

type ApiStatsResponse = {
  since: string
  total: number
  byStatus: Record<'2xx' | '3xx' | '4xx' | '5xx', number>
  avgResponseTimeMs: number | null
  topPaths: Array<{ method: string; path: string; count: number; p95ResponseTimeMs: number | null }>
}

export default function OpsApiStatsPage() {
  const [data, setData] = useState<ApiStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGetJson<ApiSuccessResponse<ApiStatsResponse>>('/api/v1/system/logs/api-stats')
      setData(json.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            API 统计（近 24h）
          </Title>
          <Text type="secondary">数据源：`/api/v1/system/logs/api-stats`（需要 `ADMIN_API_TOKEN`）</Text>
        </div>
        <Space>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/logs">操作日志</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchStats()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
        </Card>
      ) : null}

      <Card title="摘要" size="small">
        {data ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="since">{data.since}</Descriptions.Item>
            <Descriptions.Item label="total">{data.total}</Descriptions.Item>
            <Descriptions.Item label="2xx">
              <Tag color="green">{data.byStatus['2xx']}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="4xx">
              <Tag color="orange">{data.byStatus['4xx']}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="5xx">
              <Tag color="red">{data.byStatus['5xx']}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="avgResponseTimeMs">{data.avgResponseTimeMs ?? '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>

      <Card title="Top Paths" size="small">
        <Table
          rowKey={(r) => `${r.method}:${r.path}`}
          size="small"
          loading={loading}
          dataSource={data?.topPaths ?? []}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'method', dataIndex: 'method', width: 100 },
            { title: 'path', dataIndex: 'path', render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'count', dataIndex: 'count', width: 110 },
            { title: 'p95(ms)', dataIndex: 'p95ResponseTimeMs', width: 110, render: (v: number | null) => (v ?? '-') },
          ]}
        />
      </Card>
    </div>
  )
}

