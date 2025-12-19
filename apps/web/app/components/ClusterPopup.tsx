'use client';
import React, { useEffect, useState } from 'react';

export default function ClusterPopup({
  points,
  onClose,
}: {
  points: any[];
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % points.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [points.length]);

  return (
    <div className="absolute top-2 right-2 z-50 w-80 bg-[#001529ee] border border-cyan-400 rounded-xl p-4 space-y-3 shadow-xl">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-cyan-300 text-lg font-bold">聚合点详情</h3>
        <button
          className="text-cyan-400 hover:text-red-500 text-sm"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      {points.map((p, index) => (
        <div
          key={p.get('name')}
          className={`p-3 rounded border ${
            index === activeIndex
              ? 'bg-cyan-900 border-cyan-400'
              : 'border-[#0cf]'
          } transition-all`}
        >
          <div className="text-cyan-300 font-bold">{p.get('name')}</div>
          <div className="text-white text-sm">
            温度：{p.get('temp')}°C 湿度：{p.get('hum')}%
          </div>
          <div
            className="text-sm"
            style={{
              color:
                p.get('risk') > 0.7
                  ? '#ff4d4f'
                  : p.get('risk') > 0.4
                  ? '#ffb800'
                  : '#00ffff',
            }}
          >
            滑坡概率：{(p.get('risk') * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}
