import { createHash } from "node:crypto";

/**
 * Generates a deterministic Sanity `_key` from a string seed.
 * Uses a short hash so keys stay compact but unique within an array.
 */
export function sanityKey(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 12);
}
