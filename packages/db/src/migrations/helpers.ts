import { MongoServerError, type Db, type Document } from "mongodb";

export type BsonType =
  | "string"
  | "bool"
  | "date"
  | "int"
  | "long"
  | "double"
  | "object"
  | "array"
  | "null"
  | "binData"
  | "number";

/**
 * A light MongoDB validator: the listed fields must exist with these BSON types. Zod schemas in
 * @pc/schema do the full validation before every write; this is the database-level backstop.
 */
export function requireFields(fields: Record<string, BsonType | BsonType[]>): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: Object.keys(fields),
      properties: Object.fromEntries(
        Object.entries(fields).map(([name, type]) => [name, { bsonType: type }]),
      ),
    },
  };
}

export const timestamps = { createdAt: "date", updatedAt: "date" } as const;
export const nullableDate: BsonType[] = ["date", "null"];
export const nullableString: BsonType[] = ["string", "null"];
export const number: BsonType[] = ["int", "long", "double"];

/** Creates the collection with a validator, or applies the validator if it already exists. */
export async function ensureCollection(db: Db, name: string, validator: Document): Promise<void> {
  const options = { validator, validationLevel: "moderate", validationAction: "error" } as const;
  try {
    await db.createCollection(name, options);
  } catch (error) {
    // 48 = NamespaceExists: apply the validator to the existing collection instead.
    if (error instanceof MongoServerError && error.code === 48) {
      await db.command({ collMod: name, ...options });
    } else {
      throw error;
    }
  }
}

/** Drops an index if it exists (27 = IndexNotFound, 26 = NamespaceNotFound). */
export async function dropIndexIfExists(db: Db, collection: string, index: string): Promise<void> {
  try {
    await db.collection(collection).dropIndex(index);
  } catch (error) {
    if (error instanceof MongoServerError && (error.code === 27 || error.code === 26)) return;
    throw error;
  }
}
