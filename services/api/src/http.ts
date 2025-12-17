import type { FastifyReply } from "fastify";

export type ApiSuccess<T> = {
  success: true;
  code: number;
  message: string;
  data: T;
  timestamp: string;
  traceId: string;
};

export type ApiError = {
  success: false;
  code: number;
  message: string;
  error?: Record<string, unknown>;
  timestamp: string;
  traceId: string;
};

export function ok(reply: FastifyReply, data: unknown, traceId: string): void {
  const payload: ApiSuccess<unknown> = {
    success: true,
    code: 200,
    message: "ok",
    data,
    timestamp: new Date().toISOString(),
    traceId
  };
  void reply.code(200).send(payload);
}

export function fail(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  traceId: string,
  error?: Record<string, unknown>
): void {
  const payload: ApiError = {
    success: false,
    code: statusCode,
    message,
    timestamp: new Date().toISOString(),
    traceId
  };
  if (error !== undefined) payload.error = error;
  void reply.code(statusCode).send(payload);
}
