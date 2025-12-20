'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { apiGetJson, type ApiSuccessResponse } from '../../lib/v2Api'

const { Title, Text } = Typography

type StationRow = {
  stationId: string
  stationCode: string
  stationName: string
  status: 'active' | 'inactive' | 'maintenance'
  latitude: number | null
  longitude: number | null
  altitude: number | null
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

type StationListResponse = {
  list: StationRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

function statusTag(status: StationRow['status']) {
  const color = status === 'active' ? 'green' : status === 'maintenance' ? 'orange' : 'red'
  return <Tag color={color}>{status}</Tag>
}

export default function StationsPage() {
  const [rows, setRows] = useState<StationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGetJson<ApiSuccessResponse<StationListResponse>>('/api/v1/stations?page=1&pageSize=200')
      setRows(json.data?.list ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            站点
          </Title>
          <Text type="secondary">数据源：v2 API（/api/v1/stations）</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchStations()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        {error ? <Text type="danger">加载失败：{error}</Text> : null}
        <Table
          rowKey="stationId"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          size="small"
          columns={[
            { title: 'Code', dataIndex: 'stationCode' },
            { title: 'Name', dataIndex: 'stationName' },
            { title: 'Status', dataIndex: 'status', render: (v: StationRow['status']) => statusTag(v) },
            {
              title: 'Location',
              render: (_: unknown, r: StationRow) =>
                r.latitude && r.longitude ? `${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}` : '-',
            },
            { title: 'Updated', dataIndex: 'updatedAt', render: (v: string) => <span className="font-mono">{v}</span> },
          ]}
        />
      </Card>
    </div>
  )
}

