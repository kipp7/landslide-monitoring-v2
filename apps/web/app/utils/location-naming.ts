// 基于经纬度的地名生成工具
// 专门针对广西玉林师范学院东校区挂傍山滑坡监测区域

export interface LocationInfo {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
}

// 玉林师范学院东校区挂傍山地理区域划分
export const getDetailedLocationInfo = (lat: number, lng: number): LocationInfo => {
  // 挂傍山中心点坐标
  const centerLat = 22.6847;
  const centerLng = 110.1893;
  
  // 计算相对位置
  const latDiff = lat - centerLat;
  const lngDiff = lng - centerLng;
  
  // 计算距离中心点的距离（简化计算）
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  // 根据位置特征返回详细信息
  if (distance < 0.001) {
    return {
      name: '挂傍山中心',
      description: '挂傍山核心监测区域',
      riskLevel: 'medium'
    };
  }
  
  // 北部区域（山坡地带）
  if (latDiff > 0.003) {
    if (lngDiff > 0.003) {
      return {
        name: '挂傍山东北坡',
        description: '挂傍山东北侧山坡地带',
        riskLevel: 'high'
      };
    } else if (lngDiff < -0.003) {
      return {
        name: '挂傍山西北坡',
        description: '挂傍山西北侧山坡地带',
        riskLevel: 'high'
      };
    } else {
      return {
        name: '挂傍山北坡',
        description: '挂傍山北侧山坡监测区',
        riskLevel: 'high'
      };
    }
  }
  
  // 南部区域（相对平缓）
  if (latDiff < -0.003) {
    if (lngDiff > 0.003) {
      return {
        name: '挂傍山东南麓',
        description: '挂傍山东南侧山麓区域',
        riskLevel: 'low'
      };
    } else if (lngDiff < -0.003) {
      return {
        name: '挂傍山西南麓',
        description: '挂傍山西南侧山麓区域',
        riskLevel: 'low'
      };
    } else {
      return {
        name: '挂傍山南麓',
        description: '挂傍山南侧山麓区域',
        riskLevel: 'low'
      };
    }
  }
  
  // 东西两侧
  if (lngDiff > 0.003) {
    return {
      name: '挂傍山东坡',
      description: '挂傍山东侧坡面监测区',
      riskLevel: 'medium'
    };
  }
  
  if (lngDiff < -0.003) {
    return {
      name: '挂傍山西坡',
      description: '挂傍山西侧坡面监测区',
      riskLevel: 'medium'
    };
  }
  
  // 近距离区域
  if (latDiff > 0.001) {
    return {
      name: '挂傍山北侧',
      description: '挂傍山北侧监测区域',
      riskLevel: 'medium'
    };
  } else if (latDiff < -0.001) {
    return {
      name: '挂傍山南侧',
      description: '挂傍山南侧监测区域',
      riskLevel: 'low'
    };
  } else if (lngDiff > 0.001) {
    return {
      name: '挂傍山东侧',
      description: '挂傍山东侧监测区域',
      riskLevel: 'low'
    };
  } else if (lngDiff < -0.001) {
    return {
      name: '挂傍山西侧',
      description: '挂傍山西侧监测区域',
      riskLevel: 'low'
    };
  }
  
  // 默认情况
  return {
    name: '挂傍山',
    description: '挂傍山滑坡监测区域',
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
  return `${locationInfo.name}监测站`;
};

// 生成设备描述
export const generateDeviceDescription = (lat: number, lng: number): string => {
  const locationInfo = getDetailedLocationInfo(lat, lng);
  return `位于${locationInfo.description}的滑坡监测设备`;
};
