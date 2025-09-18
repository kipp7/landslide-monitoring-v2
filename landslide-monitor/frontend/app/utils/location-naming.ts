// 基于经纬度的地名生成工具
// 专门针对防城港华石镇龙门村滑坡监测区域

export interface LocationInfo {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
}

// 防城港华石镇龙门村地理区域划分
export const getDetailedLocationInfo = (lat: number, lng: number): LocationInfo => {
  // 龙门村中心点坐标
  const centerLat = 21.6847;
  const centerLng = 108.3516;
  
  // 计算相对位置
  const latDiff = lat - centerLat;
  const lngDiff = lng - centerLng;
  
  // 计算距离中心点的距离（简化计算）
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  // 根据位置特征返回详细信息
  if (distance < 0.001) {
    return {
      name: '龙门村中心',
      description: '村庄核心区域',
      riskLevel: 'medium'
    };
  }
  
  // 北部区域（山坡地带）
  if (latDiff > 0.003) {
    if (lngDiff > 0.003) {
      return {
        name: '东北山坡',
        description: '东北侧山坡地带',
        riskLevel: 'high'
      };
    } else if (lngDiff < -0.003) {
      return {
        name: '西北山坡',
        description: '西北侧山坡地带',
        riskLevel: 'high'
      };
    } else {
      return {
        name: '北部山坡',
        description: '北侧山坡监测区',
        riskLevel: 'high'
      };
    }
  }
  
  // 南部区域（相对平缓）
  if (latDiff < -0.003) {
    if (lngDiff > 0.003) {
      return {
        name: '东南平地',
        description: '东南侧平缓区域',
        riskLevel: 'low'
      };
    } else if (lngDiff < -0.003) {
      return {
        name: '西南平地',
        description: '西南侧平缓区域',
        riskLevel: 'low'
      };
    } else {
      return {
        name: '南部平地',
        description: '南侧相对平缓区域',
        riskLevel: 'low'
      };
    }
  }
  
  // 东西两侧
  if (lngDiff > 0.003) {
    return {
      name: '东侧边坡',
      description: '东侧边坡监测区',
      riskLevel: 'medium'
    };
  }
  
  if (lngDiff < -0.003) {
    return {
      name: '西侧边坡',
      description: '西侧边坡监测区',
      riskLevel: 'medium'
    };
  }
  
  // 近距离区域
  if (latDiff > 0.001) {
    return {
      name: '北侧坡地',
      description: '村北坡地区域',
      riskLevel: 'medium'
    };
  } else if (latDiff < -0.001) {
    return {
      name: '南侧坡地',
      description: '村南坡地区域',
      riskLevel: 'low'
    };
  } else if (lngDiff > 0.001) {
    return {
      name: '东侧坡地',
      description: '村东坡地区域',
      riskLevel: 'low'
    };
  } else if (lngDiff < -0.001) {
    return {
      name: '西侧坡地',
      description: '村西坡地区域',
      riskLevel: 'low'
    };
  }
  
  // 默认情况
  return {
    name: '龙门村',
    description: '龙门村监测区域',
    riskLevel: 'medium'
  };
};

// 简化版本，只返回地名
export const getLocationName = (lat: number, lng: number): string => {
  return getDetailedLocationInfo(lat, lng).name;
};

// 根据地名获取风险等级
export const getRiskByLocation = (lat: number, lng: number): number => {
  const info = getDetailedLocationInfo(lat, lng);
  switch (info.riskLevel) {
    case 'high': return 0.7;
    case 'medium': return 0.4;
    case 'low': return 0.2;
    default: return 0.3;
  }
};

// 生成完整的设备名称
export const generateDeviceName = (lat: number, lng: number, deviceId?: string): string => {
  const locationInfo = getDetailedLocationInfo(lat, lng);
  return `${locationInfo.name}滑坡监测站`;
};

// 生成设备描述
export const generateDeviceDescription = (lat: number, lng: number): string => {
  const locationInfo = getDetailedLocationInfo(lat, lng);
  return `位于${locationInfo.description}的滑坡监测设备`;
};
