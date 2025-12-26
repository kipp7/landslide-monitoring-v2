// 定义 TimelineItem 组件
import React from 'react';

const TimelineItem = ({ date, action, status, by }: { date: string; action: string; status: string; by: string }) => {
  return (
    <div className="flex items-center space-x-4">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
        {status[0].toUpperCase()}
      </div>
      <div>
        <p className="text-sm font-medium">{action}</p>
        <p className="text-xs text-gray-500">{date} - {by}</p>
      </div>
    </div>
  );
};

export default TimelineItem;