import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Cloud Run sets PORT. Locally WORKERS_PORT (or the default) is used. */
    PORT: z.coerce.number().int().positive().optional(),
    WORKERS_PORT: z.coerce.number().int().positive().default(8081),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export const port = env.PORT ?? env.WORKERS_PORT;
