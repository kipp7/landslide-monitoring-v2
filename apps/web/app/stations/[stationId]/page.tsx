'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { getStationDetail, type StationRow } from '../../../lib/api/stations'
import { listDevices, type DeviceRow } from '../../../lib/api/devices'

const { Title, Text } = Typography

function stationStatusTag(status: StationRow['status']) {
  const color = status === 'active' ? 'green' : status === 'maintenance' ? 'orange' : 'red'
  return <Tag color={color}>{status}</Tag>
}

function deviceStatusTag(status: DeviceRow['status']) {
  const color = status === 'active' ? 'green' : status === 'inactive' ? 'orange' : 'red'
  return <Tag color={color}>{status}</Tag>
}

export default function StationDetailPage() {
  const params = useParams<{ stationId: string }>()
  const router = useRouter()
  const stationId = useMemo(() => decodeURIComponent(String(params.stationId ?? '')).trim(), [params.stationId])

  const [station, setStation] = useState<StationRow | null>(null)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!stationId) return
    setLoading(true)
    try {
      const [stationJson, devicesJson] = await Promise.all([
        getStationDetail(stationId),
        listDevices({ page: 1, pageSize: 200, stationId }),
      ])
      setStation(stationJson.data)
      setDevices(devicesJson.data?.list ?? [])
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
      setStation(null)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  if (!stationId) {
    return (
      <Card>
        <Text type="danger">缺少 stationId</Text>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            站点详情
          </Title>
          <Text type="secondary">数据源：v2 API（/api/v1/stations/:stationId, /api/v1/devices?stationId=...）</Text>
        </div>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/stations')}>
            返回
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        {!station ? (
          <Text type="secondary">加载中或站点不存在。</Text>
        ) : (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="stationId">
              <span className="font-mono">{station.stationId}</span>
            </Descriptions.Item>
            <Descriptions.Item label="stationCode">{station.stationCode}</Descriptions.Item>
            <Descriptions.Item label="stationName">{station.stationName}</Descriptions.Item>
            <Descriptions.Item label="status">{stationStatusTag(station.status)}</Descriptions.Item>
            <Descriptions.Item label="location">
              {station.latitude && station.longitude ? (
                <span className="font-mono">
                  {station.latitude.toFixed(6)}, {station.longitude.toFixed(6)}
                </span>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="updatedAt">
              <span className="font-mono">{station.updatedAt}</span>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="设备列表" extra={<Text type="secondary">共 {devices.length} 台</Text>}>
        <Table
          rowKey="deviceId"
          size="small"
          pagination={{ pageSize: 20 }}
          dataSource={devices}
          columns={[
            { title: 'deviceId', dataIndex: 'deviceId', render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'deviceName', dataIndex: 'deviceName', render: (v?: string) => v ?? '-' },
            { title: 'deviceType', dataIndex: 'deviceType', render: (v?: string) => v ?? '-' },
            { title: 'status', dataIndex: 'status', render: (v: DeviceRow['status']) => deviceStatusTag(v) },
            {
              title: 'lastSeenAt',
              dataIndex: 'lastSeenAt',
              render: (v?: string | null) => (v ? <span className="font-mono">{v}</span> : '-'),
            },
          ]}
        />
      </Card>
    </div>
  )
}

