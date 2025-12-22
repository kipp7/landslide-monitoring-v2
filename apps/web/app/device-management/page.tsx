'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Tabs,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import useDeviceList from '../hooks/useDeviceList'
import useDeviceShadow from '../hooks/useDeviceShadow'
import useSensors from '../hooks/useSensors'
import {
  createDevice,
  createDeviceCommand,
  getDeviceSensors,
  listDeviceCommandEvents,
  listDeviceCommandNotifications,
  listDeviceCommands,
  markDeviceCommandNotificationRead,
  putDeviceSensors,
  revokeDevice,
} from '../../lib/api/devices'
import { listStations } from '../../lib/api/stations'

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

type DeviceSensorRow = {
  sensorKey: string
  status: 'enabled' | 'disabled' | 'missing'
  displayName: string
  unit: string
  dataType: 'float' | 'int' | 'bool' | 'string'
}

type PaginatedDeviceCommandEvents = {
  list: Array<{
    eventId: string
    commandId: string
    eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
    createdAt: string
    payload?: Record<string, unknown>
    reasonCode?: string | null
    message?: string | null
  }>
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

type PaginatedDeviceCommandNotifications = {
  list: Array<{
    notificationId: string
    commandId: string
    eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
    notifyType: 'app' | 'sms' | 'email' | 'wechat'
    status: 'pending' | 'sent' | 'delivered' | 'failed'
    isRead: boolean
    createdAt: string
    updatedAt: string
    payload?: Record<string, unknown>
  }>
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function DeviceManagementPage() {
  const router = useRouter()
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

  const { data: shadow, loading: shadowLoading, error: shadowError, refreshShadow } = useDeviceShadow(selectedDeviceId, 10_000)
  const { byKey: sensorsByKey, error: sensorsError } = useSensors()

  const [stations, setStations] = useState<StationRow[]>([])
  const [stationsLoading, setStationsLoading] = useState(false)

  const fetchStations = useCallback(async () => {
    try {
      setStationsLoading(true)
      const json = await listStations(1, 200)
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
      const json = await createDevice({
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
        await revokeDevice(selectedDeviceId)
        message.success('已吊销')
        await refetch()
      },
    })
  }

  const metricsRows = useMemo(() => {
    const metrics = shadow?.metrics ?? {}
    const entries = Object.entries(metrics).filter(([k]) => !k.startsWith('_'))
    entries.sort((a, b) => a[0].localeCompare(b[0]))
    return entries.map(([sensorKey, value]) => {
      const sensor = sensorsByKey.get(sensorKey)
      return {
        sensorKey,
        name: sensor?.displayName ?? sensorKey,
        unit: sensor?.unit ?? '',
        value,
      }
    })
  }, [shadow?.metrics, sensorsByKey])

  const [deviceSensors, setDeviceSensors] = useState<DeviceSensorRow[]>([])
  const [deviceSensorsLoading, setDeviceSensorsLoading] = useState(false)
  const [addSensorKey, setAddSensorKey] = useState<string>('')

  const fetchDeviceSensors = useCallback(async () => {
    if (!selectedDeviceId) {
      setDeviceSensors([])
      return
    }
    try {
      setDeviceSensorsLoading(true)
      const json = await getDeviceSensors(selectedDeviceId)
      setDeviceSensors(json.data?.list ?? [])
    } catch {
      setDeviceSensors([])
    } finally {
      setDeviceSensorsLoading(false)
    }
  }, [selectedDeviceId])

  useEffect(() => {
    void fetchDeviceSensors()
  }, [fetchDeviceSensors])

  const saveDeviceSensors = async () => {
    if (!selectedDeviceId) return
    try {
      setDeviceSensorsLoading(true)
      await putDeviceSensors(
        selectedDeviceId,
        deviceSensors.map((s) => ({ sensorKey: s.sensorKey, status: s.status }))
      )
      message.success('已保存传感器声明')
      await fetchDeviceSensors()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setDeviceSensorsLoading(false)
    }
  }

  const addSensor = () => {
    const key = addSensorKey.trim()
    if (!key) return
    if (deviceSensors.some((s) => s.sensorKey === key)) {
      message.info('该 sensorKey 已存在')
      return
    }
    const sensor = sensorsByKey.get(key)
    setDeviceSensors((prev) => [
      ...prev,
      {
        sensorKey: key,
        status: 'enabled',
        displayName: sensor?.displayName ?? key,
        unit: sensor?.unit ?? '',
        dataType: sensor?.dataType ?? 'float',
      },
    ])
    setAddSensorKey('')
  }

  const [auditOpen, setAuditOpen] = useState(false)
  const [auditCommandId, setAuditCommandId] = useState<string>('')
  const [eventsLoading, setEventsLoading] = useState(false)
  const [events, setEvents] = useState<PaginatedDeviceCommandEvents['list']>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notifications, setNotifications] = useState<PaginatedDeviceCommandNotifications['list']>([])

  const fetchCommandAudit = useCallback(async () => {
    if (!selectedDeviceId) return

    try {
      setEventsLoading(true)
      const json = await listDeviceCommandEvents(selectedDeviceId, { page: 1, pageSize: 50, commandId: auditCommandId })
      setEvents(json.data?.list ?? [])
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }

    try {
      setNotificationsLoading(true)
      const json = await listDeviceCommandNotifications(selectedDeviceId, { page: 1, pageSize: 50, commandId: auditCommandId })
      setNotifications(json.data?.list ?? [])
    } catch {
      setNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }, [auditCommandId, selectedDeviceId])

  useEffect(() => {
    if (!auditOpen) return
    void fetchCommandAudit()
  }, [auditOpen, fetchCommandAudit])

  const markNotificationRead = async (notificationId: string) => {
    if (!selectedDeviceId) return
    try {
      await markDeviceCommandNotificationRead(selectedDeviceId, notificationId)
      message.success('已标记已读')
      await fetchCommandAudit()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const [commands, setCommands] = useState<DeviceCommand[]>([])
  const [commandsLoading, setCommandsLoading] = useState(false)
  const [commandForm] = Form.useForm()

  const fetchCommands = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      setCommandsLoading(true)
      const json = await listDeviceCommands(selectedDeviceId, { page: 1, pageSize: 20 })
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
      const json = await createDeviceCommand(selectedDeviceId, { commandType: values.commandType, payload })
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
          <Text type="secondary">数据源：v2 API（/api/v1/*）</Text>
        </div>
        <Space>
          <Button onClick={() => router.push('/device-management/baselines')}>GPS 基准点</Button>
          <Button icon={<PlusOutlined />} onClick={() => setCreateDeviceOpen(true)}>
            创建设备
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetch()
              void refreshShadow()
              void fetchStations()
              void fetchDeviceSensors()
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
          <Button disabled={!selectedDeviceId} onClick={() => setAuditOpen(true)}>
            命令审计
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
        title="最新状态（/data/state/{deviceId}）"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void refreshShadow()} loading={shadowLoading}>
            刷新状态
          </Button>
        }
      >
        {sensorsError ? <Text type="warning">传感器字典不可用：{sensorsError}</Text> : null}
        {shadowError ? <Text type="danger">状态获取失败：{shadowError}</Text> : null}
        {shadow ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="更新时间">{shadow.updatedAt}</Descriptions.Item>
              <Descriptions.Item label="Metrics 数量">{Object.keys(shadow.metrics ?? {}).length}</Descriptions.Item>
            </Descriptions>
            <div className="mt-3">
              <Table
                rowKey="sensorKey"
                loading={shadowLoading}
                dataSource={metricsRows}
                pagination={{ pageSize: 15 }}
                size="small"
                columns={[
                  {
                    title: 'sensorKey',
                    dataIndex: 'sensorKey',
                    width: 220,
                    render: (v: string) => <span className="font-mono">{v}</span>,
                  },
                  { title: '名称', dataIndex: 'name' },
                  {
                    title: '值',
                    dataIndex: 'value',
                    render: (v: unknown) => <span className="font-mono">{formatValue(v)}</span>,
                  },
                  { title: '单位', dataIndex: 'unit', width: 80 },
                ]}
              />
            </div>
          </>
        ) : (
          <Text type="secondary">{shadowLoading ? '加载中…' : '暂无数据'}</Text>
        )}
      </Card>

      <Card
        title="传感器声明（/devices/{deviceId}/sensors，可选）"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void fetchDeviceSensors()}
              loading={deviceSensorsLoading}
              disabled={!selectedDeviceId}
            >
              刷新
            </Button>
            <Button
              type="primary"
              onClick={() => void saveDeviceSensors()}
              loading={deviceSensorsLoading}
              disabled={!selectedDeviceId}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            style={{ minWidth: 320 }}
            value={addSensorKey || undefined}
            placeholder="添加 sensorKey（来自 /sensors）"
            showSearch
            onChange={(v) => setAddSensorKey(v)}
            options={[...sensorsByKey.values()].map((s) => ({
              value: s.sensorKey,
              label: `${s.displayName} (${s.sensorKey})`,
            }))}
            disabled={!selectedDeviceId}
          />
          <Button onClick={addSensor} disabled={!selectedDeviceId || !addSensorKey.trim()}>
            添加
          </Button>
        </Space>

        <Table
          rowKey="sensorKey"
          size="small"
          loading={deviceSensorsLoading}
          dataSource={deviceSensors}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'sensorKey',
              dataIndex: 'sensorKey',
              width: 220,
              render: (v: string) => <span className="font-mono">{v}</span>,
            },
            { title: '名称', dataIndex: 'displayName' },
            { title: '单位', dataIndex: 'unit', width: 80 },
            { title: '类型', dataIndex: 'dataType', width: 90 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 140,
              render: (v: DeviceSensorRow['status'], row: DeviceSensorRow) => (
                <Select
                  value={v}
                  style={{ width: 120 }}
                  onChange={(next) => {
                    setDeviceSensors((prev) => prev.map((s) => (s.sensorKey === row.sensorKey ? { ...s, status: next } : s)))
                  }}
                  options={[
                    { value: 'enabled', label: 'enabled' },
                    { value: 'disabled', label: 'disabled' },
                    { value: 'missing', label: 'missing' },
                  ]}
                  disabled={!selectedDeviceId}
                />
              ),
            },
            {
              title: '操作',
              width: 90,
              render: (_: unknown, row: DeviceSensorRow) => (
                <Button danger size="small" onClick={() => setDeviceSensors((prev) => prev.filter((s) => s.sensorKey !== row.sensorKey))} disabled={!selectedDeviceId}>
                  移除
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal title="命令审计（events/notifications）" open={auditOpen} onCancel={() => setAuditOpen(false)} footer={null} width={980}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            style={{ minWidth: 420 }}
            value={auditCommandId || undefined}
            allowClear
            placeholder="按 commandId 过滤（可选）"
            onChange={(v) => setAuditCommandId(v ?? '')}
            options={commands.map((c) => ({ value: c.commandId, label: `${c.commandType} (${c.commandId})` }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void fetchCommandAudit()} loading={eventsLoading || notificationsLoading}>
            刷新
          </Button>
        </Space>

        <Tabs
          items={[
            {
              key: 'events',
              label: 'Command Events',
              children: (
                <Table
                  rowKey="eventId"
                  size="small"
                  loading={eventsLoading}
                  dataSource={events}
                  pagination={{ pageSize: 15 }}
                  columns={[
                    { title: 'createdAt', dataIndex: 'createdAt', width: 200, render: (v: string) => <span className="font-mono">{v}</span> },
                    { title: 'eventType', dataIndex: 'eventType', width: 140 },
                    { title: 'commandId', dataIndex: 'commandId', render: (v: string) => <span className="font-mono">{v}</span> },
                    { title: 'reasonCode', dataIndex: 'reasonCode', width: 120, render: (v: string | null | undefined) => v ?? '-' },
                    { title: 'message', dataIndex: 'message', render: (v: string | null | undefined) => v ?? '-' },
                  ]}
                />
              ),
            },
            {
              key: 'notifications',
              label: 'Notifications',
              children: (
                <Table
                  rowKey="notificationId"
                  size="small"
                  loading={notificationsLoading}
                  dataSource={notifications}
                  pagination={{ pageSize: 15 }}
                  columns={[
                    { title: 'createdAt', dataIndex: 'createdAt', width: 200, render: (v: string) => <span className="font-mono">{v}</span> },
                    { title: 'notifyType', dataIndex: 'notifyType', width: 110 },
                    { title: 'status', dataIndex: 'status', width: 110 },
                    { title: 'isRead', dataIndex: 'isRead', width: 90, render: (v: boolean) => (v ? 'yes' : 'no') },
                    { title: 'commandId', dataIndex: 'commandId', render: (v: string) => <span className="font-mono">{v}</span> },
                    { title: 'payload', dataIndex: 'payload', render: (v: unknown) => <span className="font-mono">{formatValue(v)}</span> },
                    {
                      title: '操作',
                      width: 90,
                      render: (_: unknown, row: PaginatedDeviceCommandNotifications['list'][number]) => (
                        <Button size="small" disabled={row.isRead} onClick={() => void markNotificationRead(row.notificationId)}>
                          已读
                        </Button>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Modal>

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
