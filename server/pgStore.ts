import pg from "pg";
import type { DataStore, WorkspaceStores } from "../shared/store";
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

/** All workspaces' data in Postgres (Supabase or any Postgres 13+). */
export class PgStores implements WorkspaceStores {
  constructor(private pool: pg.Pool) {}

  forWorkspace(workspaceId: string): DataStore {
    return new PgStore(this.pool, this.pool, false, workspaceId);
  }

  async seedWorkspace(workspaceId: string, seed: SeedData): Promise<boolean> {
    return this.forWorkspace(workspaceId).transaction(async (tx) => {
      const self = tx as PgStore;
      await self.db.query("SELECT pg_advisory_xact_lock(hashtext('marketbing.seed:' || $1))", [workspaceId]);
      const { rows } = await self.db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM marketbing.influencers WHERE workspace_id = $1",
        [workspaceId],
      );
      if (rows[0].n > 0) return false;
      await self.insertSeed(seed);
      return true;
    });
  }
}

/**
 * One workspace's data in Postgres. Mirrors the SQLite layout: catalog
 * documents as jsonb, money and ledger as real columns. Every query is
 * filtered by workspace_id. A PgStore bound to a transaction client locks
 * the rows it reads for update, which serializes concurrent trades and
 * approvals.
 */
class PgStore implements DataStore {
  constructor(
    private pool: pg.Pool,
    readonly db: Queryable,
    private inTransaction: boolean,
    private ws: string,
  ) {}

  async insertSeed(seed: SeedData) {
    const q = (sql: string, params: unknown[]) => this.db.query(sql, params);
    for (const p of seed.products) {
      await q("INSERT INTO marketbing.products (workspace_id, id, doc) VALUES ($1, $2, $3)", [
        this.ws,
        p.id,
        JSON.stringify(p),
      ]);
    }
    for (const i of seed.influencers) {
      await q("INSERT INTO marketbing.influencers (workspace_id, id, doc) VALUES ($1, $2, $3)", [
        this.ws,
        i.id,
        JSON.stringify(i),
      ]);
    }
    for (const c of seed.campaigns) {
      await q(
        "INSERT INTO marketbing.campaigns (workspace_id, influencer_id, product_id, doc) VALUES ($1, $2, $3, $4)",
        [this.ws, c.influencerId, c.productId, JSON.stringify(c)],
      );
    }
    for (const a of seed.alerts) await this.saveAlert(a);
    for (const p of seed.positions) await this.savePosition(p);
    for (const t of seed.transactions) await this.addTransaction(t);
    await this.saveWallet(seed.wallet);
  }

  /** Runs sql with $1 bound to this workspace; further params are $2, $3, … */
  private async docs<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.db.query<{ doc: T }>(sql, [this.ws, ...params]);
    return rows.map((r) => r.doc);
  }

  private get lock() {
    return this.inTransaction ? " FOR UPDATE" : "";
  }

  listProducts(): Promise<Product[]> {
    return this.docs("SELECT doc FROM marketbing.products WHERE workspace_id = $1 ORDER BY id");
  }

  listInfluencers(): Promise<InfluencerProfile[]> {
    return this.docs("SELECT doc FROM marketbing.influencers WHERE workspace_id = $1 ORDER BY id");
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.docs(
      "SELECT doc FROM marketbing.campaigns WHERE workspace_id = $1 ORDER BY influencer_id, product_id",
    );
  }

  listAlerts(): Promise<CampaignAlert[]> {
    return this.docs("SELECT doc FROM marketbing.alerts WHERE workspace_id = $1 ORDER BY id");
  }

  async saveAlert(alert: CampaignAlert): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.alerts (workspace_id, id, influencer_id, resolved, doc) VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (workspace_id, id) DO UPDATE SET resolved = EXCLUDED.resolved, doc = EXCLUDED.doc",
      [this.ws, alert.id, alert.influencerId, alert.resolved, JSON.stringify(alert)],
    );
  }

  async getWallet(): Promise<Wallet> {
    const { rows } = await this.db.query<{ balance_lakh: string }>(
      `SELECT balance_lakh FROM marketbing.wallet WHERE workspace_id = $1${this.lock}`,
      [this.ws],
    );
    return { balanceLakh: rows.length ? Number(rows[0].balance_lakh) : 0 };
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.wallet (workspace_id, balance_lakh) VALUES ($1, $2) " +
        "ON CONFLICT (workspace_id) DO UPDATE SET balance_lakh = EXCLUDED.balance_lakh",
      [this.ws, wallet.balanceLakh],
    );
  }

  async listPositions(): Promise<Position[]> {
    const { rows } = await this.db.query<{ influencer_id: string; invested_lakh: string }>(
      "SELECT influencer_id, invested_lakh FROM marketbing.positions WHERE workspace_id = $1 ORDER BY influencer_id",
      [this.ws],
    );
    return rows.map((r) => ({ influencerId: r.influencer_id, investedLakh: Number(r.invested_lakh) }));
  }

  async savePosition(position: Position): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.positions (workspace_id, influencer_id, invested_lakh) VALUES ($1, $2, $3) " +
        "ON CONFLICT (workspace_id, influencer_id) DO UPDATE SET invested_lakh = EXCLUDED.invested_lakh",
      [this.ws, position.influencerId, position.investedLakh],
    );
  }

  async listTransactions(): Promise<Transaction[]> {
    const { rows } = await this.db.query<{
      id: string;
      influencer_id: string;
      type: Transaction["type"];
      amount_lakh: string;
      at: Date;
    }>(
      "SELECT id, influencer_id, type, amount_lakh, at FROM marketbing.transactions WHERE workspace_id = $1 ORDER BY at DESC",
      [this.ws],
    );
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
      "INSERT INTO marketbing.transactions (workspace_id, id, influencer_id, type, amount_lakh, at) " +
        "VALUES ($1, $2, $3, $4, $5, $6)",
      [this.ws, tx.id, tx.influencerId, tx.type, tx.amountLakh, new Date(tx.at)],
    );
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const [run] = await this.docs<RunRecord>(
      `SELECT doc FROM marketbing.runs WHERE workspace_id = $1 AND id = $2${this.lock}`,
      [id],
    );
    return run ?? null;
  }

  async saveRun(run: RunRecord): Promise<void> {
    await this.db.query(
      "INSERT INTO marketbing.runs (workspace_id, id, created_at, doc) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (workspace_id, id) DO UPDATE SET doc = EXCLUDED.doc",
      [this.ws, run.id, new Date(run.createdAt), JSON.stringify(run)],
    );
  }

  async transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PgStore(this.pool, client, true, this.ws));
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
