'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Descriptions, Select, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'

const { Title, Text } = Typography

function statusTag(status: 'online' | 'offline' | 'maintenance') {
  const color = status === 'online' ? 'green' : status === 'maintenance' ? 'orange' : 'red'
  const label = status === 'online' ? '在线' : status === 'maintenance' ? '维护' : '离线'
  return <Tag color={color}>{label}</Tag>
}

export default function DeviceManagementPage() {
  const { devices, loading: devicesLoading, error: devicesError, refetch } = useDeviceList()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0].device_id)
    }
  }, [devices, selectedDeviceId])

  const selectedDevice = useMemo(() => {
    return devices.find((d) => d.device_id === selectedDeviceId) ?? null
  }, [devices, selectedDeviceId])

  const {
    data: shadow,
    loading: shadowLoading,
    error: shadowError,
    refreshShadow,
  } = useDeviceShadow(selectedDeviceId || undefined, 10_000)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            设备管理（v2）
          </Title>
          <Text type="secondary">数据源：v2 API（services/api）</Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refreshShadow()
            }}
            loading={devicesLoading || shadowLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        <Space wrap>
          <Text strong>选择设备</Text>
          <Select
            style={{ minWidth: 360 }}
            value={selectedDeviceId || undefined}
            placeholder={devicesLoading ? '加载中…' : '请选择设备'}
            loading={devicesLoading}
            onChange={(value) => setSelectedDeviceId(value)}
            options={devices.map((d) => ({
              label: `${d.display_name || d.device_id} (${d.device_id.slice(0, 8)}…)`,
              value: d.device_id,
            }))}
          />
          {selectedDevice ? statusTag(selectedDevice.status) : null}
        </Space>

        {devicesError ? (
          <div className="mt-3">
            <Text type="danger">设备列表加载失败：{devicesError.message}</Text>
          </div>
        ) : null}
      </Card>

      <Card title="设备信息">
        {selectedDevice ? (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Device ID">{selectedDevice.device_id}</Descriptions.Item>
            <Descriptions.Item label="名称">{selectedDevice.display_name}</Descriptions.Item>
            <Descriptions.Item label="类型">{selectedDevice.type}</Descriptions.Item>
            <Descriptions.Item label="最近在线">{selectedDevice.last_active}</Descriptions.Item>
            <Descriptions.Item label="固件版本">{selectedDevice.firmwareVersion}</Descriptions.Item>
            <Descriptions.Item label="安装日期">{selectedDevice.installDate}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">暂无设备</Text>
        )}
      </Card>

      <Card
        title="最新状态（shadow）"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void refreshShadow()} loading={shadowLoading}>
            刷新状态
          </Button>
        }
      >
        {shadowError ? <Text type="danger">状态获取失败：{shadowError}</Text> : null}
        {shadow?.properties ? (
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="时间">{shadow.event_time}</Descriptions.Item>
            <Descriptions.Item label="风险等级">{shadow.properties.risk_level ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="告警">{shadow.properties.alarm_active ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="温度">{shadow.properties.temperature ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="湿度">{shadow.properties.humidity ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="光照">{shadow.properties.illumination ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="纬度">{shadow.properties.latitude ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="经度">{shadow.properties.longitude ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="振动">{shadow.properties.vibration ?? '-'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">{shadowLoading ? '加载中…' : '暂无数据'}</Text>
        )}
      </Card>
    </div>
  )
}

