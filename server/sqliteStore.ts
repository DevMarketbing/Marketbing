import Database from "better-sqlite3";
import type { DataStore } from "../shared/store";
import type {
  Campaign,
  CampaignAlert,
  InfluencerProfile,
  Position,
  Product,
  RunRecord,
  Transaction,
  Wallet,
} from "../shared/types";
import type { SeedData } from "../shared/seed";

/**
 * SQLite-backed DataStore.
 *
 * Catalog entities (influencers, products, campaigns) and documents with
 * deep nesting are stored as JSON documents keyed by id — a deliberate
 * v1 choice that keeps the schema small while remaining queryable via
 * SQLite's JSON functions. Hot mutable scalars (wallet, positions) get
 * real columns. The database file is created and seeded on first boot.
 */
export class SqliteStore implements DataStore {
  private db: Database.Database;

  constructor(file: string, seed: SeedData) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.seedIfEmpty(seed);
  }

  /** True when the database was already populated before this boot. */
  public wasAlreadySeeded = false;

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products      (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS influencers   (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS campaigns     (influencer_id TEXT NOT NULL, product_id TEXT NOT NULL,
                                                doc TEXT NOT NULL, PRIMARY KEY (influencer_id, product_id));
      CREATE TABLE IF NOT EXISTS alerts        (id TEXT PRIMARY KEY, influencer_id TEXT NOT NULL,
                                                resolved INTEGER NOT NULL DEFAULT 0, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS positions     (influencer_id TEXT PRIMARY KEY, invested_lakh REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS transactions  (id TEXT PRIMARY KEY, at INTEGER NOT NULL, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wallet        (id INTEGER PRIMARY KEY CHECK (id = 1), balance_lakh REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS runs          (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, doc TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_alerts_influencer ON alerts (influencer_id);
    `);
  }

  private seedIfEmpty(seed: SeedData) {
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM influencers").get() as { n: number };
    if (count.n > 0) {
      this.wasAlreadySeeded = true;
      return;
    }
    const tx = this.db.transaction(() => {
      const insProduct = this.db.prepare("INSERT INTO products (id, doc) VALUES (?, ?)");
      for (const p of seed.products) insProduct.run(p.id, JSON.stringify(p));
      const insInf = this.db.prepare("INSERT INTO influencers (id, doc) VALUES (?, ?)");
      for (const i of seed.influencers) insInf.run(i.id, JSON.stringify(i));
      const insCampaign = this.db.prepare(
        "INSERT INTO campaigns (influencer_id, product_id, doc) VALUES (?, ?, ?)",
      );
      for (const c of seed.campaigns) insCampaign.run(c.influencerId, c.productId, JSON.stringify(c));
      const insAlert = this.db.prepare(
        "INSERT INTO alerts (id, influencer_id, resolved, doc) VALUES (?, ?, ?, ?)",
      );
      for (const a of seed.alerts) insAlert.run(a.id, a.influencerId, a.resolved ? 1 : 0, JSON.stringify(a));
      const insPos = this.db.prepare("INSERT INTO positions (influencer_id, invested_lakh) VALUES (?, ?)");
      for (const p of seed.positions) insPos.run(p.influencerId, p.investedLakh);
      const insTx = this.db.prepare("INSERT INTO transactions (id, at, doc) VALUES (?, ?, ?)");
      for (const t of seed.transactions) insTx.run(t.id, t.at, JSON.stringify(t));
      this.db.prepare("INSERT INTO wallet (id, balance_lakh) VALUES (1, ?)").run(seed.wallet.balanceLakh);
    });
    tx();
  }

  private docs<T>(sql: string, ...params: unknown[]): T[] {
    return (this.db.prepare(sql).all(...params) as { doc: string }[]).map((r) => JSON.parse(r.doc) as T);
  }

  async listProducts(): Promise<Product[]> {
    return this.docs<Product>("SELECT doc FROM products");
  }

  async listInfluencers(): Promise<InfluencerProfile[]> {
    return this.docs<InfluencerProfile>("SELECT doc FROM influencers");
  }

  async listCampaigns(): Promise<Campaign[]> {
    return this.docs<Campaign>("SELECT doc FROM campaigns");
  }

  async listAlerts(): Promise<CampaignAlert[]> {
    return this.docs<CampaignAlert>("SELECT doc FROM alerts");
  }

  async saveAlert(alert: CampaignAlert): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO alerts (id, influencer_id, resolved, doc) VALUES (@id, @inf, @res, @doc) " +
          "ON CONFLICT(id) DO UPDATE SET resolved = @res, doc = @doc",
      )
      .run({ id: alert.id, inf: alert.influencerId, res: alert.resolved ? 1 : 0, doc: JSON.stringify(alert) });
  }

  async getWallet(): Promise<Wallet> {
    const row = this.db.prepare("SELECT balance_lakh FROM wallet WHERE id = 1").get() as
      | { balance_lakh: number }
      | undefined;
    return { balanceLakh: row?.balance_lakh ?? 0 };
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO wallet (id, balance_lakh) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET balance_lakh = excluded.balance_lakh",
      )
      .run(wallet.balanceLakh);
  }

  async listPositions(): Promise<Position[]> {
    return (this.db.prepare("SELECT influencer_id, invested_lakh FROM positions").all() as {
      influencer_id: string;
      invested_lakh: number;
    }[]).map((r) => ({ influencerId: r.influencer_id, investedLakh: r.invested_lakh }));
  }

  async savePosition(position: Position): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO positions (influencer_id, invested_lakh) VALUES (?, ?) " +
          "ON CONFLICT(influencer_id) DO UPDATE SET invested_lakh = excluded.invested_lakh",
      )
      .run(position.influencerId, position.investedLakh);
  }

  async listTransactions(): Promise<Transaction[]> {
    return this.docs<Transaction>("SELECT doc FROM transactions ORDER BY at DESC");
  }

  async addTransaction(tx: Transaction): Promise<void> {
    this.db.prepare("INSERT INTO transactions (id, at, doc) VALUES (?, ?, ?)").run(tx.id, tx.at, JSON.stringify(tx));
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const row = this.db.prepare("SELECT doc FROM runs WHERE id = ?").get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as RunRecord) : null;
  }

  async saveRun(run: RunRecord): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO runs (id, created_at, doc) VALUES (@id, @at, @doc) ON CONFLICT(id) DO UPDATE SET doc = @doc",
      )
      .run({ id: run.id, at: run.createdAt, doc: JSON.stringify(run) });
  }

  // Store calls never wait on I/O, so no other request can run between BEGIN and COMMIT.
  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    if (this.db.inTransaction) return fn(this);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
