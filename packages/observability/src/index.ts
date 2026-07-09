import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(service: string): Logger {
  return pino({
    base: { service },
    level: process.env.LOG_LEVEL ?? "info"
  });
}

export function newTraceId(): string {
  return crypto.randomUUID();
}

