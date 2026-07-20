import common from '@ohos.app.ability.common';
import notificationManager from '@ohos.notificationManager';
import wantAgent from '@ohos.app.ability.wantAgent';
import { AlertStreamEvent, severityLabel } from './Types';

const APP_BUNDLE_NAME: string = 'com.kipp7.landslide.monitoring';
const APP_ABILITY_NAME: string = 'EntryAbility';

export class AlertNotificationService {
  private context: common.UIAbilityContext;
  private prepared: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    this.prepared = true;
    try {
      if (!await notificationManager.isNotificationEnabled()) {
        await notificationManager.requestEnableNotification(this.context);
      }
    } catch {
      // Notification permission is optional; realtime data remains available in the app.
    }
  }

  async publish(event: AlertStreamEvent): Promise<void> {
    try {
      await this.prepare();
      if (!notificationManager.isNotificationEnabledSync()) return;
      const agent = await wantAgent.getWantAgent({
        wants: [{
          bundleName: APP_BUNDLE_NAME,
          abilityName: APP_ABILITY_NAME,
          parameters: {
            alertId: event.alertId,
            eventId: event.eventId,
            eventType: event.eventType,
            severity: event.severity,
            title: event.title,
            message: event.message,
            deviceId: event.deviceId ?? '',
            stationId: event.stationId ?? '',
            createdAt: event.createdAt
          }
        }],
        actionType: wantAgent.OperationType.START_ABILITY,
        requestCode: this.notificationId(event.alertId),
        actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      });
      const title = event.title.trim().length > 0 ? event.title : '监测告警';
      const detail = event.message.trim().length > 0 ? event.message : '监测数据达到预警条件，请及时查看。';
      await notificationManager.publish({
        id: this.notificationId(event.alertId),
        appMessageId: event.eventId,
        notificationSlotType: notificationManager.SlotType.SERVICE_INFORMATION,
        content: {
          notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
          normal: {
            title: `${severityLabel(event.severity)} · ${title}`,
            text: detail,
            additionalText: '点击查看告警位置'
          }
        },
        wantAgent: agent,
        tapDismissed: true,
        showDeliveryTime: true
      });
    } catch {
      // A denied permission or unavailable notification service must not interrupt SSE updates.
    }
  }

  async cancel(alertId: string): Promise<void> {
    try {
      await notificationManager.cancel(this.notificationId(alertId));
    } catch {
      // The notification may already be dismissed or unavailable.
    }
  }

  private notificationId(value: string): number {
    let hash = 17;
    for (let index = 0; index < value.length; index++) {
      hash = ((hash * 31) + value.charCodeAt(index)) & 0x7FFFFFFF;
    }
    return Math.max(1, hash);
  }
}
