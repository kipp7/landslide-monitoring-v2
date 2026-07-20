import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import Want from '@ohos.app.ability.Want';

interface PendingAlertPayload {
  type: string;
  eventId: string;
  alertId: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  deviceId: string;
  stationId: string;
  createdAt: string;
  latitude?: number;
  longitude?: number;
}

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    // The app is intentionally API-driven; no database or background worker is
    // started from the ability lifecycle.
    AppStorage.setOrCreate('pendingAlertId', '');
    AppStorage.setOrCreate('pendingAlertPayload', '');
    this.routeNotification(want);
  }

  onNewWant(want: Want): void {
    this.routeNotification(want);
  }

  private routeNotification(want: Want): void {
    const alertId = String(want.parameters?.alertId ?? '').trim();
    if (alertId.length === 0) return;
    const latitude = Number(want.parameters?.latitude);
    const longitude = Number(want.parameters?.longitude);
    const payload: PendingAlertPayload = {
      type: 'alert',
      eventId: String(want.parameters?.eventId ?? `notification-${alertId}-${Date.now()}`),
      alertId,
      eventType: String(want.parameters?.eventType ?? 'ALERT_TRIGGER'),
      severity: String(want.parameters?.severity ?? 'high'),
      title: String(want.parameters?.title ?? '监测告警'),
      message: String(want.parameters?.message ?? '监测数据达到预警条件，请及时查看。'),
      deviceId: String(want.parameters?.deviceId ?? ''),
      stationId: String(want.parameters?.stationId ?? ''),
      createdAt: String(want.parameters?.createdAt ?? new Date().toISOString())
    };
    if (Number.isFinite(latitude)) payload.latitude = latitude;
    if (Number.isFinite(longitude)) payload.longitude = longitude;
    AppStorage.setOrCreate('pendingAlertPayload', JSON.stringify(payload));
    AppStorage.setOrCreate('pendingAlertId', alertId);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error(`Failed to load main page: ${JSON.stringify(err)}`);
      }
    });
  }

  onWindowStageDestroy(): void {
    // Page-level refresh timers are stopped by the page lifecycle.
  }

  onForeground(): void {
    // The page resumes its SSE stream and refresh timers.
  }

  onBackground(): void {
    // An unresolved alarm keeps sounding until it is muted or resolved.
  }
}
