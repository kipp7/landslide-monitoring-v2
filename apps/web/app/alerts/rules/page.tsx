'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { listDevices, type DeviceRow } from '../../../lib/api/devices'
import { listStations, type StationRow as StationInfo } from '../../../lib/api/stations'
import {
  createAlertRule,
  listAlertRules,
  updateAlertRule,
  type AlertRuleRow,
  type AlertRuleScope,
} from '../../../lib/api/alertRules'

const { Title, Text } = Typography

type FilterScope = 'all' | 'device' | 'station' | 'global'

function scopeTag(scope: AlertRuleRow['scope']) {
  const color = scope === 'global' ? 'blue' : scope === 'station' ? 'purple' : 'geekblue'
  return <Tag color={color}>{scope}</Tag>
}

export default function AlertRulesPage() {
  const [rows, setRows] = useState<AlertRuleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [scope, setScope] = useState<FilterScope>('all')
  const [isActive, setIsActive] = useState<'all' | 'true' | 'false'>('all')
  const [deviceId, setDeviceId] = useState<string>('')
  const [stationId, setStationId] = useState<string>('')

  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [stations, setStations] = useState<StationInfo[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchOptions = useCallback(async () => {
    try {
      const [devJson, stJson] = await Promise.all([listDevices({ page: 1, pageSize: 200 }), listStations(1, 200)])
      setDevices(devJson.data?.list ?? [])
      setStations(stJson.data?.list ?? [])
    } catch {
      setDevices([])
      setStations([])
    }
  }, [])

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listAlertRules({
        isActive: isActive === 'all' ? undefined : isActive === 'true',
        scope: scope === 'all' ? undefined : scope,
        deviceId: deviceId.trim() ? deviceId.trim() : undefined,
        stationId: stationId.trim() ? stationId.trim() : undefined,
      })
      setRows(json.data?.list ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [deviceId, isActive, scope, stationId])

  useEffect(() => {
    void fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    void fetchRules()
  }, [fetchRules])

  const deviceOptions = useMemo(
    () => devices.map((d) => ({ value: d.deviceId, label: `${d.deviceName ?? d.deviceId} (${d.deviceId})` })),
    [devices]
  )

  const stationOptions = useMemo(
    () => stations.map((s) => ({ value: s.stationId, label: `${s.stationName} (${s.stationCode})` })),
    [stations]
  )

  const toggleActive = async (ruleId: string, next: boolean) => {
    setSaving(true)
    try {
      await updateAlertRule(ruleId, { isActive: next })
      message.success('Updated')
      await fetchRules()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      scopeType: 'device',
      isActive: true,
      dslJson: JSON.stringify(
        {
          dslVersion: 1,
          enabled: true,
          severity: 'medium',
          scope: { type: 'device', deviceId: '' },
          when: { op: 'AND', items: [] },
          window: { type: 'duration', minutes: 10, minPoints: 6 },
          actions: [{ type: 'emit_alert', titleTemplate: 'Alert', messageTemplate: '' }],
        },
        null,
        2
      ),
    })
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const values = (await form.validateFields()) as {
      ruleName: string
      description?: string
      scopeType: 'device' | 'station' | 'global'
      deviceId?: string
      stationId?: string
      isActive: boolean
      dslJson: string
    }

    let dsl: Record<string, unknown>
    try {
      dsl = JSON.parse(values.dslJson) as Record<string, unknown>
    } catch {
      message.error('Invalid DSL JSON')
      return
    }

    const ruleScope: AlertRuleScope =
      values.scopeType === 'device'
        ? { type: 'device', deviceId: values.deviceId ?? '' }
        : values.scopeType === 'station'
          ? { type: 'station', stationId: values.stationId ?? '' }
          : { type: 'global' }

    setSaving(true)
    try {
      await createAlertRule({
        rule: {
          ruleName: values.ruleName,
          description: values.description?.trim() ? values.description.trim() : undefined,
          scope: ruleScope,
          isActive: values.isActive,
        },
        dsl,
      })
      message.success('Created')
      setCreateOpen(false)
      await fetchRules()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Alert Rules
          </Title>
          <Text type="secondary">API: `/api/v1/alert-rules`</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchRules()} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Create
          </Button>
        </Space>
      </div>

      <Card>
        <Space wrap>
          <span>scope</span>
          <Select
            style={{ width: 160 }}
            value={scope}
            onChange={(v) => {
              setScope(v)
              setDeviceId('')
              setStationId('')
            }}
            options={[
              { value: 'all', label: 'all' },
              { value: 'device', label: 'device' },
              { value: 'station', label: 'station' },
              { value: 'global', label: 'global' },
            ]}
          />
          <span>active</span>
          <Select
            style={{ width: 160 }}
            value={isActive}
            onChange={(v) => setIsActive(v)}
            options={[
              { value: 'all', label: 'all' },
              { value: 'true', label: 'true' },
              { value: 'false', label: 'false' },
            ]}
          />

          {scope === 'device' ? (
            <>
              <span>device</span>
              <Select
                showSearch
                style={{ width: 420 }}
                value={deviceId || undefined}
                onChange={(v) => setDeviceId(v)}
                placeholder="Select device"
                options={deviceOptions}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </>
          ) : null}

          {scope === 'station' ? (
            <>
              <span>station</span>
              <Select
                showSearch
                style={{ width: 420 }}
                value={stationId || undefined}
                onChange={(v) => setStationId(v)}
                placeholder="Select station"
                options={stationOptions}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </>
          ) : null}
        </Space>
      </Card>

      <Card>
        {error ? (
          <Text type="danger">Failed: {error}</Text>
        ) : (
          <Table
            rowKey="ruleId"
            loading={loading}
            dataSource={rows}
            pagination={false}
            columns={[
              {
                title: 'rule',
                render: (_: unknown, r: AlertRuleRow) => (
                  <div className="space-y-1">
                    <div>
                      <Link href={`/alerts/rules/${r.ruleId}`} className="font-mono">
                        {r.ruleId}
                      </Link>
                    </div>
                    <div>{r.ruleName}</div>
                  </div>
                ),
              },
              { title: 'scope', render: (_: unknown, r: AlertRuleRow) => scopeTag(r.scope) },
              {
                title: 'target',
                render: (_: unknown, r: AlertRuleRow) => (
                  <span className="font-mono">{r.scope === 'device' ? r.deviceId : r.scope === 'station' ? r.stationId : '-'}</span>
                ),
              },
              { title: 'active', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">true</Tag> : <Tag>false</Tag>) },
              { title: 'current', dataIndex: 'currentVersion', render: (v: number) => <span className="font-mono">v{v}</span> },
              { title: 'updatedAt', dataIndex: 'updatedAt', render: (v: string) => <span className="font-mono">{v}</span> },
              {
                title: 'actions',
                render: (_: unknown, r: AlertRuleRow) => (
                  <Space>
                    <Button size="small">
                      <Link href={`/alerts/rules/${r.ruleId}`}>Details</Link>
                    </Button>
                    <Button size="small" loading={saving} onClick={() => void toggleActive(r.ruleId, !r.isActive)}>
                      {r.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title="Create rule"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="Create"
        cancelText="Cancel"
        confirmLoading={saving}
        onOk={() => void submitCreate()}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ruleName" label="ruleName" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. displacement anomaly" />
          </Form.Item>
          <Form.Item name="description" label="description">
            <Input placeholder="optional" />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="scopeType" label="scope" rules={[{ required: true }]} style={{ minWidth: 200 }}>
              <Select
                options={[
                  { value: 'device', label: 'device' },
                  { value: 'station', label: 'station' },
                  { value: 'global', label: 'global' },
                ]}
                onChange={() => {
                  form.setFieldsValue({ deviceId: undefined, stationId: undefined })
                }}
              />
            </Form.Item>

            <Form.Item shouldUpdate noStyle>
              {() => {
                const st = form.getFieldValue('scopeType') as 'device' | 'station' | 'global'
                if (st === 'device') {
                  return (
                    <Form.Item name="deviceId" label="deviceId" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 480 }}>
                      <Select showSearch options={deviceOptions} placeholder="Select device" />
                    </Form.Item>
                  )
                }
                if (st === 'station') {
                  return (
                    <Form.Item name="stationId" label="stationId" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 480 }}>
                      <Select showSearch options={stationOptions} placeholder="Select station" />
                    </Form.Item>
                  )
                }
                return null
              }}
            </Form.Item>
          </Space>

          <Form.Item name="isActive" valuePropName="checked">
            <Checkbox>isActive</Checkbox>
          </Form.Item>

          <Form.Item name="dslJson" label="dsl (JSON)" rules={[{ required: true, message: 'Required' }]}>
            <Input.TextArea className="font-mono" autoSize={{ minRows: 10, maxRows: 22 }} />
          </Form.Item>

          <Text type="secondary">Note: server validates `dsl.scope` matches rule.scope.</Text>
        </Form>
      </Modal>
    </div>
  )
}

