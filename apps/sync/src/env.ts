import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Cloud Run sets PORT. Locally SYNC_PORT (or the default) is used. */
    PORT: z.coerce.number().int().positive().optional(),
    SYNC_PORT: z.coerce.number().int().positive().default(1234),
    /** Verifies the tokens the web app signs. Must match the web app's value. */
    SYNC_JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export const port = env.PORT ?? env.SYNC_PORT;
