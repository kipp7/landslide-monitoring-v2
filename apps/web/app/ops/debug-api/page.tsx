'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, Button, Card, Checkbox, Divider, Input, InputNumber, Select, Space, Tag, Typography, message } from 'antd'
import { apiGetJson, apiJson, buildApiUrl, getApiBaseUrl, getApiBearerToken } from '../../../lib/v2Api'

const { Title, Text } = Typography

function stringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

type Preset = { label: string; path: string }

type SmokeTestResult = {
  test: string
  success: boolean
  data?: unknown
  error?: string
  timestamp: string
}

function toErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

export default function OpsDebugApiPage() {
  const presets: Preset[] = useMemo(
    () => [
      { label: 'GET /health', path: '/health' },
      { label: 'GET /huawei/config (legacy)', path: '/huawei/config' },
      { label: 'GET /huawei/command-templates (legacy)', path: '/huawei/command-templates' },
      { label: 'GET /huawei/devices/:deviceId/shadow (legacy)', path: '/huawei/devices/<deviceId>/shadow' },
      { label: 'GET /api/test-db (legacy)', path: '/api/test-db' },
      { label: 'GET /api/inspect-db (legacy)', path: '/api/inspect-db' },
      { label: 'GET /api/inspect-tables (legacy)', path: '/api/inspect-tables' },
      { label: 'GET /api/inspect-all-tables (legacy)', path: '/api/inspect-all-tables' },
      { label: 'GET /api/test-expert-health (legacy)', path: '/api/test-expert-health?device_id=<deviceId>' },
      { label: 'GET /api/v1/system/status', path: '/api/v1/system/status' },
      { label: 'GET /api/v1/dashboard', path: '/api/v1/dashboard' },
      { label: 'GET /api/v1/system/configs', path: '/api/v1/system/configs' },
      { label: 'GET /api/v1/system/logs/api-stats', path: '/api/v1/system/logs/api-stats' },
      { label: 'GET /api/v1/system/logs/operation', path: '/api/v1/system/logs/operation?page=1&pageSize=10' },
      { label: 'GET /api/v1/stations', path: '/api/v1/stations?page=1&pageSize=10' },
      { label: 'GET /api/v1/devices', path: '/api/v1/devices?page=1&pageSize=10' },
      { label: 'GET /api/v1/alerts', path: '/api/v1/alerts?page=1&pageSize=10' },
      { label: 'GET /api/v1/sensors', path: '/api/v1/sensors?page=1&pageSize=10' },
      { label: 'GET /api/v1/telemetry/dlq/stats', path: '/api/v1/telemetry/dlq/stats' },
    ],
    [],
  )

  const [selected, setSelected] = useState<string>(presets[0]?.path ?? '/api/v1/system/status')
  const [path, setPath] = useState<string>(selected)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')

  const [suiteLoading, setSuiteLoading] = useState(false)
  const [suiteResults, setSuiteResults] = useState<SmokeTestResult[]>([])
  const [suiteDeviceId, setSuiteDeviceId] = useState<string>('')

  const [suiteHealth, setSuiteHealth] = useState(true)
  const [suiteHuaweiConfig, setSuiteHuaweiConfig] = useState(true)
  const [suiteCommandTemplates, setSuiteCommandTemplates] = useState(false)
  const [suiteShadow, setSuiteShadow] = useState(false)
  const [suiteMotor, setSuiteMotor] = useState(false)
  const [suiteTestDb, setSuiteTestDb] = useState(false)
  const [suiteInspectDb, setSuiteInspectDb] = useState(false)
  const [suiteInspectTables, setSuiteInspectTables] = useState(false)
  const [suiteInspectAllTables, setSuiteInspectAllTables] = useState(false)
  const [suiteTestExpertHealth, setSuiteTestExpertHealth] = useState(false)
  const [suiteDbAdmin, setSuiteDbAdmin] = useState(false)

  const [motorEnable, setMotorEnable] = useState(true)
  const [motorSpeed, setMotorSpeed] = useState<number>(50)
  const [motorDirection, setMotorDirection] = useState<number>(1)
  const [motorDuration, setMotorDuration] = useState<number>(2)
  const [motorConfirm, setMotorConfirm] = useState<string>('')
  const [dbAdminConfirm, setDbAdminConfirm] = useState<string>('')

  const addSuiteResult = (test: string, success: boolean, data?: unknown, error?: string) => {
    setSuiteResults((prev) => [...prev, { test, success, data, error, timestamp: new Date().toLocaleString() }])
  }

  const run = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult('')
      const json = await apiGetJson<unknown>(path)
      setResult(stringify(json))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setResult('')
    } finally {
      setLoading(false)
    }
  }

  const runSuite = async () => {
    if (suiteDbAdmin && dbAdminConfirm.trim().toUpperCase() !== 'DBADMIN') {
      message.error('db-admin selected: type DBADMIN to confirm.')
      return
    }
    if (suiteMotor && motorConfirm.trim().toUpperCase() !== 'MOTOR') {
      message.error('已勾选“电机控制”，请先输入确认短语 MOTOR 才会执行 POST 命令。')
      return
    }

    setSuiteLoading(true)
    setSuiteResults([])

    const baseUrl = getApiBaseUrl()
    const hasToken = Boolean(getApiBearerToken())
    const location =
      typeof window === 'undefined'
        ? null
        : { hostname: window.location.hostname, port: window.location.port, protocol: window.location.protocol, href: window.location.href }

    addSuiteResult('API 配置检查', true, {
      location,
      apiBaseUrl: baseUrl,
      hasBearerToken: hasToken,
      healthUrl: buildApiUrl('/health'),
      huaweiConfigUrl: buildApiUrl('/huawei/config'),
    })

    const exec = async (label: string, fn: () => Promise<unknown>) => {
      try {
        const json = await fn()
        addSuiteResult(label, true, json)
      } catch (caught) {
        addSuiteResult(label, false, undefined, toErrorMessage(caught))
      }
    }

    try {
      if (suiteHealth) await exec('健康检查', () => apiGetJson<unknown>('/health'))
      if (suiteHuaweiConfig) await exec('华为云配置', () => apiGetJson<unknown>('/huawei/config'))
      if (suiteCommandTemplates) await exec('命令模板', () => apiGetJson<unknown>('/huawei/command-templates'))

      const trimmedDeviceId = suiteDeviceId.trim()
      const legacyDeviceId = trimmedDeviceId || 'device_1'

      if (suiteShadow) {
        if (!trimmedDeviceId) addSuiteResult('设备影子', false, undefined, 'deviceId 不能为空（可填 uuid 或 legacy/huawei device id）')
        else await exec('设备影子', () => apiGetJson<unknown>(`/huawei/devices/${encodeURIComponent(trimmedDeviceId)}/shadow`))
      }

      if (suiteMotor) {
        if (!trimmedDeviceId) {
          addSuiteResult('电机控制', false, undefined, 'deviceId 不能为空（可填 uuid 或 legacy/huawei device id）')
        } else {
          await exec('电机控制', () =>
            apiJson<unknown>(`/huawei/devices/${encodeURIComponent(trimmedDeviceId)}/motor`, {
              enable: motorEnable,
              speed: motorSpeed,
              direction: motorDirection,
              duration: motorDuration,
            }),
          )
        }
      }
      if (suiteTestDb) await exec('test-db (legacy)', () => apiGetJson<unknown>('/api/test-db'))
      if (suiteInspectDb) await exec('inspect-db (legacy)', () => apiGetJson<unknown>('/api/inspect-db'))
      if (suiteInspectTables) await exec('inspect-tables (legacy)', () => apiGetJson<unknown>('/api/inspect-tables'))
      if (suiteInspectAllTables) await exec('inspect-all-tables (legacy)', () => apiGetJson<unknown>('/api/inspect-all-tables'))
      if (suiteTestExpertHealth) {
        await exec('test-expert-health (legacy)', () =>
          apiGetJson<unknown>(`/api/test-expert-health?device_id=${encodeURIComponent(legacyDeviceId)}`),
        )
      }
      if (suiteDbAdmin) {
        await exec('db-admin (POST)', () => apiJson<unknown>('/api/db-admin', { action: 'query', query: 'SELECT 1 AS ok' }))
      }
    } finally {
      setSuiteLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Debug API
          </Title>
          <Text type="secondary">受 RBAC 保护的“接口连通性”调试页（仅 GET；不内嵌密钥；不直连数据库）。</Text>
        </div>
        <Space>
          <Link href="/ops/system-monitor">系统监控</Link>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/telemetry-dlq">Telemetry DLQ</Link>
          <Link href="/ops/api-stats">API Stats</Link>
        </Space>
      </div>

      <Card>
        <Space wrap>
          <Select
            style={{ width: 420 }}
            value={selected}
            options={presets.map((p) => ({ value: p.path, label: p.label }))}
            onChange={(v) => {
              setSelected(v)
              setPath(v)
            }}
          />
          <Input style={{ width: 520 }} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/v1/..." />
          <Button type="primary" onClick={() => void run()} loading={loading}>
            请求
          </Button>
        </Space>

        <Divider />

        {error ? (
          <div>
            <Text type="danger">请求失败：{error}</Text>
            <div className="mt-2">
              <Text type="secondary">如果提示 401/403，请先登录或在“设置”页配置 Bearer Token。</Text>
            </div>
          </div>
        ) : null}

        {result ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="font-mono">
            {result}
          </pre>
        ) : (
          <Text type="secondary">{loading ? '请求中…' : '暂无输出'}</Text>
        )}
      </Card>

      <Card title="一键连通性测试（参考区 `/debug-api`）">
        <div className="space-y-4">
          <Text type="secondary">
            用于快速验证 API 基础连通性与 legacy Huawei 兼容端点。默认只跑 GET；危险的设备控制（POST）默认关闭并需要二次确认。
          </Text>

          <Space wrap>
            <Checkbox checked={suiteHealth} onChange={(e) => setSuiteHealth(e.target.checked)}>
              健康检查（GET /health）
            </Checkbox>
            <Checkbox checked={suiteHuaweiConfig} onChange={(e) => setSuiteHuaweiConfig(e.target.checked)}>
              华为云配置（GET /huawei/config）
            </Checkbox>
            <Checkbox checked={suiteCommandTemplates} onChange={(e) => setSuiteCommandTemplates(e.target.checked)}>
              命令模板（GET /huawei/command-templates）
            </Checkbox>
            <Checkbox checked={suiteShadow} onChange={(e) => setSuiteShadow(e.target.checked)}>
              设备影子（GET /huawei/devices/:deviceId/shadow）
            </Checkbox>
            <Checkbox checked={suiteMotor} onChange={(e) => setSuiteMotor(e.target.checked)}>
              电机控制（POST /huawei/devices/:deviceId/motor）
            </Checkbox>
            <Checkbox checked={suiteTestDb} onChange={(e) => setSuiteTestDb(e.target.checked)}>
              GET /api/test-db (legacy)
            </Checkbox>
            <Checkbox checked={suiteInspectDb} onChange={(e) => setSuiteInspectDb(e.target.checked)}>
              GET /api/inspect-db (legacy)
            </Checkbox>
            <Checkbox checked={suiteInspectTables} onChange={(e) => setSuiteInspectTables(e.target.checked)}>
              GET /api/inspect-tables (legacy)
            </Checkbox>
            <Checkbox checked={suiteInspectAllTables} onChange={(e) => setSuiteInspectAllTables(e.target.checked)}>
              GET /api/inspect-all-tables (legacy)
            </Checkbox>
            <Checkbox checked={suiteTestExpertHealth} onChange={(e) => setSuiteTestExpertHealth(e.target.checked)}>
              GET /api/test-expert-health (legacy)
            </Checkbox>
            <Checkbox checked={suiteDbAdmin} onChange={(e) => setSuiteDbAdmin(e.target.checked)}>
              POST /api/db-admin (disabled by default)
            </Checkbox>
          </Space>

          <Space wrap>
            <Input
              style={{ width: 520 }}
              value={suiteDeviceId}
              onChange={(e) => setSuiteDeviceId(e.target.value)}
              placeholder="deviceId（uuid 或 legacy/huawei device id；用于 shadow / motor）"
            />
            <Button type="primary" onClick={() => void runSuite()} loading={suiteLoading}>
              开始测试
            </Button>
            <Button onClick={() => setSuiteResults([])} disabled={suiteLoading || suiteResults.length === 0}>
              清空结果
            </Button>
          </Space>

          {suiteMotor ? (
            <div className="space-y-2">
              <Alert
                type="warning"
                showIcon
                message="危险：电机控制会下发设备命令"
                description="仅用于运维排障；需要 device:control 权限与后端命令管线（PostgreSQL + Kafka）启用。"
              />
              <Space wrap>
                <Checkbox checked={motorEnable} onChange={(e) => setMotorEnable(e.target.checked)}>
                  enable
                </Checkbox>
                <span>speed</span>
                <InputNumber min={0} max={100} value={motorSpeed} onChange={(v) => setMotorSpeed(typeof v === 'number' ? v : 50)} />
                <span>direction</span>
                <Select
                  style={{ width: 120 }}
                  value={motorDirection}
                  options={[
                    { value: -1, label: '-1' },
                    { value: 0, label: '0' },
                    { value: 1, label: '1' },
                  ]}
                  onChange={(v) => setMotorDirection(v)}
                />
                <span>duration(s)</span>
                <InputNumber min={1} max={3600} value={motorDuration} onChange={(v) => setMotorDuration(typeof v === 'number' ? v : 2)} />
                <Input
                  style={{ width: 260 }}
                  value={motorConfirm}
                  onChange={(e) => setMotorConfirm(e.target.value)}
                  placeholder='输入 "MOTOR" 以确认执行'
                />
              </Space>
            </div>
          ) : null}

          {suiteDbAdmin ? (
            <div className="space-y-2">
              <Alert
                type="info"
                showIcon
                message="db-admin (POST) is a privileged diagnostic tool"
                description="Requires DB_ADMIN_ENABLED=true + permission system:config; write actions remain disabled."
              />
              <Input
                style={{ width: 320 }}
                value={dbAdminConfirm}
                onChange={(e) => setDbAdminConfirm(e.target.value)}
                placeholder="Type DBADMIN to confirm"
              />
            </div>
          ) : null}

          <Divider />

          {suiteResults.length > 0 ? (
            <div className="space-y-3">
              {suiteResults.map((r, idx) => (
                <div key={`${idx}-${r.test}`} className="rounded border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <Space>
                      <Tag color={r.success ? 'green' : 'red'}>{r.success ? 'PASS' : 'FAIL'}</Tag>
                      <Text strong>{r.test}</Text>
                    </Space>
                    <Text type="secondary" className="font-mono">
                      {r.timestamp}
                    </Text>
                  </div>

                  {r.error ? <div className="mt-2 text-sm text-red-600">错误：{r.error}</div> : null}

                  {r.data !== undefined ? (
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="mt-2 font-mono text-xs">
                      {stringify(r.data)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary">{suiteLoading ? '测试中…' : '暂无结果'}</Text>
          )}
        </div>
      </Card>
    </div>
  )
}
