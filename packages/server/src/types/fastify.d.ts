import type { AuthUser } from "../auth/middleware.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser | null;
  }
}