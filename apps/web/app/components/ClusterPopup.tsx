'use client'

import { useEffect, useState } from 'react'

export default function ClusterPopup({
  points,
  onClose,
}: {
  points: any[]
  onClose: () => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!points || points.length === 0) return
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % points.length)
    }, 2500)
    return () => clearInterval(timer)
  }, [points?.length])

  if (!points || points.length === 0) return null

  return (
    <div className="absolute top-2 right-2 z-50 w-80 space-y-3 rounded-xl border border-cyan-400 bg-[#001529ee] p-4 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold text-cyan-300">聚合点详情</h3>
        <button className="text-sm text-cyan-400 hover:text-red-500" onClick={onClose}>
          关闭
        </button>
      </div>
      {points.map((p, index) => (
        <div
          key={p.get('name')}
          className={`rounded border p-3 transition-all ${index === activeIndex ? 'border-cyan-400 bg-cyan-900' : 'border-[#0cf]'}`}
        >
          <div className="font-bold text-cyan-300">{p.get('name')}</div>
          <div className="text-sm text-white">
            温度：{p.get('temp')}°C 湿度：{p.get('hum')}%
          </div>
          <div
            className="text-sm"
            style={{
              color: p.get('risk') > 0.7 ? '#ff4d4f' : p.get('risk') > 0.4 ? '#ffb800' : '#00ffff',
            }}
          >
            滑坡概率：{(p.get('risk') * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  )
}

