import pg from "pg";
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

type Queryable = pg.Pool | pg.PoolClient;

/**
 * Postgres-backed DataStore (Supabase or any Postgres 13+). Mirrors the
 * SQLite layout: catalog documents as jsonb, money and ledger as real
 * columns. A PgStore bound to a transaction client locks the rows it reads
 * for update, which serializes concurrent trades and approvals.
 */
export class PgStore implements DataStore {
  private constructor(
    private pool: pg.Pool,
    private db: Queryable,
    private inTransaction: boolean,
  ) {}

  /** Seeds an empty database. Returns false if data was already there. */
  static async open(pool: pg.Pool, seed: SeedData): Promise<{ store: PgStore; seeded: boolean }> {
    const store = new PgStore(pool, pool, false);
    const seeded = await store.transaction(async (tx) => {
      const self = tx as PgStore;
      await self.db.query("SELECT pg_advisory_xact_lock(hashtext('marketbing.seed'))");
      const { rows } = await self.db.query<{ n: number }>("SELECT count(*)::int AS n FROM marketbing.influencers");
      if (rows[0].n > 0) return false;
      await self.insertSeed(seed);
      return true;
    });
    return { store, seeded };
  }

  private async insertSeed(seed: SeedData) {
    const q = (sql: string, params: unknown[]) => this.db.query(sql, params);
    for (const p of seed.products) {
      await q("INSERT INTO marketbing.products (id, doc) VALUES ($1, $2)", [p.id, JSON.stringify(p)]);
    }
    for (const i of seed.influencers) {
      await q("INSERT INTO marketbing.influencers (id, doc) VALUES ($1, $2)", [i.id, JSON.stringify(i)]);
    }
    for (const c of seed.campaigns) {
      await q("INSERT INTO marketbing.campaigns (influencer_id, product_id, doc) VALUES ($1, $2, $3)", [
        c.influencerId,
        c.productId,
        JSON.stringify(c),
      ]);
    }
    for (const a of seed.alerts) await this.saveAlert(a);
    for (const p of seed.positions) await this.savePosition(p);
    for (const t of seed.transactions) await this.addTransaction(t);
    await this.saveWallet(seed.wallet);
  }

  private async docs<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.db.query<{ doc: T }>(sql, params);
    return rows.map((r) => r.doc);
  }

  private get lock() {
    return this.inTransaction ? " FOR UPDATE" : "";
  }

  listProducts(): Promise<Product[]> {
    return this.docs("SELECT doc FROM marketbing.products ORDER BY id");
  }

  listInfluencers(): Promise<InfluencerProfile[]> {
    return this.docs("SELECT doc FROM marketbing.influencers ORDER BY id");
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.docs("SELECT doc FROM marketbing.campaigns ORDER BY influencer_id, product_id");
  }

  listAlerts(): Promise<CampaignAlert[]> {
    return this.docs("SELECT doc FROM marketbing.alerts ORDER BY id");
  }

  async saveAlert(alert: CampaignAlert): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.alerts (id, influencer_id, resolved, doc) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (id) DO UPDATE SET resolved = EXCLUDED.resolved, doc = EXCLUDED.doc",
      [alert.id, alert.influencerId, alert.resolved, JSON.stringify(alert)],
    );
  }

  async getWallet(): Promise<Wallet> {
    const { rows } = await this.db.query<{ balance_lakh: string }>(
      `SELECT balance_lakh FROM marketbing.wallet WHERE id = 1${this.lock}`,
    );
    return { balanceLakh: rows.length ? Number(rows[0].balance_lakh) : 0 };
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.wallet (id, balance_lakh) VALUES (1, $1) " +
        "ON CONFLICT (id) DO UPDATE SET balance_lakh = EXCLUDED.balance_lakh",
      [wallet.balanceLakh],
    );
  }

  async listPositions(): Promise<Position[]> {
    const { rows } = await this.db.query<{ influencer_id: string; invested_lakh: string }>(
      "SELECT influencer_id, invested_lakh FROM marketbing.positions ORDER BY influencer_id",
    );
    return rows.map((r) => ({ influencerId: r.influencer_id, investedLakh: Number(r.invested_lakh) }));
  }

  async savePosition(position: Position): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.positions (influencer_id, invested_lakh) VALUES ($1, $2) " +
        "ON CONFLICT (influencer_id) DO UPDATE SET invested_lakh = EXCLUDED.invested_lakh",
      [position.influencerId, position.investedLakh],
    );
  }

  async listTransactions(): Promise<Transaction[]> {
    const { rows } = await this.db.query<{
      id: string;
      influencer_id: string;
      type: Transaction["type"];
      amount_lakh: string;
      at: Date;
    }>("SELECT id, influencer_id, type, amount_lakh, at FROM marketbing.transactions ORDER BY at DESC");
    return rows.map((r) => ({
      id: r.id,
      influencerId: r.influencer_id,
      type: r.type,
      amountLakh: Number(r.amount_lakh),
      at: r.at.getTime(),
    }));
  }

  async addTransaction(tx: Transaction): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.transactions (id, influencer_id, type, amount_lakh, at) VALUES ($1, $2, $3, $4, $5)",
      [tx.id, tx.influencerId, tx.type, tx.amountLakh, new Date(tx.at)],
    );
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const [run] = await this.docs<RunRecord>(`SELECT doc FROM marketbing.runs WHERE id = $1${this.lock}`, [id]);
    return run ?? null;
  }

  async saveRun(run: RunRecord): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.runs (id, created_at, doc) VALUES ($1, $2, $3) " +
        "ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc",
      [run.id, new Date(run.createdAt), JSON.stringify(run)],
    );
  }

  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PgStore(this.pool, client, true));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}
