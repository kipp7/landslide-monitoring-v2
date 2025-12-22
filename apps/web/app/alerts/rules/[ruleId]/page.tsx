'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button, Card, DatePicker, Descriptions, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { listDevices, type DeviceRow } from '../../../../lib/api/devices'
import {
  getAlertRule,
  getAlertRuleVersion,
  listAlertRuleVersions,
  publishAlertRuleVersion,
  replayAlertRule,
  updateAlertRule,
  type AlertRuleVersionRow,
} from '../../../../lib/api/alertRules'

const { Title, Text } = Typography

export default function AlertRuleDetailPage() {
  const params = useParams<{ ruleId: string }>()
  const ruleId = params.ruleId

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ruleJson, setRuleJson] = useState('')
  const [currentDslJson, setCurrentDslJson] = useState('')
  const [versions, setVersions] = useState<AlertRuleVersionRow[]>([])

  const [publishOpen, setPublishOpen] = useState(false)
  const [publishDslJson, setPublishDslJson] = useState('{}')

  const [replayOpen, setReplayOpen] = useState(false)
  const [replayVersion, setReplayVersion] = useState<number>(0)
  const [replayDevices, setReplayDevices] = useState<DeviceRow[]>([])
  const [replayDeviceIds, setReplayDeviceIds] = useState<string[]>([])
  const [replayRange, setReplayRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 60 * 60 * 1000)
    return [start, end]
  })
  const [replayResult, setReplayResult] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const [ruleResp, versionsResp] = await Promise.all([getAlertRule(ruleId), listAlertRuleVersions(ruleId)])
      setRuleJson(JSON.stringify(ruleResp.data.rule, null, 2))
      setCurrentDslJson(JSON.stringify(ruleResp.data.currentVersion?.dsl ?? {}, null, 2))
      setVersions(versionsResp.data.list ?? [])
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
      setRuleJson('')
      setCurrentDslJson('')
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [ruleId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  useEffect(() => {
    const load = async () => {
      try {
        const json = await listDevices({ page: 1, pageSize: 200 })
        setReplayDevices(json.data?.list ?? [])
      } catch {
        setReplayDevices([])
      }
    }
    void load()
  }, [])

  const deviceOptions = useMemo(
    () => replayDevices.map((d) => ({ value: d.deviceId, label: `${d.deviceName ?? d.deviceId} (${d.deviceId})` })),
    [replayDevices]
  )

  const currentActive = useMemo(() => {
    try {
      const parsed = JSON.parse(ruleJson) as { isActive?: boolean }
      return Boolean(parsed.isActive)
    } catch {
      return false
    }
  }, [ruleJson])

  const toggleActive = async (next: boolean) => {
    setSaving(true)
    try {
      await updateAlertRule(ruleId, { isActive: next })
      message.success('Updated')
      await fetchAll()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const doPublish = async () => {
    let dsl: Record<string, unknown>
    try {
      dsl = JSON.parse(publishDslJson) as Record<string, unknown>
    } catch {
      message.error('Invalid JSON')
      return
    }

    setSaving(true)
    try {
      await publishAlertRuleVersion(ruleId, dsl)
      message.success('Published')
      setPublishOpen(false)
      await fetchAll()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const openReplay = async (version: number) => {
    setReplayVersion(version)
    setReplayResult('')
    setReplayDeviceIds([])

    try {
      const v = await getAlertRuleVersion(ruleId, version)
      const dsl = v.data.dsl
      const scope = (dsl as { scope?: unknown }).scope as unknown
      if (scope && typeof scope === 'object' && (scope as { type?: unknown }).type === 'device') {
        const id = (scope as { deviceId?: unknown }).deviceId
        if (typeof id === 'string' && id.trim()) setReplayDeviceIds([id.trim()])
      }
    } catch {
      // ignore
    }

    setReplayOpen(true)
  }

  const doReplay = async () => {
    setSaving(true)
    try {
      const json = await replayAlertRule(ruleId, replayVersion, {
        startTime: replayRange[0].toISOString(),
        endTime: replayRange[1].toISOString(),
        deviceIds: replayDeviceIds.length > 0 ? replayDeviceIds : undefined,
      })
      setReplayResult(JSON.stringify(json.data, null, 2))
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
      setReplayResult('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Alert Rule
          </Title>
          <Text type="secondary">
            <Link href="/alerts/rules">Back to list</Link>
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()} loading={loading}>
            Refresh
          </Button>
          <Button loading={saving} onClick={() => void toggleActive(!currentActive)}>
            {currentActive ? 'Disable' : 'Enable'}
          </Button>
          <Button type="primary" onClick={() => setPublishOpen(true)}>
            Publish version
          </Button>
        </Space>
      </div>

      <Card loading={loading}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="ruleId">
            <span className="font-mono">{ruleId}</span>
          </Descriptions.Item>
          <Descriptions.Item label="isActive">
            {currentActive ? <Tag color="green">true</Tag> : <Tag>false</Tag>}
          </Descriptions.Item>
        </Descriptions>

        <div className="grid grid-cols-1 gap-4 mt-4">
          <div>
            <Text strong>rule</Text>
            <Input.TextArea value={ruleJson} readOnly className="font-mono" autoSize={{ minRows: 6, maxRows: 16 }} />
          </div>
          <div>
            <Text strong>current dsl</Text>
            <Input.TextArea value={currentDslJson} readOnly className="font-mono" autoSize={{ minRows: 10, maxRows: 20 }} />
          </div>
        </div>
      </Card>

      <Card title="versions">
        <Table
          rowKey={(r) => String(r.version)}
          dataSource={versions}
          pagination={false}
          columns={[
            { title: 'version', dataIndex: 'version', render: (v: number) => <span className="font-mono">v{v}</span> },
            { title: 'createdAt', dataIndex: 'createdAt', render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'createdBy', dataIndex: 'createdBy', render: (v: string) => <span className="font-mono">{v || '-'}</span> },
            {
              title: 'actions',
              render: (_: unknown, r: AlertRuleVersionRow) => (
                <Space>
                  <Button size="small" onClick={() => void openReplay(r.version)}>
                    Replay
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Publish new version"
        open={publishOpen}
        onCancel={() => setPublishOpen(false)}
        onOk={() => void doPublish()}
        okText="Publish"
        cancelText="Cancel"
        confirmLoading={saving}
        width={900}
      >
        <Text type="secondary">Paste DSL JSON only (body is an object with key `dsl`).</Text>
        <Input.TextArea
          className="font-mono mt-3"
          value={publishDslJson}
          onChange={(e) => setPublishDslJson(e.target.value)}
          autoSize={{ minRows: 14, maxRows: 26 }}
        />
      </Modal>

      <Modal
        title={`Replay (v${replayVersion})`}
        open={replayOpen}
        onCancel={() => setReplayOpen(false)}
        onOk={() => void doReplay()}
        okText="Run"
        cancelText="Close"
        confirmLoading={saving}
        width={980}
      >
        <Space wrap>
          <span>Range</span>
          <DatePicker.RangePicker
            showTime
            value={[dayjs(replayRange[0]), dayjs(replayRange[1])]}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) return
              setReplayRange([value[0].toDate(), value[1].toDate()])
            }}
          />
        </Space>

        <div className="mt-3">
          <Text>deviceIds (optional, one per line)</Text>
          <Input.TextArea
            value={replayDeviceIds.join('\n')}
            onChange={(e) => setReplayDeviceIds(e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))}
            autoSize={{ minRows: 3, maxRows: 8 }}
            className="font-mono"
          />

          <div className="mt-2">
            <Text type="secondary">Optional: pick from device list</Text>
            <div className="mt-2">
              <select
                multiple
                style={{ width: '100%', height: 140 }}
                value={replayDeviceIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
                  setReplayDeviceIds(selected)
                }}
              >
                {deviceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Text strong>result</Text>
          <Input.TextArea value={replayResult} readOnly className="font-mono mt-2" autoSize={{ minRows: 10, maxRows: 22 }} />
        </div>
      </Modal>
    </div>
  )
}

