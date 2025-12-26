'use client'

import { Table, Tag, Tooltip } from 'antd'
import useDeviceMappings from '../analysis/legacy/hooks/useDeviceMappings'

export default function DeviceMappingTable() {
  const { mappings, loading, error } = useDeviceMappings()

  if (error) {
    return <div className="text-red-500">鍔犺浇璁惧鏄犲皠澶辫触: {error.message}</div>
  }

  const columns = [
    {
      title: '绠€娲両D',
      dataIndex: 'simple_id',
      key: 'simple_id',
      width: 100,
      render: (text: string) => <span className="font-mono font-bold text-blue-600">{text}</span>,
    },
    {
      title: '璁惧鍚嶇О',
      dataIndex: 'device_name',
      key: 'device_name',
      width: 150,
      render: (text: string) => <span className="font-medium text-green-600">{text}</span>,
    },
    {
      title: '瀹為檯璁惧ID',
      dataIndex: 'actual_device_id',
      key: 'actual_device_id',
      width: 200,
      render: (text: string) => (
        <Tooltip title={text}>
          <span className="font-mono text-xs text-gray-600">{text.length > 20 ? `${text.slice(0, 20)}...` : text}</span>
        </Tooltip>
      ),
    },
    {
      title: '浣嶇疆',
      dataIndex: 'location_name',
      key: 'location_name',
      width: 150,
      render: (text: string) => <span className="text-purple-600">{text}</span>,
    },
    {
      title: '璁惧绫诲瀷',
      dataIndex: 'device_type',
      key: 'device_type',
      width: 100,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          rk2206: 'blue',
          sensor: 'green',
          gateway: 'orange',
        }
        return <Tag color={colorMap[type] || 'default'}>{type === 'rk2206' ? '鐩戞祴绔?' : type === 'sensor' ? '浼犳劅鍣?' : type}</Tag>
      },
    },
    {
      title: '鍧愭爣',
      key: 'coordinates',
      width: 120,
      render: (record: any) => (
        <span className="text-xs text-gray-500">
          {record.latitude != null && record.longitude != null ? `${Number(record.latitude).toFixed(3)}, ${Number(record.longitude).toFixed(3)}` : '鏈煡'}
        </span>
      ),
    },
    {
      title: '鐘舵€?',
      dataIndex: 'online_status',
      key: 'online_status',
      width: 80,
      render: (status: string) => {
        const statusConfig = {
          online: { color: 'green', text: '鍦ㄧ嚎' },
          offline: { color: 'red', text: '绂荤嚎' },
          maintenance: { color: 'orange', text: '缁存姢' },
        }
        const config =
          statusConfig[status as keyof typeof statusConfig] || ({ color: 'default', text: status } as const)
        return <Tag color={config.color}>{config.text}</Tag>
      },
    },
    {
      title: '鏈€鍚庢暟鎹椂闂?',
      dataIndex: 'last_data_time',
      key: 'last_data_time',
      width: 150,
      render: (time: string) => (
        <span className="text-xs text-gray-500">{time ? new Date(time).toLocaleString('zh-CN') : '鏃犳暟鎹?'}</span>
      ),
    },
  ]

  return (
    <div className="rounded-lg bg-white shadow-sm">
      <div className="border-b p-4">
        <h3 className="text-lg font-semibold text-gray-800">璁惧鏄犲皠绠＄悊</h3>
        <p className="mt-1 text-sm text-gray-600">绠＄悊绠€娲佽澶嘔D涓庡疄闄呰澶嘔D鐨勬槧灏勫叧绯?</p>
      </div>

      <div className="p-4">
        <Table
          dataSource={mappings}
          columns={columns}
          loading={loading}
          rowKey="simple_id"
          size="small"
          scroll={{ x: 1000 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `绗?${range[0]}-${range[1]} 鏉★紝鍏?${total} 鏉¤澶嘸`,
          }}
        />
      </div>

      <div className="border-t bg-gray-50 p-4">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{mappings.length}</div>
            <div className="text-sm text-gray-600">鎬昏澶囨暟</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{mappings.filter((d) => d.online_status === 'online').length}</div>
            <div className="text-sm text-gray-600">鍦ㄧ嚎璁惧</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{mappings.filter((d) => d.online_status === 'offline').length}</div>
            <div className="text-sm text-gray-600">绂荤嚎璁惧</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">{mappings.filter((d) => d.online_status === 'maintenance').length}</div>
            <div className="text-sm text-gray-600">缁存姢璁惧</div>
          </div>
        </div>
      </div>
    </div>
  )
}

