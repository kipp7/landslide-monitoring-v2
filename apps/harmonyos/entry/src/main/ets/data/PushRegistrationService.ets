import { pushService } from '@kit.PushKit';
import { ApiClient } from './ApiClient';

export class PushRegistrationService {
  private token: string = '';

  async register(api: ApiClient): Promise<void> {
    try {
      const token = (await pushService.getToken()).trim();
      if (token.length === 0) return;
      await api.registerPushDevice(token);
      this.token = token;
    } catch {
      // Push Kit requires an AGC project and a supported device. Foreground SSE remains available.
    }
  }

  async unregister(api: ApiClient): Promise<void> {
    if (this.token.length === 0) return;
    try {
      await api.unregisterPushDevice(this.token);
    } catch {
      // The server also expires inactive tokens after provider delivery failures.
    } finally {
      this.token = '';
    }
  }
}
