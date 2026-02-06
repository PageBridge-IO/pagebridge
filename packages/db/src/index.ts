import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

// Re-export commonly used drizzle-orm functions
export { eq, desc, asc, and, or, sql, gte, lte } from "drizzle-orm";

export type DrizzleClient = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const sql = postgres(connectionString);
  return drizzle(sql, { schema });
}

export function createDbWithClient(sql: postgres.Sql) {
  return drizzle(sql, { schema });
}
