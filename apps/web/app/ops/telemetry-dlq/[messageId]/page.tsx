'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button, Card, Descriptions, Space, Tag, Typography, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getTelemetryDlqMessage, type TelemetryDlqMessageDetail } from '../../../../lib/api/telemetryDlq'

const { Title, Text } = Typography

export default function TelemetryDlqDetailPage() {
  const params = useParams<{ messageId: string }>()
  const messageId = String(params.messageId ?? '')

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TelemetryDlqMessageDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchOne = useCallback(async () => {
    if (!messageId) return
    try {
      setLoading(true)
      setError(null)
      const json = await getTelemetryDlqMessage(messageId)
      setData(json.data ?? null)
    } catch (caught) {
      setData(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [messageId])

  useEffect(() => {
    void fetchOne()
  }, [fetchOne])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            DLQ 详情
          </Title>
          <Text type="secondary">`/api/v1/telemetry/dlq/{messageId}`</Text>
        </div>
        <Space>
          <Link href="/ops/telemetry-dlq">返回列表</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchOne()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
        </Card>
      ) : null}

      {!data ? (
        <Card>
          <Text type="secondary">暂无数据</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="messageId">
                <span className="font-mono">{data.messageId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="deviceId">
                <span className="font-mono">{data.deviceId || '-'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="reasonCode">
                <Tag>{data.reasonCode}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="receivedAt">
                <span className="font-mono">{data.receivedAt}</span>
              </Descriptions.Item>
              <Descriptions.Item label="createdAt">
                <span className="font-mono">{data.createdAt}</span>
              </Descriptions.Item>
              <Descriptions.Item label="kafka">
                <span className="font-mono">
                  {data.kafka.topic} #{data.kafka.partition} @{data.kafka.offset} {data.kafka.key ? `key=${data.kafka.key}` : ''}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="reasonDetail" span={2}>
                {data.reasonDetail || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="rawPayload"
            size="small"
            extra={
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.rawPayload)
                    message.success('已复制')
                  } catch {
                    message.error('复制失败')
                  }
                }}
              >
                复制
              </Button>
            }
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-xs">{data.rawPayload}</pre>
          </Card>
        </>
      )}
    </div>
  )
}

