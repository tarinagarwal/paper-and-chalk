import { z } from "zod";

/** RFC 4122 UUID, used for every entity id. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** Fractional index string used for ordering (z-order, page order, layer order). */
export const fractionalIndexSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[0-9A-Za-z]+$/, "fractional index must be base-62");

/** #rgb, #rgba, #rrggbb or #rrggbbaa. */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "expected a hex color");

export const finiteNumber = z.number().refine(Number.isFinite, "expected a finite number");

/** Size in points (1/72 in). */
export const positivePoints = z.number().positive().refine(Number.isFinite);

export const pointSchema = z.object({ x: finiteNumber, y: finiteNumber });
export type Point = z.infer<typeof pointSchema>;

/** Unix epoch milliseconds. */
export const epochMsSchema = z.int().nonnegative();
