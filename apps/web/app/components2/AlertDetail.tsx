// AlertDetail.tsx
import React from 'react';
import { AlertData } from '../components2/types'; // 根据实际路径调整
import InfoItem from './InfoItem'; // 假设 InfoItem 是另一个组件

const AlertDetail = ({ data }: { data: AlertData }) => (
  <div className="bg-white rounded-xl shadow-lg overflow-hidden p-6">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold">异常详情</h2>
      <span
        className={`text-sm px-2 py-1 rounded ${
          data.level === 'critical'
            ? 'bg-red-500 text-white'
            : data.level === 'warning'
            ? 'bg-yellow-500 text-gray-800'
            : 'bg-blue-500 text-white'
        }`}
      >
        {data.level === 'critical'
          ? '严重'
          : data.level === 'warning'
          ? '警告'
          : '注意'}
      </span>
    </div>

    <div className="space-y-4">
      <InfoItem label="时间" value={data.time} />
      <InfoItem
        label="类型"
        value={data.type === 'sensor' ? '传感器异常' : '监测点异常'}
      />
      <InfoItem label="消息" value={data.message} />
      <InfoItem label="状态" value={data.resolved ? '已解决' : '未解决'} />
      <InfoItem label="相关ID" value={data.relatedId} />
    </div>
  </div>
);

export default AlertDetail;