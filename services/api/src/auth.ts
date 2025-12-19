import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AppConfig } from "./config";

export type AuthUser = {
  userId: string;
  username: string;
};

type AccessTokenPayload = {
  sub: string;
  username: string;
  typ: "access";
};

type RefreshTokenPayload = {
  sub: string;
  username: string;
  typ: "refresh";
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(cfg: AppConfig, user: AuthUser): { token: string; expiresIn: number } {
  if (!cfg.jwtAccessSecret) {
    throw new Error("JWT_ACCESS_SECRET is required when AUTH_REQUIRED=true");
  }
  const expiresIn = cfg.jwtAccessExpiresInSeconds;
  const payload: AccessTokenPayload = { sub: user.userId, username: user.username, typ: "access" };
  const token = jwt.sign(payload, cfg.jwtAccessSecret, { expiresIn });
  return { token, expiresIn };
}

export function signRefreshToken(cfg: AppConfig, user: AuthUser): { refreshToken: string; expiresIn: number } {
  if (!cfg.jwtRefreshSecret) {
    throw new Error("JWT_REFRESH_SECRET is required when AUTH_REQUIRED=true");
  }
  const expiresIn = cfg.jwtRefreshExpiresInSeconds;
  const payload: RefreshTokenPayload = { sub: user.userId, username: user.username, typ: "refresh" };
  const refreshToken = jwt.sign(payload, cfg.jwtRefreshSecret, { expiresIn });
  return { refreshToken, expiresIn };
}

export function verifyAccessToken(cfg: AppConfig, token: string): AuthUser | null {
  if (!cfg.jwtAccessSecret) return null;
  try {
    const decoded = jwt.verify(token, cfg.jwtAccessSecret) as Partial<AccessTokenPayload>;
    if (decoded.typ !== "access") return null;
    if (typeof decoded.sub !== "string" || typeof decoded.username !== "string") return null;
    return { userId: decoded.sub, username: decoded.username };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(cfg: AppConfig, token: string): AuthUser | null {
  if (!cfg.jwtRefreshSecret) return null;
  try {
    const decoded = jwt.verify(token, cfg.jwtRefreshSecret) as Partial<RefreshTokenPayload>;
    if (decoded.typ !== "refresh") return null;
    if (typeof decoded.sub !== "string" || typeof decoded.username !== "string") return null;
    return { userId: decoded.sub, username: decoded.username };
  } catch {
    return null;
  }
}

