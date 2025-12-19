'use client';

// 引入 React 和 OpenLayers 所需模块
import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls, ScaleLine, MousePosition } from 'ol/control';
import { createStringXY } from 'ol/coordinate';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style';
import Cluster from 'ol/source/Cluster';
import Overlay from 'ol/Overlay';
import { easeOut } from 'ol/easing';



// 聚合点弹窗组件，支持分页轮播、点击切页、排序
function ClusterPopup({ features }: { features: any[] }) {
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const perPage = 3;
  const sorted = [...features].sort((a, b) => b.get('risk') - a.get('risk'));
  const pages = Math.ceil(sorted.length / perPage);

  useEffect(() => {
    if (!playing || pages <= 1) return;
    const interval = setInterval(() => {
      setPage((p) => (p + 1) % pages);
    }, 5000);
    return () => clearInterval(interval);
  }, [playing, pages]);

  const getColor = (v: number) => (v > 0.7 ? '#ff4d4f' : v > 0.4 ? '#ffb800' : '#00ffff');
  const visible = sorted.slice(page * perPage, (page + 1) * perPage);

  return (
    <div className="absolute top-2 right-2 z-50 w-[300px] bg-[#001c2bcc] backdrop-blur border border-cyan-400 rounded-xl p-3 shadow-xl select-none">
      <h3 className="text-cyan-300 text-base font-bold mb-2">聚合点详情</h3>
      <div className="space-y-2 overflow-hidden">
        {visible.map((f) => (
          <div
            key={f.get('name')}
            className="p-2 rounded-lg border border-cyan-500 bg-[#002335bb] text-white text-sm shadow-md backdrop-blur-sm transition-all duration-300"
          >
            <div className="text-cyan-300 font-bold mb-1">{f.get('name')}</div>
            <div className="text-xs">温度：{f.get('temp')}°C 湿度：{f.get('hum')}%</div>
            <div className="text-xs" style={{ color: getColor(f.get('risk')) }}>
              滑坡概率：{(f.get('risk') * 100).toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1 items-center">
          {Array.from({ length: pages }).map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${i === page ? 'bg-cyan-300' : 'bg-cyan-700'} transition-all cursor-pointer`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
        <button
          className="text-cyan-300 border border-cyan-300 px-3 py-1 rounded hover:bg-cyan-800/20 text-xs"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? '暂停轮播' : '开始轮播'}
        </button>
      </div>
    </div>
  );
}

// 设备信息接口
interface DevicePoint {
  device_id: string;
  name: string;
  coord: [number, number]; // [lng, lat]
  temp: number;
  hum: number;
  status: 'online' | 'offline' | 'maintenance';
  risk?: number;
  location?: string; // 添加位置描述字段
}

// 地图主组件 MapContainer
export default function MapContainer({
  mode,
  devices = [],
  center,
  zoom = 11
}: {
  mode: '2D' | '卫星图';
  devices?: DevicePoint[];
  center?: [number, number]; // [lng, lat]
  zoom?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const clickHandlerRef = useRef<any>(null);
  const [clusterPoints, setClusterPoints] = useState<any[] | null>(null);

  // 地图初始化 - 只在mode变化时重新创建地图
  useEffect(() => {

    if (mapInstance.current) mapInstance.current.setTarget(undefined);
    if (!mapRef.current) return;

    const getRiskColor = (val: number) => (val > 0.7 ? '#ff4d4f' : val > 0.4 ? '#ffb800' : '#00ffff');
    const getStatusColor = (status: string) =>
      status === 'online' ? '#00ff88' :
      status === 'maintenance' ? '#ffaa00' : '#ff4444';

    // 默认地图中心点
    const defaultCenter = [110.1805, 22.6263];

    const tdtKey = 'cc688e28c157fc3473807854c945f375';
    const createTdtLayer = (layerType: string) => new TileLayer({
      source: new XYZ({
        url: `https://t{0-7}.tianditu.gov.cn/${layerType}_w/wmts?tk=${tdtKey}&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layerType}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}`,
        wrapX: true,
      }),
    });

    const createOSMLayer = () => new TileLayer({
      source: new XYZ({
        url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        crossOrigin: 'anonymous',
      }),
    });

    const baseLayer = mode === '卫星图' ? [createTdtLayer('img'), createTdtLayer('cia')] : [createOSMLayer()];

    // 使用默认中心点初始化地图，后续通过单独的useEffect更新
    const mapCenter = defaultCenter;

    const map = new Map({
      target: mapRef.current!,
      layers: baseLayer,
      view: new View({
        center: fromLonLat(mapCenter),
        zoom: zoom,
        maxZoom: 18,
        minZoom: 5,
      }),
      controls: defaultControls().extend([
        new ScaleLine(),
        new MousePosition({
          coordinateFormat: createStringXY(4),
          projection: 'EPSG:4326',
          className: 'mouse-position',
        })
      ])
    });

    // 地图初始化完成，设备图层将由单独的useEffect处理

    // 创建弹窗覆盖层
    const overlay = new Overlay({
      element: overlayRef.current!,
      autoPan: { animation: { duration: 300, easing: easeOut } },
      offset: [0, -10],
    });
    map.addOverlay(overlay);

    mapInstance.current = map;
  }, [mode]); // 只在mode变化时重新创建地图

  // 单独处理设备数据和视图更新 - 不重新创建地图
  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;

    // 更新地图中心点和缩放级别
    if (center && center.length === 2) {
      map.getView().animate({
        center: fromLonLat(center),
        zoom: zoom || 11,
        duration: 1000
      });
    }

    // 清除现有的设备图层
    const existingLayers = map.getLayers().getArray();
    existingLayers.forEach(layer => {
      if (layer.get('name') === 'devices') {
        map.removeLayer(layer);
      }
    });

    // 添加新的设备图层
    if (devices && devices.length > 0) {
      const getRiskColor = (val: number) => (val > 0.7 ? '#ff4d4f' : val > 0.4 ? '#ffb800' : '#00ffff');
      const getStatusColor = (status: string) =>
        status === 'online' ? '#00ff88' :
        status === 'maintenance' ? '#ffaa00' : '#ff4444';

      const features = devices.map(p => {
        const f = new Feature({ geometry: new Point(fromLonLat(p.coord)), ...p });
        const statusColor = getStatusColor(p.status);
        const isOnline = p.status === 'online';

        // 创建精细的设备标点样式
        if (isOnline) {
          f.setStyle([
            // 外圈脉冲效果 - 更小更透明
            new Style({
              image: new CircleStyle({
                radius: 12,
                fill: new Fill({ color: 'rgba(0,255,136,0.15)' }),
                stroke: new Stroke({ color: 'rgba(0,255,136,0.4)', width: 1 })
              })
            }),
            // 主要标点 - 更小更精细
            new Style({
              image: new CircleStyle({
                radius: 6,
                fill: new Fill({ color: 'rgba(0,255,136,0.9)' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
              }),
              text: new Text({
                text: p.name,
                offsetY: -18,
                fill: new Fill({ color: '#ffffff' }),
                stroke: new Stroke({ color: '#001529', width: 2 }),
                font: 'bold 11px Microsoft YaHei, sans-serif',
                backgroundFill: new Fill({ color: 'rgba(0,21,41,0.85)' }),
                backgroundStroke: new Stroke({ color: statusColor, width: 1 }),
                padding: [2, 6, 2, 6]
              })
            })
          ]);
        } else {
          f.setStyle(new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color: 'rgba(255,68,68,0.9)' }),
              stroke: new Stroke({ color: '#ffffff', width: 2 })
            }),
            text: new Text({
              text: p.name,
              offsetY: -18,
              fill: new Fill({ color: '#ffffff' }),
              stroke: new Stroke({ color: '#001529', width: 2 }),
              font: 'bold 11px Microsoft YaHei, sans-serif',
              backgroundFill: new Fill({ color: 'rgba(0,21,41,0.85)' }),
              backgroundStroke: new Stroke({ color: statusColor, width: 1 }),
              padding: [2, 6, 2, 6]
            })
          }));
        }

        return f;
      });

      const clusterSource = new Cluster({ distance: 40, source: new VectorSource({ features }) });
      const clusterLayer = new VectorLayer({
        source: clusterSource,
        style: f => {
          const size = f.get('features').length;
          return size === 1 ? f.get('features')[0].getStyle() : new Style({
            image: new CircleStyle({ radius: 12, fill: new Fill({ color: 'rgba(0,255,255,0.5)' }), stroke: new Stroke({ color: '#00ffff', width: 2 }) }),
            text: new Text({ text: size.toString(), fill: new Fill({ color: '#fff' }), font: 'bold 12px sans-serif' })
          });
        }
      });

      clusterLayer.set('name', 'devices'); // 标记图层名称
      map.addLayer(clusterLayer);

      // 添加点击事件处理
      const clickHandler = (e: any) => {
        const fs = map.getFeaturesAtPixel(e.pixel);
        const overlays = map.getOverlays().getArray();
        const overlay = overlays[0]; // 获取第一个覆盖层

        if (overlay) {
          overlay.setPosition(undefined);
        }
        setClusterPoints(null);

        if (fs && fs.length > 0) {
          const cluster = fs[0].get('features');
          if (cluster.length === 1) {
            const f = cluster[0];
            const statusColor = getStatusColor(f.get('status'));
            const statusText = f.get('status') === 'online' ? '在线' :
                              f.get('status') === 'maintenance' ? '维护中' : '离线';
            const riskDisplay = f.get('risk') !== undefined
              ? `<div><span style="color:#ccc;">滑坡概率：</span><span style="color: ${getRiskColor(f.get('risk'))};">${(f.get('risk') * 100).toFixed(0)}%</span></div>`
              : '';

            if (overlayRef.current) {
              overlayRef.current.innerHTML = `
                <div style="background: rgba(0,21,41,0.85); border: 1px solid ${statusColor}; border-radius: 10px; box-shadow: 0 0 10px rgba(0,255,255,0.4); padding: 10px 14px; color: #fff; font-family: 'Microsoft YaHei'; font-size: 12px; line-height: 1.8; white-space: nowrap; caret-color: transparent; user-select: none; pointer-events: none;">
                  <div style="font-size: 14px; font-weight: bold; color: ${statusColor};">${f.get('name')}</div>
                  <div><span style="color:#ccc;">设备状态：</span><span style="color: ${statusColor};">${statusText}</span></div>
                  <div><span style="color:#ccc;">温度：</span>${f.get('temp')}°C</div>
                  <div><span style="color:#ccc;">湿度：</span>${f.get('hum')}%</div>
                  ${riskDisplay}
                </div>`;
              overlay?.setPosition(f.getGeometry().getCoordinates());
            }
          } else {
            setClusterPoints(cluster);
          }
        }
      };

      // 移除旧的点击事件监听器（如果存在）
      if (clickHandlerRef.current) {
        map.un('singleclick', clickHandlerRef.current);
      }
      // 添加新的点击事件监听器
      map.on('singleclick', clickHandler);
      // 保存引用以便后续移除
      clickHandlerRef.current = clickHandler;
    }

    // 清理函数
    return () => {
      if (mapInstance.current && clickHandlerRef.current) {
        mapInstance.current.un('singleclick', clickHandlerRef.current);
      }
    };
  }, [devices, center, zoom]); // 只在设备数据、中心点或缩放级别变化时更新

  return (
    <div className="w-full h-full relative rounded-2xl shadow-inner overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      <div ref={overlayRef} className="absolute z-50 transition-all duration-300 ease-in-out select-none caret-transparent pointer-events-none" />
      {clusterPoints && <ClusterPopup features={clusterPoints} />}
    </div>
  );
}
