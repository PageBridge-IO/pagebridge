import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

// Re-export commonly used drizzle-orm functions
export { eq, desc, asc, and, or, sql, gte, lte } from "drizzle-orm";

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type DrizzleClient = Db;

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  const db: Db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export async function runMigrations(connectionString: string, migrationsFolder: string) {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await client.end();
}
