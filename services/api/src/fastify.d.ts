import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
  }
}

