import common from '@ohos.app.ability.common';
import preferences from '@ohos.data.preferences';

const PREFERENCES_NAME: string = 'landslide_user_preferences_v1';
const KEY_ALARM_SOUND: string = 'alarm_sound_enabled';
const KEY_ALARM_VIBRATION: string = 'alarm_vibration_enabled';

export interface UserPreferences {
  alarmSoundEnabled: boolean;
  alarmVibrationEnabled: boolean;
}

export class UserPreferencesStore {
  private context: common.UIAbilityContext;
  private store: preferences.Preferences | null = null;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async load(): Promise<UserPreferences> {
    try {
      const store = await this.preferences();
      const sound = await store.get(KEY_ALARM_SOUND, true);
      const vibration = await store.get(KEY_ALARM_VIBRATION, true);
      return {
        alarmSoundEnabled: typeof sound === 'boolean' ? sound : true,
        alarmVibrationEnabled: typeof vibration === 'boolean' ? vibration : true
      };
    } catch {
      return { alarmSoundEnabled: true, alarmVibrationEnabled: true };
    }
  }

  async save(value: UserPreferences): Promise<void> {
    try {
      const store = await this.preferences();
      await store.put(KEY_ALARM_SOUND, value.alarmSoundEnabled);
      await store.put(KEY_ALARM_VIBRATION, value.alarmVibrationEnabled);
      await store.flush();
    } catch {
      // Preferences remain effective for the current session when persistence is unavailable.
    }
  }

  private async preferences(): Promise<preferences.Preferences> {
    if (this.store) return this.store;
    this.store = await preferences.getPreferences(this.context, { name: PREFERENCES_NAME });
    return this.store;
  }
}
