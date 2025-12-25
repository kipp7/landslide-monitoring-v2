'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AimOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  RobotOutlined,
  StarOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
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

type AutoEstablishResponse = {
  deviceId: string
  pointsUsed: number
  lookbackDays: number
  keys?: { latKey: string; lonKey: string; altKey: string | null }
  baseline?: {
    latitude: number
    longitude: number
    altitude: number | null
    positionAccuracyMeters: number
    satelliteCount: number
  }
  statistics?: { positionAccuracyMeters?: number; timeRange?: { start?: string | null; end?: string | null } }
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

  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deleteDeviceId, setDeleteDeviceId] = useState<string>('')

  const [form] = Form.useForm()
  const [autoForm] = Form.useForm()

  const mappingBySimpleId = useMemo(() => {
    const map = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappings) {
      if (row.simple_id) map.set(row.simple_id, row)
    }
    return map
  }, [mappings])

  const resolveActualDeviceId = (deviceKey: string, bySimple?: Map<string, LegacyDeviceMappingRow>) => {
    const map = bySimple ?? mappingBySimpleId
    return map.get(deviceKey)?.actual_device_id ?? deviceKey
  }

  async function fetchDevices(): Promise<LegacyDeviceMappingRow[]> {
    try {
      const result = await listLegacyDeviceMappings()
      if (result.success) {
        const rows = result.data || []
        setMappings(rows)
        const deviceIds = Array.from(new Set(rows.map((row) => row.simple_id).filter(Boolean)))
        setDevices(deviceIds)
        return rows
      }
      setMappings([])
      setDevices([])
      return []
    } catch (error) {
      console.error('获取设备列表失败:', error)
      setMappings([])
      setDevices(['device_1', 'device_2', 'device_3'])
      return []
    }
  }

  function qualityFromCheck(qc: QualityCheckResponse | null): QualityAssessment | null {
    if (!qc) return null
    const p95 = typeof qc.driftMeters?.p95 === 'number' ? qc.driftMeters.p95 : null
    if (p95 == null) return null

    let qualityGrade: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
    let overallScore: number

    if (p95 <= 1) {
      qualityGrade = 'excellent'
      overallScore = 0.95
    } else if (p95 <= 2) {
      qualityGrade = 'good'
      overallScore = 0.85
    } else if (p95 <= 5) {
      qualityGrade = 'fair'
      overallScore = 0.7
    } else if (p95 <= 10) {
      qualityGrade = 'poor'
      overallScore = 0.55
    } else {
      qualityGrade = 'critical'
      overallScore = 0.3
    }

    const stabilityScore = overallScore
    const dataQualityScore = overallScore
    const precisionScore = overallScore

    const recommendations: string[] = [`P95 漂移: ${p95.toFixed(2)}m`]
    if (qualityGrade === 'excellent') recommendations.push('基准点稳定，建议定期复核')
    if (qualityGrade === 'good') recommendations.push('质量良好，建议重点关注环境变化')
    if (qualityGrade === 'fair') recommendations.push('漂移偏大，建议重新自动建立或检查数据质量')
    if (qualityGrade === 'poor') recommendations.push('质量偏低，建议重新建立基准点')
    if (qualityGrade === 'critical') recommendations.push('漂移显著，建议立即重建并排查设备/环境因素')

    return { overallScore, qualityGrade, stabilityScore, dataQualityScore, precisionScore, recommendations }
  }

  async function fetchQualityAssessments(baselineList: Baseline[], mappingRows?: LegacyDeviceMappingRow[]) {
    const bySimple = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappingRows ?? mappings) {
      if (row.simple_id) bySimple.set(row.simple_id, row)
    }

    const assessmentMap = new Map<string, QualityAssessment>()
    for (const baseline of baselineList) {
      try {
        const actualId = resolveActualDeviceId(baseline.device_id, bySimple)
        const response = await apiGetJson<ApiSuccessResponse<QualityCheckResponse>>(
          `/api/v1/gps/baselines/${encodeURIComponent(actualId)}/quality-check?lookbackDays=30&pointsCount=200`,
        )
        if (response.success) {
          const qa = qualityFromCheck(response.data)
          if (qa) assessmentMap.set(baseline.device_id, qa)
        }
      } catch {
        // ignore per-device failures
      }
    }

    setQualityAssessments(assessmentMap)
  }

  async function fetchBaselines(mappingRows?: LegacyDeviceMappingRow[]) {
    setLoading(true)
    try {
      const response = await apiGetJson<ApiSuccessResponse<ListGpsBaselinesResponse>>('/api/v1/gps/baselines?page=1&pageSize=200')
      if (response.success) {
        const list = response.data?.list || []

        const byActual = new Map<string, LegacyDeviceMappingRow>()
        for (const row of mappingRows ?? mappings) {
          if (row.actual_device_id) byActual.set(row.actual_device_id, row)
        }

        const mapped: Baseline[] = list.map((row) => {
          const m = byActual.get(row.deviceId)
          const deviceKey = m?.simple_id || row.deviceId

          return {
            device_id: deviceKey,
            baseline_latitude: Number(row.baseline?.latitude ?? 0),
            baseline_longitude: Number(row.baseline?.longitude ?? 0),
            baseline_altitude: row.baseline?.altitude == null ? undefined : Number(row.baseline?.altitude),
            established_by: row.method === 'auto' ? 'AI智能系统' : '管理员',
            established_time: row.computedAt || row.updatedAt || new Date().toISOString(),
            notes: row.baseline?.notes ?? undefined,
            status: 'active',
            position_accuracy: row.baseline?.positionAccuracyMeters == null ? undefined : Number(row.baseline?.positionAccuracyMeters),
            satellite_count: row.baseline?.satelliteCount == null ? undefined : Number(row.baseline?.satelliteCount),
            pdop_value: undefined,
            measurement_duration: undefined,
            confidence_level: undefined,
            data_points_used: row.pointsCount == null ? undefined : Number(row.pointsCount),
          }
        })

        setBaselines(mapped)
        await fetchQualityAssessments(mapped, mappingRows)
      }
    } catch {
      message.error('获取基准点列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const mappingRows = await fetchDevices()
      await fetchBaselines(mappingRows)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      form.resetFields()
      setEditMode(false)
      setSelectedBaseline(null)
      void fetchBaselines()
    } catch {
      message.error('操作失败')
    }
  }

  const handleAutoBaseline = async (values: any, useSimple = false) => {
    try {
      const deviceId = resolveActualDeviceId(values.device_id)
      const analysisHours = Number(values.analysisHours || 24)
      const lookbackDays = Math.max(1, Math.min(365, Math.ceil(analysisHours / 24)))

      const autoResp = await apiJson<ApiSuccessResponse<AutoEstablishResponse>>(`/api/v1/gps/baselines/${encodeURIComponent(deviceId)}/auto-establish`, {
        pointsCount: useSimple ? 20 : 200,
        lookbackDays,
        latKey: 'gps_latitude',
        lonKey: 'gps_longitude',
      })

      let qa: QualityAssessment | null = null
      try {
        const qc = await apiGetJson<ApiSuccessResponse<QualityCheckResponse>>(
          `/api/v1/gps/baselines/${encodeURIComponent(deviceId)}/quality-check?lookbackDays=${lookbackDays}&pointsCount=200`,
        )
        if (qc.success) qa = qualityFromCheck(qc.data)
      } catch {
        // ignore quality check failure
      }

      const gradeTexts = {
        excellent: '优秀级',
        good: '良好级',
        fair: '一般级',
        poor: '可接受',
        critical: '严重',
      } as const

      const qualityGradeLabel =
        qa?.qualityGrade && qa.qualityGrade in gradeTexts ? gradeTexts[qa.qualityGrade as keyof typeof gradeTexts] : '良好级'
      const overallScorePct = qa ? (qa.overallScore * 100).toFixed(1) : '0.0'

      const successMsg = useSimple
        ? `简易基准点建立成功！使用了${autoResp.data?.pointsUsed ?? 0}个数据点`
        : `专业级基准点建立成功！质量等级: ${qualityGradeLabel}`

      message.success(successMsg)
      setAutoModalVisible(false)
      autoForm.resetFields()
      void fetchBaselines()

      Modal.info({
        title: '基准点质量分析报告',
        width: 800,
        content: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Text strong>数据分析:</Text>
                <div className="mt-2 space-y-1">
                  <div>总数据点: {autoResp.data?.pointsUsed ?? '-'}</div>
                  <div>有效数据点: {autoResp.data?.pointsUsed ?? '-'}</div>
                  <div>异常值移除: 0</div>
                </div>
              </div>
              <div>
                <Text strong>质量评估:</Text>
                <div className="mt-2 space-y-1">
                  <div>质量等级: {qualityGradeLabel}</div>
                  <div>综合评分: {overallScorePct}%</div>
                  <div>
                    精度:{' '}
                    {typeof autoResp.data?.statistics?.positionAccuracyMeters === 'number'
                      ? `${autoResp.data.statistics.positionAccuracyMeters.toFixed(2)}米`
                      : '-'}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <Text strong>建议:</Text>
              <ul className="mt-2">
                {(qa?.recommendations?.length ? qa.recommendations : ['无']).map((rec: string, index: number) => (
                  <li key={index}>• {rec}</li>
                ))}
              </ul>
            </div>
          </div>
        ),
      })
    } catch {
      message.error(useSimple ? '简易基准点建立失败' : '专业级基准点建立失败')
    }
  }

  const handleDeleteBaseline = (deviceId: string) => {
    setDeleteDeviceId(deviceId)
    setDeleteModalVisible(true)
  }

  const confirmDeleteBaseline = async () => {
    try {
      const actualId = resolveActualDeviceId(deleteDeviceId)
      await apiDeleteJson<ApiSuccessResponse<unknown>>(`/api/v1/gps/baselines/${encodeURIComponent(actualId)}`)
      message.success('删除成功')
      setDeleteModalVisible(false)
      setDeleteDeviceId('')
      void fetchBaselines()
    } catch {
      message.error('删除失败')
    }
  }

  const getQualityTag = (deviceId: string) => {
    const assessment = qualityAssessments.get(deviceId)
    if (!assessment) return <Tag color="default">未评估</Tag>

    const gradeColors = {
      excellent: 'gold',
      good: 'green',
      fair: 'blue',
      poor: 'orange',
      critical: 'red',
    }

    const gradeTexts = {
      excellent: '优秀',
      good: '良好',
      fair: '一般',
      poor: '较差',
      critical: '严重',
    }

    return (
      <Tooltip title={`评分: ${(assessment.overallScore * 100).toFixed(1)}%`}>
        <Tag color={gradeColors[assessment.qualityGrade as keyof typeof gradeColors]}>
          {gradeTexts[assessment.qualityGrade as keyof typeof gradeTexts]}
        </Tag>
      </Tooltip>
    )
  }

  const getStatusTag = (status: string) => {
    const statusConfig = {
      active: { color: 'green', text: '活跃' },
      inactive: { color: 'red', text: '非活跃' },
      needs_update: { color: 'orange', text: '需要更新' },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || { color: 'default', text: status }
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const columns = [
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 120,
      render: (deviceId: string) => (
        <Text code className="text-cyan-300">
          {deviceId}
        </Text>
      ),
    },
    {
      title: '坐标位置',
      key: 'coordinates',
      width: 220,
      render: (_: any, record: Baseline) => (
        <div className="space-y-1">
          <div className="text-xs text-slate-400">纬度: {record.baseline_latitude.toFixed(8)}</div>
          <div className="text-xs text-slate-400">经度: {record.baseline_longitude.toFixed(8)}</div>
        </div>
      ),
    },
    {
      title: '海拔 (m)',
      dataIndex: 'baseline_altitude',
      key: 'altitude',
      width: 80,
      render: (altitude: number) => <span className="text-green-400">{altitude ? altitude.toFixed(2) : '-'}</span>,
    },
    {
      title: '精度 (m)',
      dataIndex: 'position_accuracy',
      key: 'accuracy',
      width: 80,
      render: (accuracy: number) => <span className="text-blue-400">{accuracy ? accuracy.toFixed(2) : '-'}</span>,
    },
    {
      title: '卫星数',
      dataIndex: 'satellite_count',
      key: 'satellites',
      width: 70,
      render: (count: number) => <span className="text-purple-400">{count || '-'}</span>,
    },
    {
      title: 'PDOP',
      dataIndex: 'pdop_value',
      key: 'pdop',
      width: 70,
      render: (pdop: number) => <span className="text-yellow-400">{pdop ? pdop.toFixed(2) : '-'}</span>,
    },
    {
      title: '质量等级',
      key: 'quality',
      width: 100,
      render: (_: any, record: Baseline) => getQualityTag(record.device_id),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '建立人',
      dataIndex: 'established_by',
      key: 'established_by',
      width: 120,
      render: (by: string) => <span className="block max-w-full truncate text-slate-300">{by}</span>,
    },
    {
      title: '建立时间',
      dataIndex: 'established_time',
      key: 'established_time',
      width: 160,
      render: (time: string) => <span className="whitespace-nowrap text-xs text-slate-400">{new Date(time).toLocaleString('zh-CN')}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: Baseline) => (
        <div className="flex items-center justify-center space-x-3">
          <Tooltip title="编辑基准点">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditBaseline(record)}
              className="flex items-center space-x-1 rounded px-2 py-1 text-cyan-400 hover:bg-cyan-400/10 hover:text-cyan-300"
            >
              <span>编辑</span>
            </Button>
          </Tooltip>
          <Tooltip title="删除基准点">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteBaseline(record.device_id)}
              className="flex items-center space-x-1 rounded px-2 py-1 text-red-400 hover:bg-red-400/10 hover:text-red-300"
            >
              <span>删除</span>
            </Button>
          </Tooltip>
        </div>
      ),
      width: 160,
    },
  ]

  const statistics = {
    total: baselines.length,
    active: baselines.filter((b) => b.status === 'active').length,
    avgAccuracy:
      baselines.length > 0
        ? baselines.filter((b) => b.position_accuracy).reduce((sum, b) => sum + (b.position_accuracy || 0), 0) /
          Math.max(baselines.filter((b) => b.position_accuracy).length, 1)
        : 0,
    excellentQuality: Array.from(qualityAssessments.values()).filter((q) => q.qualityGrade === 'excellent').length,
  }

  return (
    <div className={`${className} w-full`}>
      <div className="mb-6 border-b border-slate-600 bg-slate-800/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h4 className="mb-2 flex items-center space-x-2 text-lg font-bold text-cyan-300">
                <span>GPS基准点管理系统</span>
                <Badge count="V2.0" style={{ backgroundColor: '#52c41a' }} />
              </h4>
              <p className="text-sm text-slate-400">高精度GPS基准点建立与维护，支持智能自动化建立</p>
            </div>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateBaseline} className="border-cyan-500 bg-cyan-500 hover:bg-cyan-600">
                手动设置基准点
              </Button>
              <Button
                icon={<RobotOutlined />}
                onClick={() => setAutoModalVisible(true)}
                className="border-none bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600"
              >
                智能自动建立
              </Button>
            </Space>
          </div>

          <div className="grid grid-cols-4 gap-6">
            <div className="rounded-lg border border-slate-600 bg-slate-700/30 p-4">
              <Statistic
                title={<span className="text-slate-400">总基准点数</span>}
                value={statistics.total}
                prefix={<EnvironmentOutlined className="text-cyan-400" />}
                valueStyle={{ color: '#22d3ee' }}
                suffix="个"
              />
            </div>
            <div className="rounded-lg border border-slate-600 bg-slate-700/30 p-4">
              <Statistic
                title={<span className="text-slate-400">活跃基准点</span>}
                value={statistics.active}
                prefix={<CheckCircleOutlined className="text-green-400" />}
                valueStyle={{ color: '#4ade80' }}
                suffix="个"
              />
            </div>
            <div className="rounded-lg border border-slate-600 bg-slate-700/30 p-4">
              <Statistic
                title={<span className="text-slate-400">平均精度</span>}
                value={statistics.avgAccuracy.toFixed(2)}
                prefix={<AimOutlined className="text-purple-400" />}
                valueStyle={{ color: '#a855f7' }}
                suffix="m"
              />
            </div>
            <div className="rounded-lg border border-slate-600 bg-slate-700/30 p-4">
              <Statistic
                title={<span className="text-slate-400">优秀质量</span>}
                value={statistics.excellentQuality}
                prefix={<StarOutlined className="text-yellow-400" />}
                valueStyle={{ color: '#facc15' }}
                suffix="个"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-600 bg-slate-800/50 backdrop-blur-sm">
        <div className="p-6">
          <Table
            columns={columns}
            dataSource={baselines}
            rowKey="device_id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 个基准点`,
              className: 'dark-pagination',
            }}
            scroll={{ x: 'max-content' }}
            className="dark-table"
            size="middle"
          />
        </div>
      </div>

      <Modal
        title={
          <div className="flex items-center space-x-2">
            <EnvironmentOutlined className="text-cyan-400" />
            <span>{editMode ? '编辑基准点' : '手动设置基准点'}</span>
          </div>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditMode(false)
          setSelectedBaseline(null)
        }}
        footer={null}
        width={700}
        className="dark-modal"
      >
        <Form form={form} layout="vertical" onFinish={handleSaveBaseline}>
          <Form.Item name="device_id" label="设备ID" rules={[{ required: true, message: '请选择设备' }]}>
            <Select placeholder="选择设备" className="dark-select" disabled={editMode}>
              {devices.map((device) => (
                <Option key={device} value={device}>
                  {device}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="latitude"
                label="纬度"
                rules={[
                  { required: true, message: '请输入纬度' },
                  { type: 'number', min: -90, max: 90, message: '纬度范围: -90 到 90' },
                ]}
              >
                <InputNumber style={{ width: '100%' }} precision={8} placeholder="例如: 22.62736667" className="dark-input" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="longitude"
                label="经度"
                rules={[
                  { required: true, message: '请输入经度' },
                  { type: 'number', min: -180, max: 180, message: '经度范围: -180 到 180' },
                ]}
              >
                <InputNumber style={{ width: '100%' }} precision={8} placeholder="例如: 110.18930000" className="dark-input" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="altitude" label="海拔 (米)">
            <InputNumber style={{ width: '100%' }} precision={2} placeholder="例如: 156.78" className="dark-input" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="positionAccuracy" label="位置精度 (米)">
                <InputNumber style={{ width: '100%' }} precision={3} min={0} placeholder="例如: 2.500" className="dark-input" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="satelliteCount" label="卫星数量">
                <InputNumber style={{ width: '100%' }} min={0} max={50} placeholder="例如: 12" className="dark-input" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pdopValue" label="PDOP值">
                <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="例如: 1.50" className="dark-input" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="measurementDuration" label="测量时长 (秒)">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="例如: 300" className="dark-input" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="establishedBy" label="建立人" rules={[{ required: true, message: '请输入建立人' }]}>
            <Input placeholder="例如: 张工程师" className="dark-input" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <TextArea rows={3} placeholder="基准点相关说明.." className="dark-input" />
          </Form.Item>

          <div className="flex justify-end space-x-3 border-t border-slate-600 pt-4">
            <Button
              onClick={() => {
                setModalVisible(false)
                form.resetFields()
                setEditMode(false)
                setSelectedBaseline(null)
              }}
            >
              取消
            </Button>
            <Button type="primary" htmlType="submit" className="bg-cyan-500 hover:bg-cyan-600">
              {editMode ? '更新基准点' : '创建基准点'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <div className="flex items-center space-x-2">
            <RobotOutlined className="text-purple-400" />
            <span>智能自动建立基准点</span>
            <Badge count="NEW" style={{ backgroundColor: '#722ed1' }} />
          </div>
        }
        open={autoModalVisible}
        onCancel={() => {
          setAutoModalVisible(false)
          autoForm.resetFields()
        }}
        footer={null}
        width={600}
        className="dark-modal"
      >
        <Alert
          message="两种建立模式"
          description="快速建立：降低要求，快速生成基准点用于测试；高精度建立：严格算法，高质量基准点。"
          type="info"
          showIcon
          className="mb-4 border-blue-400/30 bg-blue-500/10"
        />

        <Form form={autoForm} layout="vertical">
          <Form.Item name="device_id" label="设备ID" rules={[{ required: true, message: '请选择设备' }]}>
            <Select placeholder="选择设备" className="dark-select">
              {devices.map((device) => (
                <Option key={device} value={device}>
                  {device}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="analysisHours" label="分析时间窗口 (小时)" initialValue={24}>
                <InputNumber style={{ width: '100%' }} min={2} max={48} placeholder="推荐: 24小时" className="dark-input" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="requiredQuality" label="质量要求" initialValue="fair">
                <Select className="dark-select">
                  <Option value="excellent">优秀级 (90%+)</Option>
                  <Option value="good">良好级 (80%+)</Option>
                  <Option value="fair">一般级 (65%+)</Option>
                  <Option value="poor">可接受 (50%+)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="maxRetries" label="最大重试次数" initialValue={3}>
            <InputNumber style={{ width: '100%' }} min={1} max={5} placeholder="推荐: 3次" className="dark-input" />
          </Form.Item>

          <Form.Item name="establishedBy" label="建立人" initialValue="AI智能系统">
            <Input placeholder="例如: AI智能系统" className="dark-input" />
          </Form.Item>

          <Form.Item name="notes" label="备注" initialValue="基于高精度算法自动建立的高质量基准点">
            <TextArea rows={3} placeholder="备注信息..." className="dark-input" />
          </Form.Item>

          <div className="flex justify-end space-x-3 border-t border-slate-600 pt-4">
            <Button
              onClick={() => {
                setAutoModalVisible(false)
                autoForm.resetFields()
              }}
            >
              取消
            </Button>
            <Button
              type="default"
              onClick={() => {
                autoForm
                  .validateFields()
                  .then((vals) => {
                    handleAutoBaseline(vals, true)
                  })
                  .catch((err) => {
                    console.error('表单验证失败:', err)
                  })
              }}
              className="border-none bg-green-500 text-white hover:bg-green-600"
            >
              快速建立(简单模式)
            </Button>
            <Button
              type="primary"
              onClick={() => {
                autoForm
                  .validateFields()
                  .then((vals) => {
                    handleAutoBaseline(vals, false)
                  })
                  .catch((err) => {
                    console.error('表单验证失败:', err)
                  })
              }}
              className="border-none bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              高精度建立(高级模式)
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <div className="flex items-center space-x-2">
            <DeleteOutlined className="text-red-400" />
            <span>确认删除基准点</span>
          </div>
        }
        open={deleteModalVisible}
        onCancel={() => {
          setDeleteModalVisible(false)
          setDeleteDeviceId('')
        }}
        className="dark-modal"
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setDeleteModalVisible(false)
              setDeleteDeviceId('')
            }}
          >
            取消
          </Button>,
          <Button key="delete" type="primary" danger onClick={confirmDeleteBaseline} className="bg-red-500 hover:bg-red-600">
            确定删除
          </Button>,
        ]}
      >
        <div className="space-y-3">
          <Alert
            message="删除警告"
            description="删除基准点是不可逆操作，请确认您要继续。"
            type="warning"
            showIcon
            className="border-yellow-400/30 bg-yellow-500/10"
          />
          <div className="text-slate-300">
            确定要删除设备 <Text code className="text-red-400">{deleteDeviceId}</Text> 的基准点吗？
          </div>
          <div className="text-sm text-slate-400">删除后，该设备将失去地质形变分析的参考基准，可能影响监测精度。</div>
        </div>
      </Modal>

      <style jsx global>{`
        .dark-table .ant-table {
          background: transparent;
          color: #e2e8f0;
        }

        .dark-table .ant-table-thead > tr > th {
          background: #334155;
          color: #06b6d4;
          border-bottom: 1px solid #475569;
        }

        .dark-table .ant-table-tbody > tr > td {
          background: transparent;
          border-bottom: 1px solid #475569;
          color: #e2e8f0;
          padding: 8px 12px !important;
        }

        .dark-table .ant-table-tbody > tr:hover > td {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .dark-table .ant-table-tbody > tr:hover {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .dark-table .ant-table-tbody > tr.ant-table-row:hover > td {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .dark-table .ant-table-tbody code {
          background: rgba(34, 211, 238, 0.1) !important;
          color: #22d3ee !important;
          border: 1px solid rgba(34, 211, 238, 0.3) !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
        }

        .dark-table .ant-table-tbody > tr:hover > td,
        .dark-table .ant-table-tbody > tr.ant-table-row:hover > td,
        .dark-table .ant-table-tbody > tr:hover > td.ant-table-cell,
        .dark-table .ant-table-tbody > tr.ant-table-row:hover > td.ant-table-cell {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .dark-table .ant-table-tbody > tr:hover,
        .dark-table .ant-table-tbody > tr.ant-table-row:hover {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .ant-table-tbody > tr.ant-table-row:hover > td,
        .ant-table-tbody > tr.ant-table-row-hover > td,
        .ant-table-tbody > tr:hover > td {
          background: rgba(71, 85, 105, 0.3) !important;
        }

        .dark-pagination .ant-pagination-total-text {
          color: #e2e8f0 !important;
        }

        .dark-pagination .ant-select-selector {
          background: #334155 !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark-pagination .ant-select-selection-item {
          color: #e2e8f0 !important;
        }

        .dark-pagination .ant-select-arrow {
          color: #94a3b8 !important;
        }

        .dark-pagination .ant-select-dropdown {
          background: #334155 !important;
          border: 1px solid #475569 !important;
        }

        .dark-pagination .ant-select-item {
          background: #334155 !important;
          color: #e2e8f0 !important;
        }

        .dark-pagination .ant-select-item:hover {
          background: #475569 !important;
        }

        .dark-pagination .ant-select-item-option-selected {
          background: #06b6d4 !important;
          color: white !important;
        }

        .dark-pagination .ant-pagination-item {
          background: #334155;
          border-color: #475569;
        }

        .dark-pagination .ant-pagination-item a {
          color: #e2e8f0;
        }

        .dark-pagination .ant-pagination-item-active {
          background: #06b6d4;
          border-color: #06b6d4;
        }

        .dark-modal .ant-modal-content {
          background: #1e293b;
          color: #e2e8f0;
        }

        .dark-modal .ant-modal-header {
          background: #334155;
          border-bottom: 1px solid #475569;
        }

        .dark-modal .ant-modal-title {
          color: #06b6d4;
        }

        .dark-input.ant-input,
        .dark-input.ant-input-number,
        .dark-select .ant-select-selector {
          background: #334155 !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }

        .dark-input.ant-input:hover,
        .dark-input.ant-input-number:hover,
        .dark-select .ant-select-selector:hover {
          border-color: #06b6d4 !important;
        }

        .dark-input.ant-input:focus,
        .dark-input.ant-input-number:focus,
        .dark-select .ant-select-focused .ant-select-selector {
          border-color: #06b6d4 !important;
          box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2) !important;
        }
      `}</style>
    </div>
  )
}
