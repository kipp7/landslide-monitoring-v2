'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Input, Modal, Select, Space, Table, Typography, message } from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import {
  getCommandSuccessNotificationPolicy,
  getOperationLogs,
  getSystemConfigs,
  putCommandSuccessNotificationPolicy,
  putSystemConfigs,
  type CommandSuccessNotificationPolicyResponse,
  type ConfigRow,
  type OperationLogRow,
} from '../../../lib/api/system'

const { Title, Text } = Typography

type PolicyRow = { commandType: string; policy: 'silent' | 'always_notify' }
type PolicyTemplate = { commandType: string; policy: 'silent' | 'always_notify'; label: string }
type PolicySnapshot = CommandSuccessNotificationPolicyResponse
type PolicyChangeDetails = {
  systemDefaultChanged: boolean
  added: Array<{ commandType: string; policy: 'silent' | 'always_notify' }>
  removed: Array<{ commandType: string; policy: 'silent' | 'always_notify' }>
  changed: Array<{ commandType: string; before: 'silent' | 'always_notify'; after: 'silent' | 'always_notify' }>
}

const RECOMMENDED_POLICY_DEFAULTS: CommandSuccessNotificationPolicyResponse = {
  systemDefault: 'silent',
  commandTypeDefaults: {
    set_config: 'always_notify',
    reboot: 'always_notify',
    restart_device: 'always_notify',
    deactivate_device: 'always_notify',
    set_sampling_interval: 'always_notify',
    manual_collect: 'always_notify',
    'huawei:reboot': 'always_notify',
  },
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  { commandType: 'set_config', policy: 'always_notify', label: 'set_config' },
  { commandType: 'reboot', policy: 'always_notify', label: 'reboot' },
  { commandType: 'restart_device', policy: 'always_notify', label: 'restart_device' },
  { commandType: 'deactivate_device', policy: 'always_notify', label: 'deactivate_device' },
  { commandType: 'set_sampling_interval', policy: 'always_notify', label: 'set_sampling_interval' },
  { commandType: 'manual_collect', policy: 'always_notify', label: 'manual_collect' },
  { commandType: 'motor_start', policy: 'silent', label: 'motor_start' },
  { commandType: 'motor_stop', policy: 'silent', label: 'motor_stop' },
  { commandType: 'buzzer_on', policy: 'silent', label: 'buzzer_on' },
  { commandType: 'buzzer_off', policy: 'silent', label: 'buzzer_off' },
  { commandType: 'huawei:reboot', policy: 'always_notify', label: 'huawei:reboot' },
]

function readPolicySnapshot(value: unknown, key: 'previousPolicy' | 'nextPolicy'): PolicySnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const candidate = record[key]
  if (!candidate || typeof candidate !== 'object') return null
  const snapshot = candidate as Record<string, unknown>
  const systemDefault = snapshot.systemDefault
  const commandTypeDefaults = snapshot.commandTypeDefaults
  if ((systemDefault !== 'silent' && systemDefault !== 'always_notify') || !commandTypeDefaults || typeof commandTypeDefaults !== 'object') {
    return null
  }
  const normalized: Record<string, 'silent' | 'always_notify'> = {}
  for (const [commandType, policy] of Object.entries(commandTypeDefaults as Record<string, unknown>)) {
    if ((policy === 'silent' || policy === 'always_notify') && commandType.trim()) {
      normalized[commandType] = policy
    }
  }
  return { systemDefault, commandTypeDefaults: normalized }
}

function summarizePolicyChange(requestData: unknown): string {
  const previousPolicy = readPolicySnapshot(requestData, 'previousPolicy')
  const nextPolicy = readPolicySnapshot(requestData, 'nextPolicy')
  if (!previousPolicy || !nextPolicy) return '-'

  const parts: string[] = []
  if (previousPolicy.systemDefault !== nextPolicy.systemDefault) {
    parts.push(`systemDefault ${previousPolicy.systemDefault} -> ${nextPolicy.systemDefault}`)
  }

  const allKeys = Array.from(
    new Set([...Object.keys(previousPolicy.commandTypeDefaults), ...Object.keys(nextPolicy.commandTypeDefaults)])
  ).sort((a, b) => a.localeCompare(b))
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []

  for (const key of allKeys) {
    const before = previousPolicy.commandTypeDefaults[key]
    const after = nextPolicy.commandTypeDefaults[key]
    if (!before && after) added.push(`${key}=${after}`)
    else if (before && !after) removed.push(`${key}=${before}`)
    else if (before && after && before !== after) changed.push(`${key}: ${before} -> ${after}`)
  }

  if (added.length) parts.push(`新增 ${added.join(', ')}`)
  if (changed.length) parts.push(`修改 ${changed.join(', ')}`)
  if (removed.length) parts.push(`移除 ${removed.join(', ')}`)
  return parts.length ? parts.join('；') : '无策略差异'
}

function renderPolicySnapshot(snapshot: PolicySnapshot | null): string {
  if (!snapshot) return '-'
  return JSON.stringify(snapshot, null, 2)
}

async function copyText(text: string): Promise<void> {
  if (!text.trim()) return
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('当前环境不支持剪贴板')
  }
  await navigator.clipboard.writeText(text)
}

function buildPolicyChangeMarkdown(log: OperationLogRow): string {
  const previousPolicy = readPolicySnapshot(log.requestData, 'previousPolicy')
  const nextPolicy = readPolicySnapshot(log.requestData, 'nextPolicy')
  const details = diffPolicySnapshots(previousPolicy, nextPolicy)
  const lines = [
    `- 时间：${log.createdAt}`,
    `- 用户：${log.username}`,
    `- 状态：${log.status}`,
    `- 摘要：${summarizePolicyChange(log.requestData)}`,
    `- systemDefault：${
      details?.systemDefaultChanged ? `${previousPolicy?.systemDefault ?? '-'} -> ${nextPolicy?.systemDefault ?? '-'}` : '无变化'
    }`,
    `- 新增：${details && details.added.length ? details.added.map((item) => `${item.commandType}=${item.policy}`).join(', ') : '无'}`,
    `- 修改：${
      details && details.changed.length ? details.changed.map((item) => `${item.commandType}: ${item.before} -> ${item.after}`).join(', ') : '无'
    }`,
    `- 移除：${details && details.removed.length ? details.removed.map((item) => `${item.commandType}=${item.policy}`).join(', ') : '无'}`,
  ]
  return lines.join('\n')
}

function diffPolicySnapshots(previousPolicy: PolicySnapshot | null, nextPolicy: PolicySnapshot | null): PolicyChangeDetails | null {
  if (!previousPolicy || !nextPolicy) return null

  const allKeys = Array.from(
    new Set([...Object.keys(previousPolicy.commandTypeDefaults), ...Object.keys(nextPolicy.commandTypeDefaults)])
  ).sort((a, b) => a.localeCompare(b))

  const added: PolicyChangeDetails['added'] = []
  const removed: PolicyChangeDetails['removed'] = []
  const changed: PolicyChangeDetails['changed'] = []

  for (const key of allKeys) {
    const before = previousPolicy.commandTypeDefaults[key]
    const after = nextPolicy.commandTypeDefaults[key]
    if (!before && after) added.push({ commandType: key, policy: after })
    else if (before && !after) removed.push({ commandType: key, policy: before })
    else if (before && after && before !== after) changed.push({ commandType: key, before, after })
  }

  return {
    systemDefaultChanged: previousPolicy.systemDefault !== nextPolicy.systemDefault,
    added,
    removed,
    changed,
  }
}

function buildPolicyChangeNotice(log: OperationLogRow): string {
  const previousPolicy = readPolicySnapshot(log.requestData, 'previousPolicy')
  const nextPolicy = readPolicySnapshot(log.requestData, 'nextPolicy')
  const details = diffPolicySnapshots(previousPolicy, nextPolicy)
  const lines = [
    '命令成功通知默认表已更新',
    `时间：${log.createdAt}`,
    `操作人：${log.username}`,
    `结果：${log.status}`,
    `变更摘要：${summarizePolicyChange(log.requestData)}`,
    `systemDefault：${
      details?.systemDefaultChanged ? `${previousPolicy?.systemDefault ?? '-'} -> ${nextPolicy?.systemDefault ?? '-'}` : '无变化'
    }`,
    `新增条目：${details && details.added.length ? details.added.map((item) => `${item.commandType}=${item.policy}`).join('，') : '无'}`,
    `修改条目：${
      details && details.changed.length ? details.changed.map((item) => `${item.commandType}: ${item.before} -> ${item.after}`).join('，') : '无'
    }`,
    `移除条目：${details && details.removed.length ? details.removed.map((item) => `${item.commandType}=${item.policy}`).join('，') : '无'}`,
    '请相关运维/产品同学按需确认命令成功通知策略是否符合当前业务预期。',
  ]
  return lines.join('\n')
}

function buildPolicyChangeExportJson(log: OperationLogRow): string {
  const previousPolicy = readPolicySnapshot(log.requestData, 'previousPolicy')
  const nextPolicy = readPolicySnapshot(log.requestData, 'nextPolicy')
  const details = diffPolicySnapshots(previousPolicy, nextPolicy)
  return JSON.stringify(
    {
      createdAt: log.createdAt,
      username: log.username,
      status: log.status,
      summary: summarizePolicyChange(log.requestData),
      previousPolicy,
      nextPolicy,
      diff: details,
    },
    null,
    2
  )
}

export default function OpsConfigsPage() {
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyHistoryLoading, setPolicyHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyHistory, setPolicyHistory] = useState<OperationLogRow[]>([])
  const [historyDetail, setHistoryDetail] = useState<OperationLogRow | null>(null)
  const [policyDraft, setPolicyDraft] = useState<CommandSuccessNotificationPolicyResponse>({
    systemDefault: 'silent',
    commandTypeDefaults: {},
  })
  const [newCommandType, setNewCommandType] = useState('')
  const [newCommandTypePolicy, setNewCommandTypePolicy] = useState<'silent' | 'always_notify'>('silent')
  const [selectedTemplate, setSelectedTemplate] = useState<string>()

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await getSystemConfigs()
      const list = json.data?.list ?? []
      setRows(list)
      setDraft(Object.fromEntries(list.map((r) => [r.key, r.value ?? ''])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setDraft({})
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPolicy = useCallback(async () => {
    try {
      setPolicyLoading(true)
      setPolicyError(null)
      const json = await getCommandSuccessNotificationPolicy()
      setPolicyDraft(json.data)
    } catch (caught) {
      setPolicyError(caught instanceof Error ? caught.message : String(caught))
      setPolicyDraft({ systemDefault: 'silent', commandTypeDefaults: {} })
    } finally {
      setPolicyLoading(false)
    }
  }, [])

  const fetchPolicyHistory = useCallback(async () => {
    try {
      setPolicyHistoryLoading(true)
      const endTime = new Date().toISOString()
      const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const json = await getOperationLogs({
        page: 1,
        pageSize: 10,
        module: 'system',
        action: 'update_command_success_notification_policy',
        startTime,
        endTime,
      })
      setPolicyHistory(json.data.list)
    } catch {
      setPolicyHistory([])
    } finally {
      setPolicyHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConfigs()
    void fetchPolicy()
    void fetchPolicyHistory()
  }, [fetchConfigs, fetchPolicy, fetchPolicyHistory])

  const changed = useMemo(() => {
    const out: Array<{ key: string; value: string }> = []
    for (const r of rows) {
      const next = draft[r.key] ?? ''
      if (next !== (r.value ?? '')) out.push({ key: r.key, value: next })
    }
    return out
  }, [draft, rows])

  const save = async () => {
    if (changed.length === 0) {
      message.info('没有变更')
      return
    }
    setSaving(true)
    try {
      await putSystemConfigs(changed)
      message.success(`已保存 ${changed.length} 项`)
      await fetchConfigs()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const policyRows = useMemo<PolicyRow[]>(
    () =>
      Object.entries(policyDraft.commandTypeDefaults)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([commandType, policy]) => ({ commandType, policy })),
    [policyDraft.commandTypeDefaults]
  )

  const savePolicy = async () => {
    setPolicySaving(true)
    try {
      await putCommandSuccessNotificationPolicy(policyDraft)
      message.success('已保存 success-notification 默认表')
      await fetchPolicy()
      await fetchPolicyHistory()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPolicySaving(false)
    }
  }

  const addPolicyRow = (commandType = newCommandType, policy = newCommandTypePolicy) => {
    const key = commandType.trim()
    if (!key) {
      message.info('commandType 不能为空')
      return
    }
    if (key.length > 50) {
      message.error('commandType 长度不能超过 50')
      return
    }
    if (policyDraft.commandTypeDefaults[key]) {
      message.info('该 commandType 已存在')
      return
    }
    setPolicyDraft((prev) => ({
      ...prev,
      commandTypeDefaults: {
        ...prev.commandTypeDefaults,
        [key]: policy,
      },
    }))
    setNewCommandType('')
    setNewCommandTypePolicy('silent')
  }

  const restoreRecommendedDefaults = () => {
    setPolicyDraft(RECOMMENDED_POLICY_DEFAULTS)
    message.success('已恢复推荐默认表，请继续保存生效')
  }

  const addTemplateRow = () => {
    const template = POLICY_TEMPLATES.find((item) => item.commandType === selectedTemplate)
    if (!template) {
      message.info('请先选择模板')
      return
    }
    addPolicyRow(template.commandType, template.policy)
    setSelectedTemplate(undefined)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            系统配置
          </Title>
          <Text type="secondary">数据源：`/api/v1/system/configs`（需要权限：`system:config`）</Text>
        </div>
        <Space>
          <Link href="/ops/logs">操作日志</Link>
          <Link href="/ops/telemetry-dlq">Telemetry DLQ</Link>
          <Link href="/ops/api-stats">API Stats</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchConfigs()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => void save()} loading={saving} disabled={changed.length === 0}>
            保存（{changed.length}）
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
          <div className="mt-2">
            <Text type="secondary">如果 PUT 被拒绝，请到“设置”页配置 Bearer Token。</Text>
          </div>
        </Card>
      ) : null}

      <Card>
        <Table
          rowKey="key"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 30 }}
          columns={[
            { title: 'key', dataIndex: 'key', width: 260, render: (v: string) => <span className="font-mono">{v}</span> },
            {
              title: 'value',
              dataIndex: 'value',
              render: (_: unknown, r: ConfigRow) => (
                <Input
                  value={draft[r.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [r.key]: e.target.value }))}
                />
              ),
            },
            { title: 'type', dataIndex: 'type', width: 110 },
            { title: 'description', dataIndex: 'description', width: 260 },
            { title: 'updatedAt', dataIndex: 'updatedAt', width: 180, render: (v: string) => <span className="font-mono">{v}</span> },
          ]}
        />
      </Card>

      <Card
        title="命令成功通知默认表"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchPolicy()} loading={policyLoading}>
              刷新
            </Button>
            <Button onClick={restoreRecommendedDefaults}>恢复推荐默认表</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => void savePolicy()} loading={policySaving}>
              保存默认表
            </Button>
          </Space>
        }
      >
        {policyError ? (
          <div className="mb-3">
            <Text type="danger">加载失败：{policyError}</Text>
          </div>
        ) : null}

        <div className="mb-4 flex items-center gap-3">
          <Text strong>systemDefault</Text>
          <Select
            value={policyDraft.systemDefault}
            style={{ width: 180 }}
            onChange={(value) => setPolicyDraft((prev) => ({ ...prev, systemDefault: value }))}
            options={[
              { value: 'silent', label: 'silent' },
              { value: 'always_notify', label: 'always_notify' },
            ]}
          />
          <Text type="secondary">未命中 command-type default 且未显式 override 时使用。</Text>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Input
            value={newCommandType}
            placeholder="新增 commandType，例如 custom_reboot"
            style={{ width: 280 }}
            onChange={(e) => setNewCommandType(e.target.value)}
          />
          <Select
            value={newCommandTypePolicy}
            style={{ width: 160 }}
            onChange={(value) => setNewCommandTypePolicy(value)}
            options={[
              { value: 'silent', label: 'silent' },
              { value: 'always_notify', label: 'always_notify' },
            ]}
          />
          <Button icon={<PlusOutlined />} onClick={() => addPolicyRow()}>
            新增条目
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Select
            value={selectedTemplate}
            allowClear
            placeholder="从常用模板快速新增"
            style={{ width: 320 }}
            onChange={(value) => setSelectedTemplate(value)}
            options={POLICY_TEMPLATES.map((item) => ({
              value: item.commandType,
              label: `${item.label} (${item.policy})`,
            }))}
          />
          <Button onClick={addTemplateRow}>添加模板</Button>
        </div>

        <Table
          rowKey="commandType"
          size="small"
          loading={policyLoading}
          dataSource={policyRows}
          pagination={false}
          columns={[
            {
              title: 'commandType',
              dataIndex: 'commandType',
              render: (v: string) => <span className="font-mono">{v}</span>,
            },
            {
              title: 'default policy',
              dataIndex: 'policy',
              width: 180,
              render: (_: unknown, row: PolicyRow) => (
                <Select
                  value={row.policy}
                  style={{ width: 160 }}
                  onChange={(value) =>
                    setPolicyDraft((prev) => ({
                      ...prev,
                      commandTypeDefaults: {
                        ...prev.commandTypeDefaults,
                        [row.commandType]: value,
                      },
                    }))
                  }
                  options={[
                    { value: 'silent', label: 'silent' },
                    { value: 'always_notify', label: 'always_notify' },
                  ]}
                />
              ),
            },
            {
              title: '操作',
              width: 90,
              render: (_: unknown, row: PolicyRow) => (
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    Modal.confirm({
                      title: '移除默认策略条目',
                      content: `确认移除 ${row.commandType} 吗？保存后才会正式生效。`,
                      okText: '移除',
                      okButtonProps: { danger: true },
                      cancelText: '取消',
                      onOk: () =>
                        setPolicyDraft((prev) => {
                          const next = { ...prev.commandTypeDefaults }
                          delete next[row.commandType]
                          return { ...prev, commandTypeDefaults: next }
                        }),
                    })
                  }
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="最近变更"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void fetchPolicyHistory()} loading={policyHistoryLoading}>
            刷新历史
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={policyHistoryLoading}
          dataSource={policyHistory}
          pagination={false}
          columns={[
            { title: 'createdAt', dataIndex: 'createdAt', width: 180, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'username', dataIndex: 'username', width: 120 },
            { title: 'status', dataIndex: 'status', width: 100 },
            {
              title: 'summary',
              dataIndex: 'requestData',
              render: (v: unknown) => <span className="font-mono">{summarizePolicyChange(v)}</span>,
            },
            {
              title: 'detail',
              width: 90,
              render: (_: unknown, row: OperationLogRow) => (
                <Button size="small" onClick={() => setHistoryDetail(row)}>
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="默认表变更详情"
        open={historyDetail !== null}
        width={980}
        footer={null}
        onCancel={() => setHistoryDetail(null)}
      >
        {historyDetail ? (
          <div className="space-y-4">
            {(() => {
              const previousPolicy = readPolicySnapshot(historyDetail.requestData, 'previousPolicy')
              const nextPolicy = readPolicySnapshot(historyDetail.requestData, 'nextPolicy')
              const details = diffPolicySnapshots(previousPolicy, nextPolicy)
              return (
                <>
            <div className="flex items-center gap-4">
              <Text type="secondary">时间：{historyDetail.createdAt}</Text>
              <Text type="secondary">用户：{historyDetail.username}</Text>
              <Text type="secondary">状态：{historyDetail.status}</Text>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <Text strong>摘要</Text>
                <Button
                  size="small"
                  onClick={() => {
                    void copyText(summarizePolicyChange(historyDetail.requestData))
                      .then(() => message.success('已复制差异摘要'))
                      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
                  }}
                >
                  复制差异摘要
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    void copyText(buildPolicyChangeMarkdown(historyDetail))
                      .then(() => message.success('已复制 Markdown 摘要'))
                      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
                  }}
                >
                  复制 Markdown 摘要
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    void copyText(buildPolicyChangeNotice(historyDetail))
                      .then(() => message.success('已复制变更通告模板'))
                      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
                  }}
                >
                  复制变更通告模板
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    void copyText(buildPolicyChangeExportJson(historyDetail))
                      .then(() => message.success('已复制完整 diff JSON'))
                      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
                  }}
                >
                  复制完整 diff JSON
                </Button>
              </div>
              <div className="mt-2">
                <span className="font-mono">{summarizePolicyChange(historyDetail.requestData)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Text strong>差异</Text>
              <div className="space-y-1">
                <div className="font-mono text-xs">
                  systemDefault：
                  {details?.systemDefaultChanged
                    ? `${previousPolicy?.systemDefault ?? '-'} -> ${nextPolicy?.systemDefault ?? '-'}`
                    : '无变化'}
                </div>
                <div className="font-mono text-xs">
                  新增：
                  {details && details.added.length
                    ? details.added.map((item) => `${item.commandType}=${item.policy}`).join(', ')
                    : '无'}
                </div>
                <div className="font-mono text-xs">
                  修改：
                  {details && details.changed.length
                    ? details.changed.map((item) => `${item.commandType}: ${item.before} -> ${item.after}`).join(', ')
                    : '无'}
                </div>
                <div className="font-mono text-xs">
                  移除：
                  {details && details.removed.length
                    ? details.removed.map((item) => `${item.commandType}=${item.policy}`).join(', ')
                    : '无'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card size="small" title="Before">
                <pre className="overflow-auto text-xs">
                  {renderPolicySnapshot(previousPolicy)}
                </pre>
              </Card>
              <Card size="small" title="After">
                <pre className="overflow-auto text-xs">
                  {renderPolicySnapshot(nextPolicy)}
                </pre>
              </Card>
            </div>
                </>
              )
            })()}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
