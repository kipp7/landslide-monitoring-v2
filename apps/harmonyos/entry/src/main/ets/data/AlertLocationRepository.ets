import { ApiClient } from './ApiClient';
import { CacheManager } from './CacheManager';
import { Alert, AlertEvent, AlertLocationSource, AlertMapLocation, Device, DeviceState, JsonRecord, SeriesResponse, Station, deviceDisplayName, numberValue, stationDisplayName } from './Types';

// Keep the fallback aligned with the active Windows desktop monitoring map.
const DEFAULT_LATITUDE: number = 24.43803;
const DEFAULT_LONGITUDE: number = 118.09631;
const LAST_LOCATION_TTL: number = 10 * 365 * 24 * 60 * 60 * 1000;
const LIVE_GPS_WINDOW: number = 15 * 60 * 1000;
const CHINA_MIN_LATITUDE: number = 3;
const CHINA_MAX_LATITUDE: number = 54;
const CHINA_MIN_LONGITUDE: number = 73;
const CHINA_MAX_LONGITUDE: number = 136;

interface Coordinate {
  latitude: number;
  longitude: number;
  updatedAt?: string;
}

interface SeriesValue {
  value: number;
  ts: string;
}

export class AlertLocationRepository {
  private api: ApiClient;
  private cache: CacheManager;

  constructor(api: ApiClient, cache: CacheManager) {
    this.api = api;
    this.cache = cache;
  }

  async resolve(
    alert: Alert | null,
    events: Array<AlertEvent>,
    stations: Array<Station>,
    devices: Array<Device>
  ): Promise<AlertMapLocation> {
    const alertCoordinate = this.alertCoordinate(alert, events);
    if (alertCoordinate) {
      return {
        latitude: alertCoordinate.latitude,
        longitude: alertCoordinate.longitude,
        source: 'alert',
        locationName: alert?.title || '告警位置',
        deviceId: alert?.deviceId,
        updatedAt: alertCoordinate.updatedAt ?? alert?.lastEventAt
      };
    }

    const device = this.findDevice(alert?.deviceId, devices);
    if (device) {
      const deviceLocation = await this.deviceGpsLocation(device);
      if (deviceLocation) return deviceLocation;
    }

    const station = this.findStation(alert?.stationId ?? device?.stationId, stations);
    if (station && this.validCoordinate(station.latitude, station.longitude)) {
      return {
        latitude: station.latitude as number,
        longitude: station.longitude as number,
        source: 'station',
        locationName: stationDisplayName(station),
        deviceId: device?.deviceId
      };
    }

    return {
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      source: 'default',
      locationName: '厦门大学默认位置'
    };
  }

  async resolveNodes(devices: Array<Device>): Promise<Array<AlertMapLocation>> {
    const sorted = devices.slice().sort((left: Device, right: Device) =>
      deviceDisplayName(left).localeCompare(deviceDisplayName(right))
    );
    const tasks: Array<Promise<AlertMapLocation>> = [];
    for (let index = 0; index < sorted.length; index++) {
      tasks.push(this.resolveNode(sorted[index], index, sorted.length));
    }
    return Promise.all(tasks);
  }

  private async resolveNode(device: Device, index: number, total: number): Promise<AlertMapLocation> {
    let gps: AlertMapLocation | null = null;
    try {
      gps = await this.deviceGpsLocation(device);
    } catch {
      gps = null;
    }
    if (gps) return gps;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(total, 1);
    const radius = total > 1 ? 0.0012 : 0;
    return {
      latitude: DEFAULT_LATITUDE + Math.sin(angle) * radius,
      longitude: DEFAULT_LONGITUDE + Math.cos(angle) * radius,
      source: 'default',
      locationName: deviceDisplayName(device),
      deviceId: device.deviceId
    };
  }

  private alertCoordinate(alert: Alert | null, events: Array<AlertEvent>): Coordinate | null {
    if (alert && this.validCoordinate(alert.latitude, alert.longitude)) {
      return {
        latitude: alert.latitude as number,
        longitude: alert.longitude as number,
        updatedAt: alert.lastEventAt
      };
    }
    if (alert?.evidence) {
      const coordinate = this.coordinateFromRecord(alert.evidence);
      if (coordinate) {
        return {
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          updatedAt: alert.lastEventAt
        };
      }
    }
    for (let index = events.length - 1; index >= 0; index--) {
      const coordinate = this.coordinateFromRecord(events[index].evidence);
      if (coordinate) {
        return {
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          updatedAt: events[index].createdAt
        };
      }
    }
    return null;
  }

  private coordinateFromRecord(record: JsonRecord | undefined): Coordinate | null {
    if (!record) return null;
    const direct = this.coordinateFromValues(
      this.firstNumber(record, ['latitude', 'lat', 'gps_latitude']),
      this.firstNumber(record, ['longitude', 'lng', 'lon', 'gps_longitude'])
    );
    if (direct) return direct;

    const nestedKeys = ['location', 'gps', 'coordinates'];
    for (let index = 0; index < nestedKeys.length; index++) {
      const nested = record[nestedKeys[index]];
      if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
        const coordinate = this.coordinateFromRecord(nested as JsonRecord);
        if (coordinate) return coordinate;
      }
    }
    return null;
  }

  private firstNumber(record: JsonRecord, keys: Array<string>): number | null {
    for (let index = 0; index < keys.length; index++) {
      const value = numberValue(record[keys[index]]);
      if (value !== null) return value;
    }
    return null;
  }

  private coordinateFromValues(latitude: number | null, longitude: number | null): Coordinate | null {
    if (!this.validCoordinate(latitude, longitude)) return null;
    return { latitude: latitude as number, longitude: longitude as number };
  }

  private async deviceStateCoordinate(deviceId: string): Promise<Coordinate | null> {
    try {
      const state = await this.api.deviceState(deviceId);
      const coordinate = this.coordinateFromRecord(state.state.metrics);
      if (!coordinate) return null;
      return {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        updatedAt: state.updatedAt
      };
    } catch {
      return null;
    }
  }

  private async deviceSeriesCoordinate(deviceId: string): Promise<Coordinate | null> {
    try {
      const response = await this.api.gpsSeries(deviceId);
      const latitude = this.latestSeriesValue(response, 'gps_latitude');
      const longitude = this.latestSeriesValue(response, 'gps_longitude');
      if (!latitude || !longitude || !this.validCoordinate(latitude.value, longitude.value)) return null;
      return {
        latitude: latitude.value,
        longitude: longitude.value,
        updatedAt: latitude.ts > longitude.ts ? latitude.ts : longitude.ts
      };
    } catch {
      return null;
    }
  }

  private latestSeriesValue(response: SeriesResponse, sensorKey: string): SeriesValue | null {
    for (let index = 0; index < response.series.length; index++) {
      const metric = response.series[index];
      if (metric.sensorKey !== sensorKey || metric.points.length === 0) continue;
      const point = metric.points[metric.points.length - 1];
      return { value: point.value, ts: point.ts };
    }
    return null;
  }

  private gpsLocation(device: Device, coordinate: Coordinate, source: AlertLocationSource): AlertMapLocation {
    return {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      source,
      locationName: deviceDisplayName(device),
      deviceId: device.deviceId,
      updatedAt: coordinate.updatedAt
    };
  }

  private async deviceGpsLocation(device: Device): Promise<AlertMapLocation | null> {
    const stateCoordinate = await this.deviceStateCoordinate(device.deviceId);
    if (stateCoordinate) {
      const source: AlertLocationSource = this.isRecent(stateCoordinate.updatedAt) ? 'gps-live' : 'gps-last';
      const location = this.gpsLocation(device, stateCoordinate, source);
      await this.saveLastGps(device.deviceId, location);
      return location;
    }

    const seriesCoordinate = await this.deviceSeriesCoordinate(device.deviceId);
    if (seriesCoordinate) {
      const source: AlertLocationSource = this.isRecent(seriesCoordinate.updatedAt) ? 'gps-live' : 'gps-last';
      const location = this.gpsLocation(device, seriesCoordinate, source);
      await this.saveLastGps(device.deviceId, location);
      return location;
    }

    return this.cachedLastGps(device.deviceId);
  }

  private async saveLastGps(deviceId: string, location: AlertMapLocation): Promise<void> {
    await this.cache.write(
      this.cache.key('/map/last-gps', deviceId),
      {
        latitude: location.latitude,
        longitude: location.longitude,
        source: 'gps-last',
        locationName: location.locationName,
        deviceId,
        updatedAt: location.updatedAt
      } as AlertMapLocation
    );
  }

  private async cachedLastGps(deviceId: string): Promise<AlertMapLocation | null> {
    const cached = await this.cache.read<AlertMapLocation>(
      this.cache.key('/map/last-gps', deviceId),
      LAST_LOCATION_TTL
    );
    if (!cached || !this.validCoordinate(cached.value.latitude, cached.value.longitude)) return null;
    return {
      latitude: cached.value.latitude,
      longitude: cached.value.longitude,
      source: 'gps-last',
      locationName: cached.value.locationName,
      deviceId,
      updatedAt: cached.value.updatedAt
    };
  }

  private findDevice(deviceId: string | undefined, devices: Array<Device>): Device | null {
    if (!deviceId) return null;
    for (let index = 0; index < devices.length; index++) {
      if (devices[index].deviceId === deviceId) return devices[index];
    }
    return null;
  }

  private findStation(stationId: string | undefined, stations: Array<Station>): Station | null {
    if (!stationId) return null;
    for (let index = 0; index < stations.length; index++) {
      if (stations[index].stationId === stationId) return stations[index];
    }
    return null;
  }

  private validCoordinate(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
    return typeof latitude === 'number' && typeof longitude === 'number' &&
      Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= CHINA_MIN_LATITUDE && latitude <= CHINA_MAX_LATITUDE &&
      longitude >= CHINA_MIN_LONGITUDE && longitude <= CHINA_MAX_LONGITUDE;
  }

  private isRecent(updatedAt: string | undefined): boolean {
    if (!updatedAt) return false;
    const timestamp = new Date(updatedAt).getTime();
    return Number.isFinite(timestamp) && Date.now() - timestamp <= LIVE_GPS_WINDOW;
  }
}

export function alertLocationSourceLabel(source: AlertLocationSource): string {
  switch (source) {
    case 'alert': return '告警坐标';
    case 'gps-live': return '实时 GPS';
    case 'gps-last': return '最后 GPS';
    case 'station': return '站点坐标';
    default: return '默认位置';
  }
}
