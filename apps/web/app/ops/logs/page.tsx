'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, DatePicker, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { apiGetJson, type ApiSuccessResponse } from '../../../lib/v2Api'

const { Title, Text } = Typography

type OperationLogRow = {
  id: string
  userId: string | null
  username: string
  module: string
  action: string
  targetType: string
  targetId: string
  description: string
  requestData: unknown
  responseData: unknown
  ipAddress: string
  userAgent: string
  status: string
  errorMessage: string
  createdAt: string
}

type OperationLogsResponse = {
  page: number
  pageSize: number
  total: number
  list: OperationLogRow[]
}

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

export default function OpsLogsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<OperationLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [userId, setUserId] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [range, setRange] = useState<[Date, Date]>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    return [start, end]
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (userId.trim()) params.set('userId', userId.trim())
    if (module.trim()) params.set('module', module.trim())
    if (action.trim()) params.set('action', action.trim())
    params.set('startTime', range[0].toISOString())
    params.set('endTime', range[1].toISOString())
    return params.toString()
  }, [action, module, page, pageSize, range, userId])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await apiGetJson<ApiSuccessResponse<OperationLogsResponse>>(`/api/v1/system/logs/operation?${queryString}`)
      setRows(json.data?.list ?? [])
      setTotal(json.data?.total ?? 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const viewLog = (row: OperationLogRow) => {
    Modal.info({
      title: `operation log: ${row.id}`,
      width: 900,
      content: (
        <div className="space-y-2">
          <div>
            <Text type="secondary">createdAt</Text>
            <div className="font-mono">{row.createdAt}</div>
          </div>
          <div>
            <Text type="secondary">module/action</Text>
            <div className="font-mono">
              {row.module} / {row.action}
            </div>
          </div>
          <div>
            <Text type="secondary">status</Text>
            <div>{row.status}</div>
          </div>
          <div>
            <Text type="secondary">requestData</Text>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{stringify(row.requestData)}</pre>
          </div>
          <div>
            <Text type="secondary">responseData</Text>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{stringify(row.responseData)}</pre>
          </div>
        </div>
      ),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            操作日志
          </Title>
          <Text type="secondary">数据源：`/api/v1/system/logs/operation`（需要权限：`system:log`）</Text>
        </div>
        <Space>
          <Link href="/ops/configs">系统配置</Link>
          <Link href="/ops/api-stats">API Stats</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchLogs()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
          <div className="mt-2">
            <Text type="secondary">如果被拒绝访问，请到“设置”页配置 Bearer Token。</Text>
          </div>
        </Card>
      ) : null}

      <Card>
        <Space wrap>
          <Input
            style={{ width: 240 }}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setPage(1)
            }}
            placeholder="userId（可选）"
            allowClear
          />
          <Input
            style={{ width: 200 }}
            value={module}
            onChange={(e) => {
              setModule(e.target.value)
              setPage(1)
            }}
            placeholder="module（可选）"
            allowClear
          />
          <Input
            style={{ width: 200 }}
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            placeholder="action（可选）"
            allowClear
          />
          <DatePicker.RangePicker
            showTime
            value={[dayjs(range[0]), dayjs(range[1])]}
            onChange={(value) => {
              if (!value || value.length !== 2 || !value[0] || !value[1]) return
              setRange([value[0].toDate(), value[1].toDate()])
              setPage(1)
            }}
          />
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={rows}
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
          columns={[
            { title: 'createdAt', dataIndex: 'createdAt', width: 190, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'username', dataIndex: 'username', width: 120, render: (v: string) => v || '-' },
            { title: 'module', dataIndex: 'module', width: 120 },
            { title: 'action', dataIndex: 'action', width: 150 },
            {
              title: 'status',
              dataIndex: 'status',
              width: 100,
              render: (v: string) => <Tag color={v === 'success' ? 'green' : 'red'}>{v}</Tag>,
            },
            { title: 'description', dataIndex: 'description', render: (v: string) => v || '-' },
            { title: 'detail', width: 90, render: (_: unknown, r: OperationLogRow) => <Button size="small" onClick={() => viewLog(r)}>查看</Button> },
          ]}
        />
      </Card>
    </div>
  )
}
