'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import Link from 'next/link'
import {
  createStation,
  deleteStation as deleteStationApi,
  getStationDetail,
  listStations,
  updateStation,
  type StationRow,
} from '../../lib/api/stations'

const { Title, Text } = Typography

function statusTag(status: StationRow['status']) {
  const color = status === 'active' ? 'green' : status === 'maintenance' ? 'orange' : 'red'
  return <Tag color={color}>{status}</Tag>
}

export default function StationsPage() {
  const [rows, setRows] = useState<StationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editStationId, setEditStationId] = useState<string>('')
  const [form] = Form.useForm()

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listStations(1, 200)
      setRows(json.data?.list ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  const openCreate = () => {
    form.resetFields()
    setCreateOpen(true)
  }

  const openEdit = async (stationId: string) => {
    setEditStationId(stationId)
    setSaving(true)
    try {
      const json = await getStationDetail(stationId)
      const station = json.data
      form.setFieldsValue({
        stationCode: station.stationCode,
        stationName: station.stationName,
        status: station.status,
        latitude: station.latitude ?? '',
        longitude: station.longitude ?? '',
        metadataJson: station.metadata ? JSON.stringify(station.metadata, null, 2) : '{}',
      })
      setEditOpen(true)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const submitCreate = async () => {
    const values = (await form.validateFields()) as {
      stationCode: string
      stationName: string
      latitude?: string
      longitude?: string
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

    setSaving(true)
    try {
      await createStation({
        stationCode: values.stationCode,
        stationName: values.stationName,
        latitude: values.latitude && values.latitude.trim() ? Number(values.latitude) : undefined,
        longitude: values.longitude && values.longitude.trim() ? Number(values.longitude) : undefined,
        metadata: metadata ?? {},
      })
      message.success('站点已创建')
      setCreateOpen(false)
      await fetchStations()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = async () => {
    if (!editStationId) return
    const values = (await form.validateFields()) as {
      stationName?: string
      status?: StationRow['status']
      latitude?: string
      longitude?: string
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

    setSaving(true)
    try {
      await updateStation(editStationId, {
        stationName: values.stationName,
        status: values.status,
        latitude: values.latitude && values.latitude.trim() ? Number(values.latitude) : null,
        longitude: values.longitude && values.longitude.trim() ? Number(values.longitude) : null,
        metadata: metadata ?? {},
      })
      message.success('站点已更新')
      setEditOpen(false)
      await fetchStations()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const deleteStation = (stationId: string) => {
    Modal.confirm({
      title: '删除站点',
      content: '确认删除该站点？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteStationApi(stationId)
        message.success('站点已删除')
        await fetchStations()
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            站点
          </Title>
          <Text type="secondary">数据源：v2 API（/api/v1/stations）</Text>
        </div>
        <Space>
          <Button type="primary" onClick={openCreate}>
            新建
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchStations()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        {error ? <Text type="danger">加载失败：{error}</Text> : null}
        <Table
          rowKey="stationId"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          size="small"
          columns={[
            { title: 'Code', dataIndex: 'stationCode' },
            { title: 'Name', dataIndex: 'stationName' },
            { title: 'Status', dataIndex: 'status', render: (v: StationRow['status']) => statusTag(v) },
            {
              title: 'Location',
              render: (_: unknown, r: StationRow) =>
                r.latitude && r.longitude ? `${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}` : '-',
            },
            { title: 'Updated', dataIndex: 'updatedAt', render: (v: string) => <span className="font-mono">{v}</span> },
            {
              title: 'Actions',
              render: (_: unknown, r: StationRow) => (
                <Space>
                  <Link href={`/stations/${encodeURIComponent(r.stationId)}`}>详情</Link>
                  <Button size="small" onClick={() => void openEdit(r.stationId)}>
                    编辑
                  </Button>
                  <Button danger size="small" onClick={() => deleteStation(r.stationId)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建站点"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okText="创建"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" initialValues={{ metadataJson: '{}' }}>
          <Form.Item name="stationCode" label="stationCode" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stationName" label="stationName" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="latitude" label="latitude（可选）">
            <Input placeholder="例如 30.123456" />
          </Form.Item>
          <Form.Item name="longitude" label="longitude（可选）">
            <Input placeholder="例如 120.123456" />
          </Form.Item>
          <Form.Item name="metadataJson" label="metadata JSON（可选）">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑站点"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => void submitEdit()}
        okText="保存"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="stationCode" label="stationCode">
            <Input disabled />
          </Form.Item>
          <Form.Item name="stationName" label="stationName">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="status">
            <Select
              options={[
                { value: 'active', label: 'active' },
                { value: 'inactive', label: 'inactive' },
                { value: 'maintenance', label: 'maintenance' },
              ]}
            />
          </Form.Item>
          <Form.Item name="latitude" label="latitude（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="longitude" label="longitude（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="metadataJson" label="metadata JSON（可选）">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
