'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import useDeviceList from '../../hooks/useDeviceList'
import { useAuth } from '../../components/AuthProvider'
import {
  deleteGpsBaseline,
  getGpsBaseline,
  listGpsBaselines,
  upsertGpsBaseline,
  type GpsBaselineRow,
} from '../../../lib/api/gpsBaselines'
import {
  autoEstablishGpsBaseline,
  getGpsBaselinesAvailableDevices,
  qualityCheckGpsBaseline,
  type GpsBaselineQualityCheckResponse,
  type GpsBaselinesAvailableDevicesResponse,
} from '../../../lib/api/gpsBaselinesAdvanced'

const { Title, Text } = Typography

type BaselineFormValues = {
  method: 'auto' | 'manual'
  pointsCount?: number
  latitude?: number
  longitude?: number
  altitude?: number
  positionAccuracyMeters?: number
  satelliteCount?: number
  notes?: string
}

type AutoEstablishFormValues = {
  deviceId: string
  pointsCount: number
  lookbackDays: number
  latKey: string
  lonKey: string
  altKey?: string
}

function isNotFoundError(caught: unknown): boolean {
  const msg = caught instanceof Error ? caught.message : String(caught)
  return msg.includes('资源不存在') || msg.includes('404')
}

export default function BaselinesPage() {
  const { user } = useAuth()
  const canEdit = user ? user.permissions.includes('device:update') : true

  const { devices, loading: devicesLoading, error: devicesError, refetch: refetchDevices } = useDeviceList()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].device_id)
  }, [devices, selectedDeviceId])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.device_id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  )

  const [keywordInput, setKeywordInput] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [list, setList] = useState<GpsBaselineRow[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const refreshList = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const json = await listGpsBaselines({ page, pageSize, keyword })
      setList(json.data?.list ?? [])
      setTotal(json.data?.pagination?.total ?? 0)
    } catch (caught) {
      setList([])
      setTotal(0)
      setListError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setListLoading(false)
    }
  }, [page, pageSize, keyword])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const [baselineLoading, setBaselineLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [baselineMissing, setBaselineMissing] = useState(false)
  const [baseline, setBaseline] = useState<GpsBaselineRow | null>(null)

  const [form] = Form.useForm<BaselineFormValues>()
  const [autoForm] = Form.useForm<AutoEstablishFormValues>()

  const [availableLoading, setAvailableLoading] = useState(false)
  const [availableError, setAvailableError] = useState<string | null>(null)
  const [available, setAvailable] = useState<GpsBaselinesAvailableDevicesResponse | null>(null)

  const [autoModalOpen, setAutoModalOpen] = useState(false)
  const [autoLoading, setAutoLoading] = useState(false)

  const [qcLoading, setQcLoading] = useState(false)
  const [qcError, setQcError] = useState<string | null>(null)
  const [qc, setQc] = useState<GpsBaselineQualityCheckResponse | null>(null)

  const resetForm = useCallback(() => {
    form.setFieldsValue({
      method: 'manual',
      pointsCount: undefined,
      latitude: undefined,
      longitude: undefined,
      altitude: undefined,
      positionAccuracyMeters: undefined,
      satelliteCount: undefined,
      notes: undefined,
    })
  }, [form])

  useEffect(() => {
    autoForm.setFieldsValue({
      deviceId: selectedDeviceId,
      pointsCount: 20,
      lookbackDays: 30,
      latKey: 'gps_latitude',
      lonKey: 'gps_longitude',
      altKey: 'gps_altitude',
    })
  }, [autoForm, selectedDeviceId])

  const refreshAvailableDevices = useCallback(async () => {
    try {
      setAvailableLoading(true)
      setAvailableError(null)
      const json = await getGpsBaselinesAvailableDevices({ lookbackDays: 30, latKey: 'gps_latitude', lonKey: 'gps_longitude' })
      setAvailable(json.data ?? null)
    } catch (caught) {
      setAvailableError(caught instanceof Error ? caught.message : String(caught))
      setAvailable(null)
    } finally {
      setAvailableLoading(false)
    }
  }, [])

  const runQualityCheck = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      setQcLoading(true)
      setQcError(null)
      const json = await qualityCheckGpsBaseline(selectedDeviceId, { lookbackDays: 30, pointsCount: 200 })
      setQc(json.data ?? null)
    } catch (caught) {
      setQcError(caught instanceof Error ? caught.message : String(caught))
      setQc(null)
    } finally {
      setQcLoading(false)
    }
  }, [selectedDeviceId])

  const loadBaseline = useCallback(async () => {
    if (!selectedDeviceId) return
    try {
      setBaselineLoading(true)
      setBaselineError(null)
      setBaselineMissing(false)

      const json = await getGpsBaseline(selectedDeviceId)
      setBaseline(json.data)
      setBaselineMissing(false)
      form.setFieldsValue({
        method: json.data.method,
        pointsCount: json.data.pointsCount ?? undefined,
        latitude: json.data.baseline.latitude,
        longitude: json.data.baseline.longitude,
        altitude: json.data.baseline.altitude,
        positionAccuracyMeters: json.data.baseline.positionAccuracyMeters,
        satelliteCount: json.data.baseline.satelliteCount,
        notes: json.data.baseline.notes,
      })
    } catch (caught) {
      if (isNotFoundError(caught)) {
        setBaseline(null)
        setBaselineMissing(true)
        resetForm()
      } else {
        setBaseline(null)
        setBaselineMissing(false)
        setBaselineError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      setBaselineLoading(false)
    }
  }, [selectedDeviceId, form, resetForm])

  useEffect(() => {
    void loadBaseline()
  }, [loadBaseline])

  const save = useCallback(async () => {
    if (!selectedDeviceId) return
    const values = (await form.validateFields()) as BaselineFormValues
    if (typeof values.latitude !== 'number' || typeof values.longitude !== 'number') {
      message.error('latitude/longitude 必填')
      return
    }
    const body = {
      method: values.method,
      pointsCount: values.pointsCount ?? undefined,
      baseline: {
        latitude: values.latitude,
        longitude: values.longitude,
        altitude: values.altitude ?? undefined,
        positionAccuracyMeters: values.positionAccuracyMeters ?? undefined,
        satelliteCount: values.satelliteCount ?? undefined,
        notes: values.notes && values.notes.trim() ? values.notes.trim() : undefined,
      },
    }

    try {
      setSaving(true)
      await upsertGpsBaseline(selectedDeviceId, body)
      message.success('已保存基准点')
      await refreshList()
      await loadBaseline()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }, [form, selectedDeviceId, refreshList, loadBaseline])

  const onDelete = useCallback(() => {
    if (!selectedDeviceId) return
    Modal.confirm({
      title: '删除基准点',
      content: '确认删除该设备的 GPS 基准点？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteGpsBaseline(selectedDeviceId)
          message.success('已删除')
          setBaseline(null)
          setBaselineMissing(true)
          resetForm()
          await refreshList()
        } catch (caught) {
          message.error(caught instanceof Error ? caught.message : String(caught))
        }
      },
    })
  }, [selectedDeviceId, refreshList, resetForm])

  const onAutoEstablish = useCallback(async () => {
    try {
      const values = await autoForm.validateFields()
      if (!values.deviceId) return

      setAutoLoading(true)
      const json = await autoEstablishGpsBaseline(values.deviceId, {
        pointsCount: values.pointsCount,
        lookbackDays: values.lookbackDays,
        latKey: values.latKey,
        lonKey: values.lonKey,
        ...(values.altKey && values.altKey.trim() ? { altKey: values.altKey.trim() } : {}),
      })
      message.success(`自动建立成功：pointsUsed=${json.data?.pointsUsed ?? '-'}`)
      setAutoModalOpen(false)
      await refreshList()
      await loadBaseline()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setAutoLoading(false)
    }
  }, [autoForm, loadBaseline, refreshList])

  const listColumns = useMemo(
    () => [
      { title: 'deviceName', dataIndex: 'deviceName' },
      { title: 'deviceId', dataIndex: 'deviceId', render: (v: string) => <span className="font-mono">{v}</span> },
      {
        title: 'method',
        dataIndex: 'method',
        width: 90,
        render: (v: 'auto' | 'manual') => <Tag color={v === 'auto' ? 'blue' : 'gold'}>{v}</Tag>,
      },
      { title: 'pointsCount', dataIndex: 'pointsCount', width: 110, render: (v: number | null) => v ?? '-' },
      { title: 'updatedAt', dataIndex: 'updatedAt', width: 200, render: (v: string) => <span className="font-mono">{v}</span> },
      { title: 'computedAt', dataIndex: 'computedAt', width: 200, render: (v: string) => <span className="font-mono">{v}</span> },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            GPS 基准点（Baselines）
          </Title>
          <Text type="secondary">对接：`/api/v1/gps/baselines/*`（查看：`device:view`；写入/删除：`device:update`）</Text>
        </div>
        <Space>
          <Link href="/device-management">返回设备管理</Link>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void refetchDevices()
              void refreshList()
              void loadBaseline()
            }}
            loading={devicesLoading || listLoading || baselineLoading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {devicesError ? (
        <Card>
          <Text type="danger">设备列表加载失败：{devicesError.message}</Text>
        </Card>
      ) : null}

      <Card title="选择设备" size="small">
        <Space wrap>
          <Select
            style={{ minWidth: 480 }}
            value={selectedDeviceId || undefined}
            placeholder={devicesLoading ? '加载中…' : '请选择设备'}
            loading={devicesLoading}
            onChange={(value) => setSelectedDeviceId(value)}
            options={devices.map((d) => ({
              label: `${d.display_name || d.device_id} (${d.device_id.slice(0, 8)}…)`,
              value: d.device_id,
            }))}
          />
          <Text type="secondary">{selectedDevice ? selectedDevice.display_name : null}</Text>
        </Space>
      </Card>

      <Card
        title="基准点"
        size="small"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadBaseline()} loading={baselineLoading} disabled={!selectedDeviceId}>
              重新加载
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => void save()} disabled={!selectedDeviceId || !canEdit} loading={saving}>
              保存
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={onDelete} disabled={!selectedDeviceId || !canEdit || baselineMissing} loading={baselineLoading}>
              删除
            </Button>
          </Space>
        }
      >
        {baselineError ? <Text type="danger">加载失败：{baselineError}</Text> : null}
        {baseline ? (
          <div className="mb-3">
            <Space wrap>
              <Tag color="green">已存在</Tag>
              <Text type="secondary">
                computedAt: <span className="font-mono">{baseline.computedAt}</span>
              </Text>
              <Text type="secondary">
                updatedAt: <span className="font-mono">{baseline.updatedAt}</span>
              </Text>
            </Space>
          </div>
        ) : baselineMissing ? (
          <div className="mb-3">
            <Tag color="orange">暂无基准点（可创建）</Tag>
          </div>
        ) : null}

        <Form form={form} layout="vertical" initialValues={{ method: 'manual' }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item label="method" name="method" rules={[{ required: true, message: 'method 必填' }]}>
              <Select options={[{ value: 'manual', label: 'manual' }, { value: 'auto', label: 'auto' }]} />
            </Form.Item>
            <Form.Item label="pointsCount（可选）" name="pointsCount">
              <InputNumber min={1} max={1000000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="latitude" name="latitude" rules={[{ required: true, message: 'latitude 必填' }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="longitude" name="longitude" rules={[{ required: true, message: 'longitude 必填' }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="altitude（可选）" name="altitude">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="positionAccuracyMeters（可选）" name="positionAccuracyMeters">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="satelliteCount（可选）" name="satelliteCount">
              <InputNumber min={1} max={200} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="notes（可选）" name="notes">
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
            </Form.Item>
          </div>

          {!canEdit ? (
            <Text type="secondary">当前账号无 `device:update` 权限：保存/删除已禁用。</Text>
          ) : null}
        </Form>
      </Card>

      <Card
        title="高级工具（对齐参考区 BaselineManagementV2）"
        size="small"
        extra={<Text type="secondary">端点：`/gps/baselines/*`</Text>}
      >
        <Space wrap>
          <Button onClick={() => void refreshAvailableDevices()} loading={availableLoading}>
            扫描可用设备（无 baseline）
          </Button>
          <Button type="primary" onClick={() => setAutoModalOpen(true)} disabled={!selectedDeviceId || !canEdit}>
            自动建立 baseline
          </Button>
          <Button onClick={() => void runQualityCheck()} loading={qcLoading} disabled={!selectedDeviceId || baselineMissing}>
            质量检查
          </Button>
          {!canEdit ? <Text type="secondary">当前账号无 `device:update`：自动建立已禁用。</Text> : null}
        </Space>

        {availableError ? (
          <div className="mt-3">
            <Text type="danger">可用设备扫描失败：{availableError}</Text>
          </div>
        ) : null}
        {available ? (
          <div className="mt-3 space-y-2">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="lookbackDays">{available.lookbackDays}</Descriptions.Item>
              <Descriptions.Item label="totalGpsDevices">{available.totalGpsDevices}</Descriptions.Item>
              <Descriptions.Item label="devicesWithBaseline">{available.devicesWithBaseline}</Descriptions.Item>
              <Descriptions.Item label="devicesNeedingBaseline">{available.devicesNeedingBaseline}</Descriptions.Item>
            </Descriptions>
            <div className="flex flex-wrap gap-2">
              {(available.availableDevices ?? []).slice(0, 20).map((id) => (
                <Button key={id} size="small" onClick={() => setSelectedDeviceId(id)}>
                  <span className="font-mono">{id.slice(0, 8)}…</span>
                </Button>
              ))}
              {(available.availableDevices ?? []).length > 20 ? (
                <Text type="secondary">仅展示前 20 个，可用设备总数：{available.availableDevices.length}</Text>
              ) : null}
            </div>
          </div>
        ) : null}

        <Divider />

        {qcError ? <Text type="danger">质量检查失败：{qcError}</Text> : null}
        {qc ? (
          <div className="space-y-2">
            <Space wrap>
              <Tag color={qc.recommendation.level === 'good' ? 'green' : qc.recommendation.level === 'warn' ? 'orange' : 'red'}>
                {qc.recommendation.level.toUpperCase()}
              </Tag>
              <Text type="secondary">
                baselineAgeHours: <span className="font-mono">{qc.baselineAgeHours.toFixed(1)}</span>
              </Text>
              <Text type="secondary">
                pointsUsed: <span className="font-mono">{qc.sample.pointsUsed}</span>
              </Text>
            </Space>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="drift mean (m)">{qc.driftMeters.mean.toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="drift std (m)">{qc.driftMeters.std.toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="drift p95 (m)">{qc.driftMeters.p95.toFixed(3)}</Descriptions.Item>
              <Descriptions.Item label="drift max (m)">{qc.driftMeters.max.toFixed(3)}</Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <Text type="secondary">质量检查会基于 baseline + 最近 GPS 样本计算漂移统计（p95 阈值：2m/5m）。</Text>
        )}

        <Modal
          title="自动建立 GPS baseline"
          open={autoModalOpen}
          onCancel={() => setAutoModalOpen(false)}
          onOk={() => void onAutoEstablish()}
          confirmLoading={autoLoading}
          okButtonProps={{ disabled: !canEdit }}
        >
          <Form form={autoForm} layout="vertical">
            <Form.Item label="deviceId" name="deviceId" rules={[{ required: true, message: 'deviceId 必填' }]}>
              <Select
                showSearch
                options={devices.map((d) => ({ value: d.device_id, label: `${d.display_name || d.device_id} (${d.device_id.slice(0, 8)}…)` }))}
              />
            </Form.Item>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item label="pointsCount" name="pointsCount" rules={[{ required: true }]}>
                <InputNumber min={10} max={5000} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="lookbackDays" name="lookbackDays" rules={[{ required: true }]}>
                <InputNumber min={1} max={365} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="latKey" name="latKey" rules={[{ required: true }]}>
                <Input placeholder="gps_latitude" />
              </Form.Item>
              <Form.Item label="lonKey" name="lonKey" rules={[{ required: true }]}>
                <Input placeholder="gps_longitude" />
              </Form.Item>
              <Form.Item label="altKey（可选）" name="altKey">
                <Input placeholder="gps_altitude" />
              </Form.Item>
            </div>
          </Form>
        </Modal>
      </Card>

      <Card
        title="已有基准点列表"
        size="small"
        extra={
          <Space>
            <Input
              placeholder="按 deviceName 搜索（可选）"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setPage(1)
                setKeyword(keywordInput)
              }}
              loading={listLoading}
            >
              查询
            </Button>
          </Space>
        }
      >
        {listError ? (
          <div className="mb-3">
            <Text type="danger">列表加载失败：{listError}</Text>
          </div>
        ) : null}
        <Table
          rowKey="deviceId"
          size="small"
          loading={listLoading}
          dataSource={list}
          columns={listColumns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          onRow={(record) => ({
            onClick: () => setSelectedDeviceId(record.deviceId),
          })}
        />
      </Card>
    </div>
  )
}
