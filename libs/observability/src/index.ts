import crypto from "node:crypto";
import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(service: string): Logger {
  return pino({
    base: { service },
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "password",
        "*.password",
        "token",
        "*.token",
        "secret",
        "*.secret",
        "authorization",
        "headers.authorization",
        "req.headers.authorization",
        "deviceSecret",
        "*.deviceSecret",
        "device_secret",
        "*.device_secret",
        "device_secret_hash",
        "*.device_secret_hash",
        "raw_payload",
        "*.raw_payload"
      ],
      censor: "[REDACTED]"
    }
  });
}

export function newTraceId(): string {
  return crypto.randomUUID();
}
