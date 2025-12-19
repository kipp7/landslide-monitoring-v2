'use client';

import React, { useEffect } from 'react';

export default function Map3DContainer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const container = document.getElementById('terrain-map-container');
    if (!container) return;

    // 清空容器避免报错
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    (window as any)._AMapSecurityConfig = {
      securityJsCode: 'cc0eba60eaa747eca1348c25ab3b4b75',
    };

    const loaderScript = document.createElement('script');
    loaderScript.src = 'https://webapi.amap.com/loader.js';
    loaderScript.onload = async () => {
      const AMapLoader = (await import('@amap/amap-jsapi-loader')).default;
      AMapLoader.load({
        key: '205bd1b11d016ea76c71ee7c43b45cc3',
        version: '2.1Beta',
        plugins: ['AMap.ControlBar', 'AMap.ToolBar'],
      }).then((AMap) => {
        const map = new AMap.Map('terrain-map-container', {
          viewMode: '3D',
          terrain: true,
          pitch: 40,
          rotation: -10,
          zoom: 11,
          center: [110.1805, 22.6263],
          resizeEnable: true,
          rotateEnable: true,
          pitchEnable: true,
          showLabel: true,
        });

        map.addControl(new AMap.ControlBar({ position: { top: '10px', right: '10px' } }));
        map.addControl(new AMap.ToolBar({ position: { top: '110px', right: '10px' } }));
      });
    };
    document.head.appendChild(loaderScript);
  }, []);

  return <div id="terrain-map-container" className="w-full h-full rounded-2xl shadow-inner overflow-hidden" />;
}
