/**
 * 设备注册和命名管理
 */

// 设备类型映射
const DEVICE_TYPES = {
  'rk2206': '滑坡监测站',
  'sensor': '传感器节点',
  'gateway': '网关设备',
  'default': '监测设备'
};

// 地点名称池
const LOCATION_NAMES = [
  '龙门', '凤凰', '青山', '翠竹', '金桂', '银杏', '梅花', '兰草',
  '东峰', '西岭', '南坡', '北谷', '中台', '上坪', '下湾', '前岗',
  '后山', '左溪', '右岸', '高台', '低洼', '平原', '丘陵', '山脊'
];

// 已使用的设备名称
const usedNames = new Set();

/**
 * 生成友好的设备名称
 */
function generateDeviceName(deviceId, deviceType = 'default') {
  // 从设备ID中提取信息
  const parts = deviceId.split('_');
  const nodeId = parts[1] || parts[0];
  
  // 确定设备类型
  let type = DEVICE_TYPES[deviceType] || DEVICE_TYPES.default;
  if (deviceId.includes('rk2206')) {
    type = DEVICE_TYPES.rk2206;
  }
  
  // 生成序号（基于设备ID的哈希）
  const hash = simpleHash(deviceId);
  const locationIndex = hash % LOCATION_NAMES.length;
  const deviceNumber = Math.floor(hash / LOCATION_NAMES.length) % 99 + 1;
  
  // 生成名称
  let baseName = `${LOCATION_NAMES[locationIndex]}${type}`;
  let finalName = baseName;
  let counter = 1;
  
  // 确保名称唯一
  while (usedNames.has(finalName)) {
    finalName = `${baseName}${counter}`;
    counter++;
  }
  
  usedNames.add(finalName);
  return finalName;
}

/**
 * 简单哈希函数
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash);
}

/**
 * 解析设备信息
 */
function parseDeviceInfo(deviceId) {
  const parts = deviceId.split('_');
  
  return {
    device_id: deviceId,
    product_id: parts[0] || 'unknown',
    node_id: parts[1] || deviceId,
    device_type: parts[1] && parts[1].includes('rk2206') ? 'rk2206' : 'sensor',
    friendly_name: generateDeviceName(deviceId, parts[1]),
    short_id: deviceId.slice(-8) // 取最后8位作为短ID
  };
}

/**
 * 获取设备显示名称
 */
function getDeviceDisplayName(deviceId) {
  const info = parseDeviceInfo(deviceId);
  return `${info.friendly_name} (${info.short_id})`;
}

/**
 * 获取设备简短名称
 */
function getDeviceShortName(deviceId) {
  const info = parseDeviceInfo(deviceId);
  return info.friendly_name;
}

/**
 * 根据地理位置生成设备名称
 */
function generateLocationBasedName(latitude, longitude, deviceType = 'default') {
  // 基于经纬度生成地点相关的名称
  const latIndex = Math.floor((latitude + 90) * 10) % LOCATION_NAMES.length;
  const lonIndex = Math.floor((longitude + 180) * 10) % LOCATION_NAMES.length;
  
  const location1 = LOCATION_NAMES[latIndex];
  const location2 = LOCATION_NAMES[lonIndex];
  const type = DEVICE_TYPES[deviceType] || DEVICE_TYPES.default;
  
  // 如果两个地点名称相同，只用一个
  if (location1 === location2) {
    return `${location1}${type}`;
  } else {
    return `${location1}${location2}${type}`;
  }
}

/**
 * 设备注册信息模板
 */
function createDeviceRegistration(deviceId, additionalInfo = {}) {
  const deviceInfo = parseDeviceInfo(deviceId);
  
  return {
    device_id: deviceId,
    node_id: deviceInfo.node_id,
    product_id: deviceInfo.product_id,
    friendly_name: deviceInfo.friendly_name,
    display_name: getDeviceDisplayName(deviceId),
    short_name: getDeviceShortName(deviceId),
    device_type: deviceInfo.device_type,
    manufacturer: '华为云IoT',
    model: deviceInfo.device_type === 'rk2206' ? 'RK2206滑坡监测站' : '传感器节点',
    firmware_version: 'v1.0.0',
    install_date: new Date().toISOString(),
    last_active: new Date().toISOString(),
    status: 'online',
    ...additionalInfo
  };
}

/**
 * 设备位置信息模板
 */
function createDeviceLocation(deviceId, latitude, longitude, additionalInfo = {}) {
  const deviceInfo = parseDeviceInfo(deviceId);
  
  // 如果有经纬度，可以生成基于位置的名称
  let locationBasedName = deviceInfo.friendly_name;
  if (latitude && longitude) {
    locationBasedName = generateLocationBasedName(latitude, longitude, deviceInfo.device_type);
  }
  
  return {
    device_id: deviceId,
    province: '广西壮族自治区',
    city: '防城港市',
    district: '防城区',
    township: '华石镇',
    location_name: locationBasedName,
    latitude: latitude,
    longitude: longitude,
    altitude: null,
    installation_site: `${locationBasedName}安装点`,
    ...additionalInfo
  };
}

/**
 * 批量处理设备名称
 */
function batchProcessDeviceNames(deviceIds) {
  const results = [];
  
  deviceIds.forEach(deviceId => {
    const info = parseDeviceInfo(deviceId);
    results.push({
      original_id: deviceId,
      friendly_name: info.friendly_name,
      display_name: getDeviceDisplayName(deviceId),
      short_name: getDeviceShortName(deviceId),
      device_type: info.device_type
    });
  });
  
  return results;
}

module.exports = {
  generateDeviceName,
  parseDeviceInfo,
  getDeviceDisplayName,
  getDeviceShortName,
  generateLocationBasedName,
  createDeviceRegistration,
  createDeviceLocation,
  batchProcessDeviceNames,
  DEVICE_TYPES,
  LOCATION_NAMES
};
