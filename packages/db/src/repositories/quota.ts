import { PLAN_STORAGE_BYTES, planSchema, type Plan } from "@pc/schema";
import { ObjectId, type ClientSession } from "mongodb";

import type { TypedCollections } from "../collections";
import { InvalidRequestError } from "../errors";

/** Better Auth user ids are ObjectIds; the rest of the data refers to them by hex string. */
export function userObjectId(userId: string): ObjectId {
  if (!ObjectId.isValid(userId) || userId.length !== 24) {
    throw new InvalidRequestError("unknown_user", "That account does not exist");
  }
  return ObjectId.createFromHexString(userId);
}

export interface StorageAccount {
  plan: Plan;
  usedBytes: number;
  limitBytes: number;
}

export async function storageAccount(c: TypedCollections, userId: string): Promise<StorageAccount> {
  const user = await c.users.findOne({ _id: userObjectId(userId) });
  if (!user) throw new InvalidRequestError("unknown_user", "That account does not exist");
  const plan = planSchema.catch("free").parse(user.plan);
  return { plan, usedBytes: user.storageUsedBytes ?? 0, limitBytes: PLAN_STORAGE_BYTES[plan] };
}

export const quotaExceeded = () =>
  new InvalidRequestError("quota_exceeded", "This workspace's storage is full");

/**
 * Adds `bytes` to the user's usage only if the total stays within their plan, in one atomic
 * update, so parallel uploads cannot both slip under the limit. Throws `quota_exceeded`.
 */
export async function chargeStorage(
  c: TypedCollections,
  userId: string,
  bytes: number,
  session?: ClientSession,
): Promise<void> {
  const { limitBytes } = await storageAccount(c, userId);
  const result = await c.users.updateOne(
    {
      _id: userObjectId(userId),
      $expr: { $lte: [{ $add: [{ $ifNull: ["$storageUsedBytes", 0] }, bytes] }, limitBytes] },
    },
    { $inc: { storageUsedBytes: bytes } },
    session ? { session } : {},
  );
  if (result.modifiedCount !== 1) throw quotaExceeded();
}

/** Gives bytes back (rejected or deleted files). Never goes below zero. */
export async function refundStorage(
  c: TypedCollections,
  userId: string,
  bytes: number,
  session?: ClientSession,
): Promise<void> {
  if (!ObjectId.isValid(userId) || userId.length !== 24 || bytes <= 0) return;
  await c.users.updateOne(
    { _id: ObjectId.createFromHexString(userId) },
    [
      {
        $set: {
          storageUsedBytes: {
            $max: [0, { $subtract: [{ $ifNull: ["$storageUsedBytes", 0] }, bytes] }],
          },
        },
      },
    ],
    session ? { session } : {},
  );
}
