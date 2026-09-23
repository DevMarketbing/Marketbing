import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class DbConfigError extends Error {}

/**
 * Builds a connection pool from DATABASE_URL (e.g. a Supabase connection
 * string). SSL is configured here rather than via ?sslmode= in the URL,
 * because node-postgres treats sslmode=require as full verification, which
 * fails against Supabase's private certificate authority unless its CA
 * certificate is supplied (DATABASE_CA_CERT).
 */
export function createPool(databaseUrl: string, caCertFile?: string): pg.Pool {
  if (databaseUrl.includes("[YOUR-PASSWORD]")) {
    throw new DbConfigError(
      "DATABASE_URL still contains [YOUR-PASSWORD]. Replace it (brackets included) with your database password.",
    );
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new DbConfigError(
      "DATABASE_URL is not a valid connection string. It should look like " +
        "postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new DbConfigError("DATABASE_URL must start with postgresql://");
  }
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }

  let ssl: pg.PoolConfig["ssl"];
  if (caCertFile) {
    if (!fs.existsSync(caCertFile)) {
      throw new DbConfigError(`DATABASE_CA_CERT points to "${caCertFile}", but no file exists there.`);
    }
    ssl = { ca: fs.readFileSync(caCertFile, "utf8") };
  } else if (!LOCAL_HOSTS.has(url.hostname)) {
    ssl = { rejectUnauthorized: false };
    console.warn(
      "Database connection is encrypted but the server's certificate is not verified. " +
        "Set DATABASE_CA_CERT to your Supabase CA certificate file to verify it (see .env.example).",
    );
  }

  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    connectionTimeoutMillis: 15_000,
  });
  // An idle connection dropped by the network must not crash the server.
  pool.on("error", (err) => console.error("Database connection error:", err.message));
  return pool;
}

/** Applies pending migrations/*.sql in order, once each, atomically. */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('marketbing.migrate'))");
    await client.query("CREATE SCHEMA IF NOT EXISTS marketbing");
    await client.query(
      "CREATE TABLE IF NOT EXISTS marketbing.schema_migrations " +
        "(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ version: string }>("SELECT version FROM marketbing.schema_migrations");
    const applied = new Set(rows.map((r) => r.version));
    const pending = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !applied.has(f))
      .sort();
    for (const file of pending) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      await client.query("INSERT INTO marketbing.schema_migrations (version) VALUES ($1)", [file]);
    }
    await client.query("COMMIT");
    return pending;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Host and database name only — never the password. */
export function describeTarget(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    return `${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/** Translates common connection failures into an actionable message. */
export function explainDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? String(err);
  if (err instanceof DbConfigError) return msg;
  if (e.code === "28P01" || /password authentication failed/i.test(msg)) {
    return "The database rejected the password in DATABASE_URL. Copy it again, or reset it in Supabase (Project Settings → Database). If the password contains characters like @ # / ? %, reset it to letters and numbers only.";
  }
  if (/tenant or user not found/i.test(msg)) {
    return "Supabase did not recognise the project. Check the user part of DATABASE_URL looks like postgres.<project-ref>, and that the project is not paused in the Supabase dashboard.";
  }
  if (e.code === "ENOTFOUND") {
    return "The database host in DATABASE_URL could not be found. Copy the connection string again from Supabase (Connect → Session pooler).";
  }
  if (e.code === "ENETUNREACH" || e.code === "EHOSTUNREACH") {
    return "The database host is unreachable from this machine. Supabase's direct connection uses IPv6 only — use the Session pooler connection string instead (Connect → Session pooler).";
  }
  if (e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT" || /timeout/i.test(msg)) {
    return "Could not reach the database. Check your internet connection and that the host and port in DATABASE_URL are right.";
  }
  if (e.code === "3D000") return "The database name at the end of DATABASE_URL does not exist (Supabase's is /postgres).";
  if (/certificate/i.test(msg)) {
    return `The database's SSL certificate could not be verified (${msg}). Check DATABASE_CA_CERT points to the certificate downloaded from your Supabase project.`;
  }
  return msg;
}
