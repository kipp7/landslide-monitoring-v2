import common from '@ohos.app.ability.common';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import geoLocationManager from '@ohos.geoLocationManager';
import { UserMapLocation, UserLocationStatus } from './Types';

const LOCATION_PERMISSIONS: Array<Permissions> = [
  'ohos.permission.APPROXIMATELY_LOCATION',
  'ohos.permission.LOCATION'
];

export interface DeviceLocationResult {
  status: UserLocationStatus;
  location?: UserMapLocation;
}

export class DeviceLocationService {
  private context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async current(): Promise<DeviceLocationResult> {
    try {
      const result = await abilityAccessCtrl.createAtManager()
        .requestPermissionsFromUser(this.context, LOCATION_PERMISSIONS);
      if (result.authResults.length === 0 || result.authResults[0] !== abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        return { status: 'denied' };
      }
      const location = await geoLocationManager.getCurrentLocation({
        priority: geoLocationManager.LocationRequestPriority.ACCURACY,
        scenario: geoLocationManager.LocationRequestScenario.NAVIGATION,
        maxAccuracy: 100,
        timeoutMs: 12000
      });
      if (!this.validCoordinate(location.latitude, location.longitude)) return { status: 'unavailable' };
      const observedAt = location.timeStamp > 0 ? location.timeStamp : Date.now();
      return {
        status: 'ready',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: Math.max(0, location.accuracy),
          updatedAt: new Date(observedAt).toISOString()
        }
      };
    } catch {
      return { status: 'unavailable' };
    }
  }

  private validCoordinate(latitude: number, longitude: number): boolean {
    return Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }
}
