import React from 'react';

const BatteryIndicator = ({ level }: { level: number }) => {
  const color = level > 80 ? 'bg-green-500' : level > 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center">
      <div className={`w-10 h-4 rounded-full ${color} mr-2`} />
      <span className="text-sm">{`${level}%`}</span>
    </div>
  );
};

export default BatteryIndicator; // 默认导出