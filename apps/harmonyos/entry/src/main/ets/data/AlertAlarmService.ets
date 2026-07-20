import common from '@ohos.app.ability.common';
import { audio } from '@kit.AudioKit';
import { media } from '@kit.MediaKit';
import { vibrator } from '@kit.SensorServiceKit';

const ALERT_ALARM_RESOURCE: string = 'alert_alarm.wav';

export class AlertAlarmService {
  private context: common.UIAbilityContext;
  private soundPool: media.SoundPool | null = null;
  private soundId: number = 0;
  private streamId: number = 0;
  private preparePromise: Promise<boolean> | null = null;
  private desiredPlaying: boolean = false;
  private requestVersion: number = 0;
  private vibrationTimer: number | undefined = undefined;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async start(): Promise<void> {
    console.info('[AlertAlarm] start requested');
    this.desiredPlaying = true;
    this.requestVersion += 1;
    const requestVersion = this.requestVersion;
    this.startVibrationLoop();
    await this.stopCurrentStream();
    if (!await this.prepare() || !this.desiredPlaying || requestVersion !== this.requestVersion) {
      console.warn('[AlertAlarm] start cancelled before playback');
      return;
    }
    const pool = this.soundPool;
    if (!pool || this.soundId <= 0) return;
    try {
      const streamId = await pool.play(this.soundId, {
        loop: -1,
        leftVolume: 0.74,
        rightVolume: 0.74,
        priority: 1
      });
      if (streamId <= 0) throw new Error('告警音播放失败');
      this.streamId = streamId;
      console.info(`[AlertAlarm] playing stream ${this.streamId}`);
    } catch {
      this.streamId = 0;
      console.error('[AlertAlarm] failed to start playback');
    }
  }

  async stop(): Promise<void> {
    console.info('[AlertAlarm] stop requested');
    this.desiredPlaying = false;
    this.requestVersion += 1;
    this.stopVibrationLoop();
    await this.stopCurrentStream();
  }

  async release(): Promise<void> {
    console.info('[AlertAlarm] release requested');
    const preparing = this.preparePromise;
    await this.stop();
    if (preparing) await preparing;
    const pool = this.soundPool;
    const soundId = this.soundId;
    this.soundPool = null;
    this.soundId = 0;
    this.preparePromise = null;
    if (!pool) return;
    try {
      if (soundId > 0) await pool.unload(soundId);
    } catch {
      // The audio service may already have released the loaded sound.
    }
    try {
      await pool.release();
    } catch {
      // Releasing alarm audio must not interrupt the page lifecycle.
    }
  }

  private async stopCurrentStream(): Promise<void> {
    const pool = this.soundPool;
    const streamId = this.streamId;
    this.streamId = 0;
    if (!pool || streamId <= 0) return;
    try {
      await pool.stop(streamId);
    } catch {
      // A completed or interrupted stream is already stopped.
    }
  }

  private startVibrationLoop(): void {
    this.stopVibrationLoop();
    this.vibratePulse();
    this.vibrationTimer = setInterval(() => {
      if (this.desiredPlaying) this.vibratePulse();
    }, 1500);
  }

  private stopVibrationLoop(): void {
    if (this.vibrationTimer !== undefined) clearInterval(this.vibrationTimer);
    this.vibrationTimer = undefined;
    vibrator.stopVibration().catch(() => {
      // A completed pulse or a device without a vibrator is already quiet.
    });
  }

  private vibratePulse(): void {
    vibrator.startVibration({
      type: 'time',
      duration: 650
    }, {
      id: 0,
      usage: 'alarm'
    }).catch(() => {
      // Audio and the visual alert remain available when vibration is unsupported.
    });
  }

  private prepare(): Promise<boolean> {
    if (this.soundPool && this.soundId > 0) return Promise.resolve(true);
    if (!this.preparePromise) {
      this.preparePromise = this.createAndLoad().finally(() => {
        this.preparePromise = null;
      });
    }
    return this.preparePromise;
  }

  private async createAndLoad(): Promise<boolean> {
    let pool: media.SoundPool | null = null;
    try {
      const rendererInfo: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_ALARM,
        rendererFlags: 0
      };
      pool = await media.createSoundPool(1, rendererInfo);
      const descriptor = await this.context.resourceManager.getRawFd(ALERT_ALARM_RESOURCE);
      try {
        const soundId = await this.loadSound(pool, descriptor.fd, descriptor.offset, descriptor.length);
        if (soundId <= 0) throw new Error('告警音加载失败');
        this.soundPool = pool;
        this.soundId = soundId;
        console.info(`[AlertAlarm] loaded sound ${soundId}`);
        return true;
      } finally {
        try {
          await this.context.resourceManager.closeRawFd(ALERT_ALARM_RESOURCE);
        } catch {
          // The descriptor is closed by the media service on some system versions.
        }
      }
    } catch {
      console.error('[AlertAlarm] failed to initialize audio');
      if (pool) {
        try {
          await pool.release();
        } catch {
          // The in-app popup remains available when audio cannot be initialized.
        }
      }
      return false;
    }
  }

  private loadSound(pool: media.SoundPool, fd: number, offset: number, length: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        pool.off('loadComplete');
        clearTimeout(timeout);
      };
      const finish = (soundId: number): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(soundId);
      };
      const fail = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('告警音加载失败'));
      };
      const timeout = setTimeout(() => fail(), 3000);
      pool.on('loadComplete', (soundId: number) => finish(soundId));
      pool.load(fd, offset, length)
        .then((soundId: number) => {
          if (soundId <= 0) fail();
        })
        .catch(() => fail());
    });
  }
}
