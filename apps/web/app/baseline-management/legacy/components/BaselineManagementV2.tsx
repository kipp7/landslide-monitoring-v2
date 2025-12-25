'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AimOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SettingOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { apiDeleteJson, apiGetJson, apiJson, apiPutJson, type ApiSuccessResponse } from '../../../../lib/v2Api'
import { listLegacyDeviceMappings, type LegacyDeviceMappingRow } from '../../../../lib/api/legacyDeviceMappings'

const { Option } = Select
const { TextArea } = Input
const { Text } = Typography

type Baseline = {
  id?: number
  device_id: string
  baseline_latitude: number
  baseline_longitude: number
  baseline_altitude?: number
  established_by: string
  established_time: string
  notes?: string
  status: string
  position_accuracy?: number
  measurement_duration?: number
  satellite_count?: number
  pdop_value?: number
  confidence_level?: number
  data_points_used?: number
}

type QualityAssessment = {
  overallScore: number
  qualityGrade: string
  stabilityScore: number
  dataQualityScore: number
  precisionScore: number
  recommendations: string[]
}

type GpsBaselineRow = {
  deviceId: string
  deviceName?: string
  stationId?: string | null
  method?: 'auto' | 'manual'
  pointsCount?: number | null
  baseline?: {
    latitude?: number
    longitude?: number
    altitude?: number | null
    positionAccuracyMeters?: number | null
    satelliteCount?: number | null
    notes?: string | null
  }
  computedAt?: string
  updatedAt?: string
}

type ListGpsBaselinesResponse = {
  list: GpsBaselineRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

type QualityCheckResponse = {
  driftMeters?: { p95?: number; mean?: number; std?: number; max?: number }
  recommendation?: { level?: 'good' | 'warn' | 'bad'; thresholds?: { goodP95Meters?: number; warnP95Meters?: number } }
  baselineAgeHours?: number
}

export default function BaselineManagementV2({ className = '' }: { className?: string }) {
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [devices, setDevices] = useState<string[]>([])
  const [mappings, setMappings] = useState<LegacyDeviceMappingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [autoModalVisible, setAutoModalVisible] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedBaseline, setSelectedBaseline] = useState<Baseline | null>(null)
  const [qualityAssessments, setQualityAssessments] = useState<Map<string, QualityAssessment>>(new Map())

  const [form] = Form.useForm()
  const [autoForm] = Form.useForm()

  const mappingBySimpleId = useMemo(() => {
    const map = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappings) {
      if (row.simple_id) map.set(row.simple_id, row)
    }
    return map
  }, [mappings])

  const mappingByActualId = useMemo(() => {
    const map = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappings) {
      if (row.actual_device_id) map.set(row.actual_device_id, row)
    }
    return map
  }, [mappings])

  const resolveActualDeviceId = (deviceKey: string) => {
    return mappingBySimpleId.get(deviceKey)?.actual_device_id ?? deviceKey
  }

  const resolveDisplayName = (deviceKey: string) => {
    const m = mappingBySimpleId.get(deviceKey) ?? mappingByActualId.get(deviceKey)
    return m?.device_name || m?.location_name || deviceKey
  }

  useEffect(() => {
    void fetchDevices()
    void fetchBaselines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDevices = async () => {
    try {
      const json = await listLegacyDeviceMappings()
      if (json.success) {
        setMappings(json.data)
        const ids = Array.from(new Set(json.data.map((d) => d.simple_id).filter(Boolean)))
        setDevices(ids)
      } else {
        setMappings([])
        setDevices([])
      }
    } catch {
      setMappings([])
      setDevices([])
    }
  }

  const fetchBaselines = async () => {
    setLoading(true)
    try {
      const res = await apiGetJson<ApiSuccessResponse<ListGpsBaselinesResponse>>('/api/v1/gps/baselines?page=1&pageSize=200')
      if (res.success) {
        const list = res.data?.list ?? []
        const mapped: Baseline[] = list.map((row) => {
          const m = mappingByActualId.get(row.deviceId)
          const deviceKey = m?.simple_id || row.deviceId
          return {
            device_id: deviceKey,
            baseline_latitude: Number(row.baseline?.latitude ?? 0),
            baseline_longitude: Number(row.baseline?.longitude ?? 0),
            baseline_altitude: row.baseline?.altitude ?? undefined,
            established_by: row.method === 'auto' ? '系统' : '管理员',
            established_time: row.computedAt ?? row.updatedAt ?? new Date().toISOString(),
            notes: row.baseline?.notes ?? undefined,
            status: 'active',
            position_accuracy: row.baseline?.positionAccuracyMeters ?? undefined,
            satellite_count: row.baseline?.satelliteCount ?? undefined,
            data_points_used: row.pointsCount ?? undefined,
          }
        })
        setBaselines(mapped)
        await fetchQualityAssessments(mapped)
      }
    } catch {
      message.error('获取基准点列表失败')
    } finally {
      setLoading(false)
    }
  }

  const qualityFromCheck = (qc: QualityCheckResponse | null): QualityAssessment | null => {
    if (!qc) return null
    const level = qc.recommendation?.level ?? 'warn'
    const p95 = typeof qc.driftMeters?.p95 === 'number' ? qc.driftMeters.p95 : null

    const overallScore = level === 'good' ? 95 : level === 'warn' ? 75 : 45
    const grade = level === 'good' ? '优秀' : level === 'warn' ? '良好' : '较差'
    const stabilityScore = level === 'good' ? 90 : level === 'warn' ? 70 : 40
    const dataQualityScore = level === 'good' ? 90 : level === 'warn' ? 70 : 40
    const precisionScore = level === 'good' ? 95 : level === 'warn' ? 70 : 35

    const recommendations: string[] = []
    if (p95 != null) recommendations.push(`P95 漂移：${p95.toFixed(2)}m`)
    if (level === 'good') recommendations.push('基准点稳定，建议定期复核')
    if (level === 'warn') recommendations.push('漂移偏大，建议重新自动建立或检查数据质量')
    if (level === 'bad') recommendations.push('漂移显著，建议立即重新建立基准点并排查设备/环境因素')

    return { overallScore, qualityGrade: grade, stabilityScore, dataQualityScore, precisionScore, recommendations }
  }

  const fetchQualityAssessments = async (baselineList: Baseline[]) => {
    const assessmentMap = new Map<string, QualityAssessment>()
    for (const baseline of baselineList) {
      const actualId = resolveActualDeviceId(baseline.device_id)
      try {
        const resp = await apiGetJson<ApiSuccessResponse<QualityCheckResponse>>(
          `/api/v1/gps/baselines/${encodeURIComponent(actualId)}/quality-check?lookbackDays=30&pointsCount=200`,
        )
        if (resp.success) {
          const qa = qualityFromCheck(resp.data) ?? undefined
          if (qa) assessmentMap.set(baseline.device_id, qa)
        }
      } catch {
        // ignore per-device failures
      }
    }
    setQualityAssessments(assessmentMap)
  }

  const handleCreateBaseline = () => {
    setEditMode(false)
    setSelectedBaseline(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEditBaseline = (baseline: Baseline) => {
    setEditMode(true)
    setSelectedBaseline(baseline)
    form.setFieldsValue({
      device_id: baseline.device_id,
      latitude: baseline.baseline_latitude,
      longitude: baseline.baseline_longitude,
      altitude: baseline.baseline_altitude,
      positionAccuracy: baseline.position_accuracy,
      satelliteCount: baseline.satellite_count,
      pdopValue: baseline.pdop_value,
      measurementDuration: baseline.measurement_duration,
      establishedBy: baseline.established_by,
      notes: baseline.notes,
    })
    setModalVisible(true)
  }

  const handleSaveBaseline = async (values: any) => {
    try {
      const deviceKey = editMode ? selectedBaseline?.device_id : values.device_id
      if (!deviceKey) throw new Error('device_id missing')
      const actualId = resolveActualDeviceId(deviceKey)

      await apiPutJson<ApiSuccessResponse<unknown>>(`/api/v1/gps/baselines/${encodeURIComponent(actualId)}`, {
        method: 'manual',
        pointsCount: values.dataPointsUsed ? Number(values.dataPointsUsed) : undefined,
        baseline: {
          latitude: Number(values.latitude),
          longitude: Number(values.longitude),
          ...(values.altitude != null ? { altitude: Number(values.altitude) } : {}),
          ...(values.positionAccuracy != null ? { positionAccuracyMeters: Number(values.positionAccuracy) } : {}),
          ...(values.satelliteCount != null ? { satelliteCount: Number(values.satelliteCount) } : {}),
          ...(values.notes ? { notes: String(values.notes) } : {}),
        },
      })

      message.success(editMode ? '基准点更新成功' : '基准点创建成功')
      setModalVisible(false)
      await fetchBaselines()
    } catch {
      message.error('保存基准点失败')
    }
  }

  const handleDeleteBaseline = async (baseline: Baseline) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除设备 ${resolveDisplayName(baseline.device_id)} 的基准点吗？此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const actualId = resolveActualDeviceId(baseline.device_id)
          await apiDeleteJson<ApiSuccessResponse<unknown>>(`/api/v1/gps/baselines/${encodeURIComponent(actualId)}`)
          message.success('基准点删除成功')
          await fetchBaselines()
        } catch {
          message.error('删除基准点失败')
        }
      },
    })
  }

  const handleAutoEstablish = () => {
    autoForm.resetFields()
    setAutoModalVisible(true)
  }

  const handleRunAutoEstablish = async (values: any) => {
    try {
      const actualId = resolveActualDeviceId(values.device_id)
      await apiJson<ApiSuccessResponse<unknown>>(`/api/v1/gps/baselines/${encodeURIComponent(actualId)}/auto-establish`, {
        pointsCount: Number(values.pointsCount ?? 20),
        lookbackDays: Number(values.lookbackDays ?? 30),
        latKey: values.latKey || 'gps_latitude',
        lonKey: values.lonKey || 'gps_longitude',
        ...(values.altKey ? { altKey: values.altKey } : {}),
      })
      message.success('自动建立基准点任务已执行')
      setAutoModalVisible(false)
      await fetchBaselines()
    } catch {
      message.error('自动建立基准点失败')
    }
  }

  const exportCsv = () => {
    const headers = [
      'device_id',
      'device_name',
      'baseline_latitude',
      'baseline_longitude',
      'baseline_altitude',
      'status',
      'established_by',
      'established_time',
      'position_accuracy_m',
      'satellite_count',
      'data_points_used',
      'quality_grade',
      'quality_score',
      'recommendations',
      'notes',
    ] as const

    const escapeCsv = (value: unknown) => {
      const raw = value == null ? '' : String(value)
      const needsQuotes = raw.includes(',') || raw.includes('"') || raw.includes('\n') || raw.includes('\r')
      const escaped = raw.replaceAll('"', '""')
      return needsQuotes ? `"${escaped}"` : escaped
    }

    const lines = [headers.join(',')]
    for (const b of baselines) {
      const qa = qualityAssessments.get(b.device_id)
      const row = {
        device_id: b.device_id,
        device_name: resolveDisplayName(b.device_id),
        baseline_latitude: b.baseline_latitude,
        baseline_longitude: b.baseline_longitude,
        baseline_altitude: b.baseline_altitude ?? '',
        status: b.status,
        established_by: b.established_by,
        established_time: b.established_time,
        position_accuracy_m: b.position_accuracy ?? '',
        satellite_count: b.satellite_count ?? '',
        data_points_used: b.data_points_used ?? '',
        quality_grade: qa?.qualityGrade ?? '',
        quality_score: qa?.overallScore ?? '',
        recommendations: qa ? qa.recommendations.join('; ') : '',
        notes: b.notes ?? '',
      } satisfies Record<(typeof headers)[number], unknown>

      lines.push(headers.map((h) => escapeCsv(row[h])).join(','))
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gps-baselines-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)

    message.success('已导出 CSV')
  }

  const columns = [
    {
      title: '设备',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 180,
      render: (text: string) => (
        <Space direction="vertical" size={0}>
          <Text strong className="text-cyan-300">
            {resolveDisplayName(text)}
          </Text>
          <Text type="secondary" className="text-xs">
            {text}
          </Text>
        </Space>
      ),
    },
    {
      title: '基准坐标',
      key: 'coords',
      render: (_: unknown, record: Baseline) => (
        <Space direction="vertical" size={0}>
          <Text className="text-white">纬度: {record.baseline_latitude.toFixed(6)}</Text>
          <Text className="text-white">经度: {record.baseline_longitude.toFixed(6)}</Text>
          {record.baseline_altitude != null ? <Text className="text-white">高程: {record.baseline_altitude.toFixed(2)}m</Text> : null}
        </Space>
      ),
    },
    {
      title: '质量',
      key: 'quality',
      width: 160,
      render: (_: unknown, record: Baseline) => {
        const qa = qualityAssessments.get(record.device_id)
        if (!qa) return <Tag color="default">未评估</Tag>
        const color = qa.overallScore >= 85 ? 'green' : qa.overallScore >= 65 ? 'orange' : 'red'
        return (
          <Tooltip title={qa.recommendations.join('\n')}>
            <div>
              <Tag color={color}>{qa.qualityGrade}</Tag>
              <Progress percent={qa.overallScore} size="small" showInfo={false} />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : status === 'pending' ? 'orange' : 'red'}>
          {status === 'active' ? '已建立' : status === 'pending' ? '建立中' : '异常'}
        </Tag>
      ),
    },
    {
      title: '建立信息',
      key: 'established',
      width: 180,
      render: (_: unknown, record: Baseline) => (
        <Space direction="vertical" size={0}>
          <Text className="text-white">{record.established_by}</Text>
          <Text type="secondary" className="text-xs">
            {new Date(record.established_time).toLocaleString()}
          </Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Baseline) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditBaseline(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteBaseline(record)} />
        </Space>
      ),
    },
  ]

  return (
    <div className={className}>
      <Row gutter={[16, 16]} className="mb-4">
        <Col span={24}>
          <Alert
            message="基准点管理"
            description="基准点用于 GPS 形变计算与质量校验。建议优先使用自动建立，并定期做质量检查。"
            type="info"
            showIcon
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="基准点数量" value={baselines.length} prefix={<EnvironmentOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="已评估" value={qualityAssessments.size} prefix={<StarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="设备映射" value={devices.length} prefix={<AimOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <SettingOutlined />
            基准点列表
          </Space>
        }
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={exportCsv}>
              导出
            </Button>
            <Button icon={<RobotOutlined />} onClick={handleAutoEstablish}>
              自动建立
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateBaseline}>
              新增基准点
            </Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => void fetchBaselines()}>
              刷新
            </Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table rowKey={(r) => r.device_id} dataSource={baselines} columns={columns} pagination={{ pageSize: 10 }} />
        </Spin>
      </Card>

      <Modal
        title={editMode ? '编辑基准点' : '新增基准点'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSaveBaseline}>
          <Form.Item name="device_id" label="设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select disabled={editMode} showSearch optionFilterProp="children">
              {devices.map((id) => (
                <Option key={id} value={id}>
                  {resolveDisplayName(id)}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="latitude" label="纬度" rules={[{ required: true, message: '请输入纬度' }]}>
                <InputNumber className="w-full" precision={6} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="longitude" label="经度" rules={[{ required: true, message: '请输入经度' }]}>
                <InputNumber className="w-full" precision={6} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="altitude" label="高程(可选)">
                <InputNumber className="w-full" precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="positionAccuracy" label="定位精度(米)">
                <InputNumber className="w-full" precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="satelliteCount" label="卫星数">
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dataPointsUsed" label="使用数据点(可选)">
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="自动建立基准点"
        open={autoModalVisible}
        onCancel={() => setAutoModalVisible(false)}
        onOk={() => autoForm.submit()}
        okText="执行"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={autoForm} layout="vertical" onFinish={handleRunAutoEstablish} initialValues={{ pointsCount: 20, lookbackDays: 30 }}>
          <Form.Item name="device_id" label="设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select showSearch optionFilterProp="children">
              {devices.map((id) => (
                <Option key={id} value={id}>
                  {resolveDisplayName(id)}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="pointsCount" label="采样点数">
                <InputNumber className="w-full" min={10} max={5000} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lookbackDays" label="回溯天数">
                <InputNumber className="w-full" min={1} max={365} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="latKey" label="纬度 metric key">
                <Input placeholder="gps_latitude" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lonKey" label="经度 metric key">
                <Input placeholder="gps_longitude" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="altKey" label="高程 metric key(可选)">
            <Input placeholder="gps_altitude" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
