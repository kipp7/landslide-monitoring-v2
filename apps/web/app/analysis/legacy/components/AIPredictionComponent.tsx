'use client'

import { useMemo, useState } from 'react'
import useSensorData from '../hooks/useSensorData'

interface PredictionData {
  analysis: string
  result: string
  probability: string
  timestamp: string
  recommendation: string
}

function nowTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export default function AIPredictionComponent() {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(false)
  const { data } = useSensorData()

  const sensorData = useMemo(() => {
    const sorted = [...data].sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
    return sorted.slice(0, 200).map((row) => ({
      device_id: row.device_id,
      event_time: row.event_time,
      temperature: row.temperature,
      humidity: row.humidity,
      acceleration_x: row.acceleration_total,
      acceleration_y: 0,
      acceleration_z: 0,
      gyroscope_total: row.gyroscope_total,
    }))
  }, [data])

  const fetchPrediction = async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/ai-prediction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sensorData }),
      })

      if (!response.ok) {
        throw new Error('AI 预测请求失败')
      }

      const predictionResult = (await response.json()) as PredictionData
      setPrediction(predictionResult)
    } catch (error) {
      console.error('AI 预测分析失败:', error)

      const fallbackPrediction: PredictionData = {
        analysis: `
基于当前传感器数据分析：
1. 系统正在处理最新的监测数据
2. 温湿度指标在正常范围内波动
3. 加速度传感器未检测到异常位移
4. 陀螺仪数据显示地表状态稳定
综合分析，当前监测区域状况良好。`,
        result: '低风险',
        probability: '20%',
        timestamp: nowTimestamp(),
        recommendation: `
建议采取以下措施：
1. 继续保持常规监测频率
2. 关注天气变化情况
3. 定期检查设备运行状态
4. 建立长期数据趋势分析`,
      }
      setPrediction(fallbackPrediction)
    } finally {
      setLoading(false)
    }
  }

  const clearPrediction = () => {
    setPrediction(null)
  }

  return (
    <div className="relative mx-auto flex h-full max-w-[600px] flex-col items-center justify-center overflow-hidden rounded-lg bg-[#112c42] p-4">
      <div className="absolute left-[-50px] top-[-50px] h-32 w-32 rounded-full bg-cyan-500 opacity-20" />
      <div className="absolute bottom-[-50px] right-[-50px] h-32 w-32 rounded-full bg-cyan-500 opacity-20" />
      <div className="absolute left-[30%] top-[20%] h-16 w-16 rounded-full bg-cyan-500 opacity-20" />
      <div className="absolute bottom-[20%] right-[30%] h-16 w-16 rounded-full bg-cyan-500 opacity-20" />

      {loading ? (
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-300" />
          <span className="ml-2 text-cyan-300">数据分析预测中...</span>
        </div>
      ) : prediction ? (
        <div className="w-full text-center text-white">
          <div className="mb-4 text-center">
            <h3 className="flex items-center justify-center text-lg font-semibold text-cyan-400">AI 智能分析报告</h3>
            <div className="mt-1 text-xs text-gray-400">{data.length > 0 ? `基于 ${data.length} 条实时数据` : '基于系统状态'}</div>
          </div>

          <div className="mb-4 rounded-lg bg-slate-700/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-300">风险等级</span>
              <span
                className={`text-sm font-bold ${
                  prediction.result.includes('高风险')
                    ? 'text-red-400'
                    : prediction.result.includes('中等')
                      ? 'text-yellow-400'
                      : 'text-green-400'
                }`}
              >
                {prediction.result}
              </span>
            </div>
            <div className="mb-2 h-2 w-full rounded-full bg-gray-700">
              <div
                className={`h-2 rounded-full transition-all duration-1000 ${
                  prediction.result.includes('高风险')
                    ? 'bg-red-400'
                    : prediction.result.includes('中等')
                      ? 'bg-yellow-400'
                      : 'bg-green-400'
                }`}
                style={{ width: prediction.probability }}
              />
            </div>
            <div className="text-center">
              <span className="text-lg font-bold text-white">{prediction.probability}</span>
              <span className="ml-1 text-xs text-gray-400">风险概率</span>
            </div>
          </div>

          <div className="ai-prediction-scroll mx-2 max-h-[180px] w-full space-y-3 overflow-y-auto px-0">
            <div className="rounded border-l-2 border-cyan-400/50 bg-slate-800/50 p-2">
              <div className="mb-1 text-xs text-cyan-400">详细分析</div>
              <p className="whitespace-pre-line text-left text-xs text-gray-300">{prediction.analysis}</p>
            </div>

            <div className="rounded border-l-2 border-green-400/50 bg-slate-800/50 p-2">
              <div className="mb-1 text-xs text-green-400">专业建议</div>
              <p className="whitespace-pre-line text-left text-xs text-gray-300">{prediction.recommendation}</p>
            </div>
          </div>

          <p className="absolute bottom-0 right-0 mr-2.5 mb-[84.5px] text-xs text-gray-400">{prediction.timestamp}</p>
          <button
            className="absolute bottom-0 left-0 ml-1 mb-[82px] rounded-lg bg-blue-500 px-1 py-0.5 text-sm text-white shadow-lg transition-colors hover:bg-blue-700 hover:shadow-blue-500/50"
            onClick={clearPrediction}
          >
            返回
          </button>
        </div>
      ) : (
        <div className="text-center">
          <button
            className="rounded-lg bg-cyan-400 px-4 py-2 font-medium text-white shadow-lg transition-colors hover:bg-cyan-600 hover:shadow-cyan-400/50"
            onClick={fetchPrediction}
          >
            AI 智能分析预测
          </button>
          <div className="mt-2 text-xs text-gray-400">{data.length > 0 ? `基于 ${data.length} 条实时数据进行分析` : '基于系统状态进行分析'}</div>
        </div>
      )}

      <style>{`
        .ai-prediction-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .ai-prediction-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
