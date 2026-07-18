import asset from '@ohos.security.asset';
import util from '@ohos.util';

const SESSION_ALIAS: string = 'landslide_monitor_session_v1';

export interface SecureSession {
  apiBaseUrl: string;
  username: string;
  userName: string;
  accessToken: string;
  refreshToken: string;
}

export class SessionStore {
  private static encoder: util.TextEncoder = new util.TextEncoder();
  private static decoder: util.TextDecoder = new util.TextDecoder();

  private static aliasBytes(): Uint8Array {
    return SessionStore.encoder.encodeInto(SESSION_ALIAS);
  }

  private static queryMap(returnSecret: boolean = false): asset.AssetMap {
    const query: asset.AssetMap = new Map<asset.Tag, asset.Value>();
    query.set(asset.Tag.ALIAS, SessionStore.aliasBytes());
    if (returnSecret) query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    return query;
  }

  static async load(): Promise<SecureSession | null> {
    try {
      const results = await asset.query(SessionStore.queryMap(true));
      if (results.length === 0) return null;
      const secret = results[0].get(asset.Tag.SECRET);
      if (!(secret instanceof Uint8Array)) return null;
      const session = JSON.parse(SessionStore.decoder.decodeToString(secret)) as SecureSession;
      if (!session.apiBaseUrl || !session.username || !session.accessToken || !session.refreshToken) return null;
      return session;
    } catch {
      return null;
    }
  }

  static async save(session: SecureSession): Promise<void> {
    const secret = SessionStore.encoder.encodeInto(JSON.stringify(session));
    const update: asset.AssetMap = new Map<asset.Tag, asset.Value>();
    update.set(asset.Tag.SECRET, secret);
    try {
      await asset.update(SessionStore.queryMap(), update);
      return;
    } catch {
      const attributes: asset.AssetMap = new Map<asset.Tag, asset.Value>();
      attributes.set(asset.Tag.ALIAS, SessionStore.aliasBytes());
      attributes.set(asset.Tag.SECRET, secret);
      attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
      try {
        await asset.add(attributes);
      } catch {
        // Saving a session is best-effort; the current process can continue with in-memory tokens.
      }
    }
  }

  static async clear(): Promise<void> {
    try {
      await asset.remove(SessionStore.queryMap());
    } catch {
      // Missing or temporarily unavailable secure storage must not block logout.
    }
  }
}
