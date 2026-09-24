/**
 * AWS Lambda entry (deployed environments): jobs arrive from SQS. The MongoDB URI is read from
 * SSM Parameter Store once per container; S3 access comes from the function's role.
 */
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createFileRepositories, createMongo, createRepositories } from "@pc/db";
import { createStorage, storageConfigFromEnv, storageEnv } from "@pc/storage";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import type { WorkerServices } from "./jobs";
import { createSqsHandler } from "./sqs";

const env = createEnv({
  server: {
    ...storageEnv,
    /** Lambda sets this. */
    AWS_REGION: z.string().min(1),
    /** SSM SecureString holding the MongoDB connection string. */
    MONGODB_URI_PARAMETER: z.string().startsWith("/"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

async function createServices(): Promise<WorkerServices> {
  const ssm = new SSMClient({ region: env.AWS_REGION });
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: env.MONGODB_URI_PARAMETER, WithDecryption: true }),
  );
  const uri = Parameter?.Value ?? "";
  if (!uri.startsWith("mongodb")) throw new Error("The MongoDB URI parameter is not set");
  // Small pool: each Lambda container handles one batch at a time.
  const mongo = createMongo(uri, { appName: "paper-chalk-workers", maxPoolSize: 2 });
  const storage = createStorage(storageConfigFromEnv(env));
  return { files: createFileRepositories(mongo, storage), jobs: createRepositories(mongo).jobs };
}

let services: Promise<WorkerServices> | undefined;

export const handler = createSqsHandler(() => {
  services ??= createServices().catch((error: unknown) => {
    // Let the next invocation try again instead of caching the failure.
    services = undefined;
    throw error;
  });
  return services;
});
