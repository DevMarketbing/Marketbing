import fs from "node:fs";
import Database from "better-sqlite3";
import type pg from "pg";

/** A Facebook Page the connected account manages, and its linked Instagram account if any. */
export interface MetaPage {
  id: string;
  name: string;
  category?: string;
  /** Encrypted Page access token (TokenBox). */
  token: string;
  instagram?: {
    id: string;
    username: string;
    name?: string;
    pictureUrl?: string;
    followers?: number;
  };
}

export interface MetaAdAccount {
  /** "act_<number>" */
  id: string;
  name: string;
  currency: string;
  /** Meta's account_status: 1 = active, 2 = disabled, 3 = unsettled, … */
  status: number;
}

/** A workspace's link to Meta: the Facebook account that allowed access and what it manages. */
export interface MetaConnection {
  workspaceId: string;
  metaUserId: string;
  metaUserName: string;
  /** Encrypted long-lived user access token (TokenBox). */
  userToken: string;
  /** When the user token stops working (ms), or null if Meta gave no expiry. */
  tokenExpiresAt: number | null;
  grantedScopes: string[];
  declinedScopes: string[];
  /** Marketbing user who connected it. */
  connectedBy: string;
  connectedAt: number;
  refreshedAt: number;
  pages: MetaPage[];
  adAccounts: MetaAdAccount[];
}

/** Where Meta connections live. */
export interface MetaStore {
  get(workspaceId: string): Promise<MetaConnection | null>;
  save(connection: MetaConnection): Promise<void>;
  delete(workspaceId: string): Promise<void>;
  /** Removes every connection made with this Facebook account. Returns how many there were. */
  deleteByMetaUser(metaUserId: string): Promise<number>;
  saveDeletionRequest(code: string, completedAt: number): Promise<void>;
  getDeletionRequest(code: string): Promise<{ completedAt: number } | null>;
}

export class PgMetaStore implements MetaStore {
  constructor(private pool: pg.Pool) {}

  async get(workspaceId: string) {
    const { rows } = await this.pool.query<{ doc: MetaConnection }>(
      "SELECT doc FROM marketbing.meta_connections WHERE workspace_id = $1",
      [workspaceId],
    );
    return rows[0]?.doc ?? null;
  }

  async save(c: MetaConnection) {
    await this.pool.query(
      "INSERT INTO marketbing.meta_connections (workspace_id, meta_user_id, doc) VALUES ($1, $2, $3) " +
        "ON CONFLICT (workspace_id) DO UPDATE SET meta_user_id = EXCLUDED.meta_user_id, doc = EXCLUDED.doc, updated_at = now()",
      [c.workspaceId, c.metaUserId, JSON.stringify(c)],
    );
  }

  async delete(workspaceId: string) {
    await this.pool.query("DELETE FROM marketbing.meta_connections WHERE workspace_id = $1", [workspaceId]);
  }

  async deleteByMetaUser(metaUserId: string) {
    const { rowCount } = await this.pool.query("DELETE FROM marketbing.meta_connections WHERE meta_user_id = $1", [
      metaUserId,
    ]);
    return rowCount ?? 0;
  }

  async saveDeletionRequest(code: string, completedAt: number) {
    await this.pool.query(
      "INSERT INTO marketbing.meta_deletion_requests (code, completed_at) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING",
      [code, new Date(completedAt)],
    );
  }

  async getDeletionRequest(code: string) {
    const { rows } = await this.pool.query<{ completed_at: Date }>(
      "SELECT completed_at FROM marketbing.meta_deletion_requests WHERE code = $1",
      [code],
    );
    return rows.length ? { completedAt: rows[0].completed_at.getTime() } : null;
  }
}

export class SqliteMetaStore implements MetaStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta_connections (workspace_id TEXT PRIMARY KEY, meta_user_id TEXT NOT NULL,
                                                   doc TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS meta_connections_user_idx ON meta_connections (meta_user_id);
      CREATE TABLE IF NOT EXISTS meta_deletion_requests (code TEXT PRIMARY KEY, completed_at INTEGER NOT NULL);
    `);
  }

  async get(workspaceId: string) {
    const row = this.db.prepare("SELECT doc FROM meta_connections WHERE workspace_id = ?").get(workspaceId) as
      | { doc: string }
      | undefined;
    return row ? (JSON.parse(row.doc) as MetaConnection) : null;
  }

  async save(c: MetaConnection) {
    this.db
      .prepare(
        "INSERT INTO meta_connections (workspace_id, meta_user_id, doc) VALUES (?, ?, ?) " +
          "ON CONFLICT(workspace_id) DO UPDATE SET meta_user_id = excluded.meta_user_id, doc = excluded.doc",
      )
      .run(c.workspaceId, c.metaUserId, JSON.stringify(c));
  }

  async delete(workspaceId: string) {
    this.db.prepare("DELETE FROM meta_connections WHERE workspace_id = ?").run(workspaceId);
  }

  async deleteByMetaUser(metaUserId: string) {
    return this.db.prepare("DELETE FROM meta_connections WHERE meta_user_id = ?").run(metaUserId).changes;
  }

  async saveDeletionRequest(code: string, completedAt: number) {
    this.db.prepare("INSERT OR IGNORE INTO meta_deletion_requests (code, completed_at) VALUES (?, ?)").run(code, completedAt);
  }

  async getDeletionRequest(code: string) {
    const row = this.db.prepare("SELECT completed_at FROM meta_deletion_requests WHERE code = ?").get(code) as
      | { completed_at: number }
      | undefined;
    return row ? { completedAt: row.completed_at } : null;
  }
}

/** JSON-file MetaStore for runtimes where SQLite cannot load. */
export class JsonMetaStore implements MetaStore {
  private connections: MetaConnection[] = [];
  private deletions: { code: string; completedAt: number }[] = [];

  constructor(private file: string) {
    if (fs.existsSync(file)) Object.assign(this, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  private persist() {
    const { connections, deletions } = this;
    fs.writeFileSync(this.file, JSON.stringify({ connections, deletions }));
  }

  async get(workspaceId: string) {
    return this.connections.find((c) => c.workspaceId === workspaceId) ?? null;
  }

  async save(c: MetaConnection) {
    this.connections = [...this.connections.filter((x) => x.workspaceId !== c.workspaceId), c];
    this.persist();
  }

  async delete(workspaceId: string) {
    this.connections = this.connections.filter((c) => c.workspaceId !== workspaceId);
    this.persist();
  }

  async deleteByMetaUser(metaUserId: string) {
    const before = this.connections.length;
    this.connections = this.connections.filter((c) => c.metaUserId !== metaUserId);
    this.persist();
    return before - this.connections.length;
  }

  async saveDeletionRequest(code: string, completedAt: number) {
    if (!this.deletions.some((d) => d.code === code)) this.deletions.push({ code, completedAt });
    this.persist();
  }

  async getDeletionRequest(code: string) {
    const d = this.deletions.find((x) => x.code === code);
    return d ? { completedAt: d.completedAt } : null;
  }
}
