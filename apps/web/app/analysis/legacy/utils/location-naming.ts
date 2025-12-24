export function generateDeviceName(lat: number, lon: number, deviceId: string) {
  return `设备 ${deviceId} (${lat.toFixed(4)}, ${lon.toFixed(4)})`
}

export function getRiskByLocation(lat: number, lon: number): number {
  void lat
  void lon
  return 0
}

export function getDetailedLocationInfo(lat: number, lon: number): { description: string } {
  return { description: `${lat.toFixed(6)}, ${lon.toFixed(6)}` }
}
