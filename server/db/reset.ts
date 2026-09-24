import { ROOT, jsonFallbackFile } from "../env";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { createPool, describeTarget, explainDbError } from "./postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  const dbFile = process.env.DB_FILE ?? path.join(ROOT, "data", "marketbing.db");
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`, jsonFallbackFile(dbFile)]) fs.rmSync(f, { force: true });
  console.log("Database cleared - it will be rebuilt from the config/ folder on next start.");
  process.exit(0);
}

const target = describeTarget(databaseUrl);
console.log(`This permanently deletes ALL Marketbing data in ${target}`);
console.log("(trades, runs, alerts, everything). It is rebuilt from the config/ folder on next start.");

let confirmed = process.argv.includes("--yes");
if (!confirmed) {
  if (!process.stdin.isTTY) {
    console.error("Refusing to reset without confirmation. Re-run with --yes to confirm.");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  confirmed = (await rl.question('Type RESET to continue: ')).trim() === "RESET";
  rl.close();
}
if (!confirmed) {
  console.log("Cancelled - nothing was deleted.");
  process.exit(0);
}

try {
  const pool = createPool(databaseUrl, process.env.DATABASE_CA_CERT?.trim() || undefined);
  await pool.query("DROP SCHEMA IF EXISTS marketbing CASCADE");
  await pool.end();
  console.log("Database cleared - it will be rebuilt from the config/ folder on next start.");
} catch (e) {
  console.error(`Could not reset the database: ${explainDbError(e)}`);
  process.exit(1);
}
