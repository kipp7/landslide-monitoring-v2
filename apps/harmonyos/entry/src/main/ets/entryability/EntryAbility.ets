import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import Want from '@ohos.app.ability.Want';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    // The app is intentionally API-driven; no database or background worker is
    // started from the ability lifecycle.
    AppStorage.setOrCreate('pendingAlertId', '');
    this.routeNotification(want);
  }

  onNewWant(want: Want): void {
    this.routeNotification(want);
  }

  private routeNotification(want: Want): void {
    const alertId = String(want.parameters?.alertId ?? '').trim();
    if (alertId.length > 0) AppStorage.setOrCreate('pendingAlertId', alertId);
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
    // The page refreshes stale data when it becomes visible again.
  }

  onBackground(): void {
    // No polling work is kept alive in the background.
  }
}
