// app/hooks/usePerformanceMonitor.ts
'use client';

import { useEffect, useState } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  fps: number;
  loadTime: number;
}

export default function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    fps: 0,
    loadTime: 0,
  });

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    // FPS监控
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        setMetrics(prev => ({
          ...prev,
          fps,
          memoryUsage: ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0) / 1024 / 1024,
        }));
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };

    // 页面加载时间
    const measureLoadTime = () => {
      if (typeof window !== 'undefined' && window.performance) {
        const loadTime = window.performance.timing.loadEventEnd - window.performance.timing.navigationStart;
        setMetrics(prev => ({ ...prev, loadTime }));
      }
    };

    measureFPS();
    measureLoadTime();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  // 性能警告
  const getPerformanceWarnings = () => {
    const warnings: string[] = [];
    
    if (metrics.fps < 30) {
      warnings.push('FPS过低，可能影响用户体验');
    }
    
    if (metrics.memoryUsage > 100) {
      warnings.push('内存使用过高，建议优化');
    }
    
    if (metrics.loadTime > 3000) {
      warnings.push('页面加载时间过长');
    }
    
    return warnings;
  };

  return {
    metrics,
    warnings: getPerformanceWarnings(),
    isPerformanceGood: metrics.fps >= 30 && metrics.memoryUsage < 100,
  };
}
