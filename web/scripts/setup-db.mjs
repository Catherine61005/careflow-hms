// Cross-platform database setup (Windows / macOS / Linux): runs db/01..06 in order.
// Usage: npm run db:setup        (needs DATABASE_ADMIN_URL + HMS_APP_PASSWORD in .env.local)
// WARNING: 01_schema.sql drops and recreates the hms schema (all data is reset).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {
  const p = path.join(here, "..", f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const adminUrl = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.HMS_APP_PASSWORD;
if (!adminUrl || !appPassword) {
  console.error("Set DATABASE_ADMIN_URL and HMS_APP_PASSWORD in web/.env.local first (see .env.example)");
  process.exit(1);
}

const files = ["01_schema.sql", "02_functions_triggers.sql", "03_views.sql",
               "04_roles.sql", "05_alter_migration.sql", "06_seed.sql"];
const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
const db = (await client.query("SELECT current_database() AS d")).rows[0].d;
for (const f of files) {
  process.stdout.write(`Running ${f} ... `);
  await client.query(readFileSync(path.join(here, "../../db", f), "utf8"));
  console.log("ok");
}
// Identifiers cannot be bound parameters; values are escaped by the driver helpers
await client.query(`ALTER ROLE hms_app PASSWORD ${client.escapeLiteral(appPassword)}`);
await client.query("ALTER ROLE hms_app SET search_path = hms, public");
await client.query(`ALTER DATABASE ${client.escapeIdentifier(db)} SET timezone TO 'Asia/Kolkata'`);
console.log("Database ready. Next: npm run embed");
await client.end();
