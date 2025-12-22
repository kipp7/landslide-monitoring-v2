'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { listDevices, type DeviceRow } from '../../../lib/api/devices'
import { getStationDetail, type StationRow } from '../../../lib/api/stations'

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
  const stationId = params.stationId

  const [station, setStation] = useState<StationRow | null>(null)
  const [devices, setDevices] = useState<DeviceRow[]>([])

  const [loadingStation, setLoadingStation] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(false)

  const [stationError, setStationError] = useState<string | null>(null)
  const [devicesError, setDevicesError] = useState<string | null>(null)

  const fetchStation = useCallback(async () => {
    try {
      setLoadingStation(true)
      setStationError(null)
      const json = await getStationDetail(stationId)
      setStation(json.data ?? null)
    } catch (caught) {
      setStationError(caught instanceof Error ? caught.message : String(caught))
      setStation(null)
    } finally {
      setLoadingStation(false)
    }
  }, [stationId])

  const fetchDevices = useCallback(async () => {
    try {
      setLoadingDevices(true)
      setDevicesError(null)
      const json = await listDevices({ page: 1, pageSize: 200, stationId })
      setDevices(json.data?.list ?? [])
    } catch (caught) {
      setDevicesError(caught instanceof Error ? caught.message : String(caught))
      setDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }, [stationId])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStation(), fetchDevices()])
  }, [fetchDevices, fetchStation])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/stations')}>
              返回
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              站点详情
            </Title>
          </Space>
          <Text type="secondary">
            stationId: <span className="font-mono">{stationId}</span>
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()} loading={loadingStation || loadingDevices}>
            刷新
          </Button>
          <Link href="/device-management">设备管理</Link>
        </Space>
      </div>

      <Card title="站点信息" size="small" loading={loadingStation}>
        {stationError ? <Text type="danger">加载失败：{stationError}</Text> : null}
        {station ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="stationCode">{station.stationCode}</Descriptions.Item>
            <Descriptions.Item label="stationName">{station.stationName}</Descriptions.Item>
            <Descriptions.Item label="status">{stationStatusTag(station.status)}</Descriptions.Item>
            <Descriptions.Item label="location">
              {station.latitude !== null && station.longitude !== null
                ? `${station.latitude.toFixed(6)}, ${station.longitude.toFixed(6)}`
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="updatedAt">
              <span className="font-mono">{station.updatedAt}</span>
            </Descriptions.Item>
            <Descriptions.Item label="createdAt">
              <span className="font-mono">{station.createdAt}</span>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Card>

      <Card
        title={`绑定设备（${devices.length}）`}
        size="small"
        loading={loadingDevices}
        extra={<Text type="secondary">数据源：`/api/v1/devices?stationId=...`</Text>}
      >
        {devicesError ? <Text type="danger">加载失败：{devicesError}</Text> : null}
        <Table
          rowKey="deviceId"
          size="small"
          dataSource={devices}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'deviceId', dataIndex: 'deviceId', width: 260, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'deviceName', dataIndex: 'deviceName', width: 200, render: (v?: string) => v || '-' },
            { title: 'deviceType', dataIndex: 'deviceType', width: 160, render: (v?: string) => v || '-' },
            { title: 'status', dataIndex: 'status', width: 120, render: (v: DeviceRow['status']) => deviceStatusTag(v) },
            { title: 'lastSeenAt', dataIndex: 'lastSeenAt', render: (v?: string | null) => (v ? <span className="font-mono">{v}</span> : '-') },
          ]}
        />
      </Card>
    </div>
  )
}
