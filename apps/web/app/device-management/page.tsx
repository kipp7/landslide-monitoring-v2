'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'
import { apiGetJson, apiJson, getApiAuthHeaders, type ApiSuccessResponse } from '../../lib/v2Api'

const { Title, Text } = Typography

function statusTag(status: 'online' | 'offline' | 'maintenance') {
  const color = status === 'online' ? 'green' : status === 'maintenance' ? 'orange' : 'red'
  const label = status === 'online' ? '在线' : status === 'maintenance' ? '维护' : '离线'
  return <Tag color={color}>{label}</Tag>
}

type StationRow = {
  stationId: string
  stationCode: string
  stationName: string
  status: 'active' | 'inactive' | 'maintenance'
}

type StationListResponse = {
  list: StationRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

type CreateDeviceResponse = {
  deviceId: string
  deviceSecret: string
  schemaVersion: number
  credVersion: number
}

type DeviceCommand = {
  commandId: string
  deviceId: string
  commandType: string
  payload: Record<string, unknown>
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'timeout' | 'canceled'
  createdAt: string
  updatedAt: string
}

type PaginatedDeviceCommands = {
  list: DeviceCommand[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

type CreateDeviceCommandResponse = {
  commandId: string
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'timeout'
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

  const { data: shadow, loading: shadowLoading, error: shadowError, refreshShadow } = useDeviceShadow(
    selectedDeviceId || undefined,
    10_000
  )

  const [stations, setStations] = useState<StationRow[]>([])
  const [stationsLoading, setStationsLoading] = useState(false)

  const fetchStations = useCallback(async () => {
    try {
      setStationsLoading(true)
      const json = await apiGetJson<ApiSuccessResponse<StationListResponse>>(
        '/api/v1/stations?page=1&pageSize=200'
      )
      setStations(json.data?.list ?? [])
    } catch {
      setStations([])
    } finally {
      setStationsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  const [createDeviceOpen, setCreateDeviceOpen] = useState(false)
  const [createDeviceResult, setCreateDeviceResult] = useState<CreateDeviceResponse | null>(null)
  const [createDeviceLoading, setCreateDeviceLoading] = useState(false)
  const [createDeviceForm] = Form.useForm()

  const onCreateDevice = async () => {
    const values = (await createDeviceForm.validateFields()) as {
      deviceName?: string
      deviceType?: string
      stationId?: string
      metadataJson?: string
    }

    let metadata: Record<string, unknown> | undefined
    if (values.metadataJson && values.metadataJson.trim()) {
      try {
        metadata = JSON.parse(values.metadataJson) as Record<string, unknown>
      } catch {
        message.error('metadataJson 不是合法 JSON')
        return
      }
    }

    setCreateDeviceLoading(true)
    try {
      const json = await apiJson<ApiSuccessResponse<CreateDeviceResponse>>('/api/v1/devices', {
        deviceName: values.deviceName,
        deviceType: values.deviceType,
        stationId: values.stationId || null,
        metadata: metadata ?? {},
      })
      setCreateDeviceResult(json.data)
      message.success('设备创建成功（deviceSecret 仅本次可见）')
      void refetch()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setCreateDeviceLoading(false)
    }
  }

  const revokeSelectedDevice = async () => {
    if (!selectedDeviceId) return
    Modal.confirm({
      title: '吊销设备',
      content: '吊销后设备 MQTT 鉴权会立即失效，确认继续？',
      okText: '确认吊销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const resp = await fetch(`/api/v1/devices/${encodeURIComponent(selectedDeviceId)}/revoke`, {
          method: 'PUT',
          headers: { Accept: 'application/json', ...getApiAuthHeaders() },
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
        message.success('已吊销')
        await refetch()
      },
    })
  }

  const [commands, setCommands] = useState<DeviceCommand[]>([])
  const [commandsLoading, setCommandsLoading] = useState(false)
  const [commandForm] = Form.useForm()

  const fetchCommands = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      setCommandsLoading(true)
      const json = await apiGetJson<ApiSuccessResponse<PaginatedDeviceCommands>>(
        `/api/v1/devices/${encodeURIComponent(selectedDeviceId)}/commands?page=1&pageSize=20`
      )
      setCommands(json.data?.list ?? [])
    } catch {
      setCommands([])
    } finally {
      setCommandsLoading(false)
    }
  }, [selectedDeviceId])

  useEffect(() => {
    void fetchCommands()
  }, [fetchCommands])

  const sendCommand = async () => {
    if (!selectedDeviceId) return
    const values = (await commandForm.validateFields()) as { commandType: string; payloadJson: string }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(values.payloadJson) as Record<string, unknown>
    } catch {
      message.error('payloadJson 不是合法 JSON')
      return
    }

    try {
      const json = await apiJson<ApiSuccessResponse<CreateDeviceCommandResponse>>(
        `/api/v1/devices/${encodeURIComponent(selectedDeviceId)}/commands`,
        { commandType: values.commandType, payload }
      )
      message.success(`命令已创建：${json.data.commandId}（${json.data.status}）`)
      commandForm.resetFields()
      await fetchCommands()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }

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
          <Button icon={<PlusOutlined />} onClick={() => setCreateDeviceOpen(true)}>
            创建设备
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refreshShadow()
              void fetchStations()
              void fetchCommands()
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
          <Button danger icon={<StopOutlined />} disabled={!selectedDeviceId} onClick={() => void revokeSelectedDevice()}>
            吊销
          </Button>
        </Space>

        {devicesError ? (
          <div className="mt-3">
            <Text type="danger">设备列表加载失败：{devicesError.message}</Text>
          </div>
        ) : null}
      </Card>

      <Card title="设备命令">
        <Form form={commandForm} layout="inline" style={{ gap: 12, marginBottom: 12 }}>
          <Form.Item name="commandType" rules={[{ required: true, message: 'commandType 必填' }]} style={{ minWidth: 260 }}>
            <Input placeholder="commandType，例如 ping / reboot / set_config" />
          </Form.Item>
          <Form.Item name="payloadJson" rules={[{ required: true, message: 'payloadJson 必填' }]} style={{ flex: 1, minWidth: 360 }}>
            <Input.TextArea placeholder='payload JSON，例如 {"seq":1}' autoSize />
          </Form.Item>
          <Button type="primary" icon={<SendOutlined />} onClick={() => void sendCommand()}>
            下发
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchCommands()} loading={commandsLoading}>
            刷新
          </Button>
        </Form>

        <Table
          rowKey="commandId"
          size="small"
          loading={commandsLoading}
          dataSource={commands}
          pagination={false}
          columns={[
            { title: 'commandId', dataIndex: 'commandId', render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'type', dataIndex: 'commandType' },
            { title: 'status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
            { title: 'createdAt', dataIndex: 'createdAt', render: (v: string) => <span className="font-mono">{v}</span> },
          ]}
        />
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

      <Modal
        title="创建设备（返回 secret 仅一次）"
        open={createDeviceOpen}
        onCancel={() => {
          setCreateDeviceOpen(false)
          setCreateDeviceResult(null)
          createDeviceForm.resetFields()
        }}
        onOk={() => void onCreateDevice()}
        okText="创建"
        confirmLoading={createDeviceLoading}
      >
        {createDeviceResult ? (
          <div className="space-y-2">
            <Text strong>deviceId</Text>
            <div className="font-mono">{createDeviceResult.deviceId}</div>
            <Text strong>deviceSecret（请立即保存）</Text>
            <div className="font-mono">{createDeviceResult.deviceSecret}</div>
            <Text type="secondary">提示：服务端不会明文保存 deviceSecret，本页面关闭后将无法再次获取。</Text>
          </div>
        ) : (
          <Form form={createDeviceForm} layout="vertical" initialValues={{ metadataJson: '{}' }}>
            <Form.Item name="deviceName" label="deviceName">
              <Input placeholder="可选" />
            </Form.Item>
            <Form.Item name="deviceType" label="deviceType">
              <Input placeholder="可选，例如 rk2206" />
            </Form.Item>
            <Form.Item name="stationId" label="stationId（可选）">
              <Select
                allowClear
                showSearch
                loading={stationsLoading}
                options={stations.map((s) => ({
                  label: `${s.stationName} (${s.stationCode})`,
                  value: s.stationId,
                }))}
              />
            </Form.Item>
            <Form.Item name="metadataJson" label="metadata JSON">
              <Input.TextArea autoSize placeholder="{}" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  )
}

