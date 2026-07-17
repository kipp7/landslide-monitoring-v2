import "fastify";
import type { AuthUser } from "./auth";

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
    startTimeMs: number;
    user: AuthUser | null;
  }
}
