'use client';

import React, { useRef, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import useAcceleration from '../hooks/useAcceleration';

const deviceColors = ['#0783FA', '#FF2E2E', '#07D1FA', '#FFD15C', '#20E6A4'];
const areaColors = [
  { from: 'rgba(7, 131, 250, 0.3)', to: 'rgba(7, 131, 250, 0)' },
  { from: 'rgba(255, 46, 46, 0.3)', to: 'rgba(255, 46, 46, 0)' },
  { from: 'rgba(7, 209, 250, 0.3)', to: 'rgba(7, 209, 250, 0)' },
  { from: 'rgba(255, 209, 92, 0.3)', to: 'rgba(255, 209, 92, 0)' },
  { from: 'rgba(32, 230, 164, 0.3)', to: 'rgba(32, 230, 164, 0)' },
];

export default function AccelerationChart() {
  const chartRef = useRef<ReactECharts | null>(null);
  const accelerationData = useAcceleration();
  const { data, loading, error } = accelerationData;

  // 创建fallback函数，如果监测站Hook失败则使用
  const getFallbackLegendName = (deviceId: string) => {
    const fallbackNames: { [key: string]: string } = {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站', 
      'device_3': '坡脚监测站'
    };
    return fallbackNames[deviceId] || deviceId;
  };

  const isEmpty = !data || Object.keys(data).length === 0;

  // 条件返回必须在所有Hook调用之后
  if (loading) return <div className="text-white text-sm">加载中...</div>;
  if (error) return <div className="text-red-500 text-sm">加载失败: {error.message}</div>;
  if (isEmpty) return <div className="text-white text-sm">暂无数据</div>;

  const deviceKeys = Object.keys(data);

  const xLabels = data[deviceKeys[0]].map((d) =>
    new Date(d.time).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );

  // 计算数据的最大值，用于动态调整布局
  const calculateMaxValue = () => {
    let maxValue = 0;
    deviceKeys.forEach(key => {
      const keyMax = Math.max(...data[key].map((d: { value: number }) => d.value));
      maxValue = Math.max(maxValue, keyMax);
    });
    return maxValue;
  };

  const maxValue = calculateMaxValue();
  // 根据加速度数据的范围动态调整grid顶部位置（加速度单位mg，范围可能很大）
  const dynamicGridTop = maxValue > 800 ? '25%' : maxValue > 500 ? '22%' : maxValue > 200 ? '20%' : '18%';

  const series = deviceKeys.map((key, index) => {
    const legendName = getFallbackLegendName(key);
    // 处理长图例名称，避免布局问题
    const displayName = legendName.length > 8 ? legendName.substring(0, 8) + '...' : legendName;
    
    return {
      name: displayName,
      type: 'line' as const,
      smooth: true,
      showSymbol: false,
      data: data[key].map((d) => d.value),
      lineStyle: {
        width: 1.5,
        shadowColor: deviceColors[index % deviceColors.length],
        shadowBlur: 8,
      },
      areaStyle: {
        opacity: 0.4,
        color: {
          type: 'linear' as const,
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: areaColors[index % areaColors.length].from },
            { offset: 1, color: areaColors[index % areaColors.length].to },
          ],
        },
      },
    };
  });

  const option = {
    backgroundColor: 'transparent',
    color: deviceColors,
    animationDuration: 1000,
    animationEasing: 'cubicOut' as const,
    legend: {
      icon: 'circle' as const,
      itemWidth: 15,
      itemHeight: 20,
      left: 30,
      type: 'scroll' as const,
      orient: 'horizontal' as const,
      top: '5%',
      textStyle: { color: '#94A7BD', fontSize: 10 },
      pageIconColor: '#0891b2',
      pageTextStyle: { color: '#ffffff', fontWeight: 'bold' as const, fontSize: 9 },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1b263b',
      borderColor: '#20E6A4',
      textStyle: { color: '#fff' },
    },
    grid: {
      left: '0%',
      right: '0%',
      bottom: '8%',
      top: dynamicGridTop,
      containLabel: true,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 90,
        end: 100,
      },
      {
        type: 'slider',
        show: true,
        start: 90,
        end: 100,
        height: 8,
        bottom: 6,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        fillerColor: 'rgba(32,230,164,0.2)',
        handleStyle: {
          color: '#20E6A4',
          shadowColor: '#20E6A4',
          shadowBlur: 6,
        },
        textStyle: {
          color: '#94A7BD',
        },
      },
    ],
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLine: { lineStyle: { color: '#94A7BD' } },
      axisLabel: { color: '#94A7BD' },
    },
    yAxis: {
      type: 'value' as const,
      nameTextStyle: { color: '#94A7BD', padding: [0, 0, 0, -20] },
      axisLine: { lineStyle: { color: '#94A7BD' } },
      splitLine: {
        lineStyle: {
          color: '#182D46',
          type: 'dashed' as const,
        },
      },
      axisLabel: { color: '#94A7BD' },
    },
    series,
  };

  return <ReactECharts ref={chartRef} option={option} style={{ height: '100%', width: '100%' }} />;
}
