import type {
  Campaign,
  CampaignAlert,
  InfluencerProfile,
  Position,
  Product,
  RunRecord,
  Transaction,
  Wallet,
} from "./types";
import type { SeedData } from "./seed";

/**
 * Persistence boundary. The API server implements this over Postgres
 * (e.g. Supabase) or SQLite; the embedded (in-browser demo) runtime
 * implements it over memory +
 * localStorage. Service logic in services.ts only ever talks to this
 * interface, so swapping storage never touches business rules.
 */
export interface DataStore {
  listProducts(): Promise<Product[]>;
  listInfluencers(): Promise<InfluencerProfile[]>;
  listCampaigns(): Promise<Campaign[]>;
  listAlerts(): Promise<CampaignAlert[]>;
  saveAlert(alert: CampaignAlert): Promise<void>;

  /** Inside transaction(), locks the wallet row until commit. */
  getWallet(): Promise<Wallet>;
  saveWallet(wallet: Wallet): Promise<void>;
  listPositions(): Promise<Position[]>;
  savePosition(position: Position): Promise<void>;
  listTransactions(): Promise<Transaction[]>;
  addTransaction(tx: Transaction): Promise<void>;

  /** Inside transaction(), locks the run row until commit. */
  getRun(id: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;

  /** Runs fn atomically: all of its writes commit together or not at all. */
  transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T>;
}

/** In-memory DataStore over a seed snapshot, with an optional persist hook. */
export class MemoryStore implements DataStore {
  private alerts: Map<string, CampaignAlert>;
  private positions: Map<string, Position>;
  private transactions: Transaction[];
  private wallet: Wallet;
  private runs: Map<string, RunRecord> = new Map();

  constructor(
    private seed: SeedData,
    mutable?: MutableState,
    private onChange?: (state: MutableState) => void,
  ) {
    const m = mutable ?? {
      alerts: seed.alerts,
      positions: seed.positions,
      transactions: seed.transactions,
      wallet: seed.wallet,
      runs: [],
    };
    this.alerts = new Map(m.alerts.map((a) => [a.id, a]));
    this.positions = new Map(m.positions.map((p) => [p.influencerId, p]));
    this.transactions = [...m.transactions];
    this.wallet = { ...m.wallet };
    this.runs = new Map(m.runs.map((r) => [r.id, r]));
  }

  private persist() {
    this.onChange?.({
      alerts: [...this.alerts.values()],
      positions: [...this.positions.values()],
      transactions: this.transactions,
      wallet: this.wallet,
      runs: [...this.runs.values()],
    });
  }

  async listProducts() { return this.seed.products; }
  async listInfluencers() { return this.seed.influencers; }
  async listCampaigns() { return this.seed.campaigns; }
  async listAlerts() { return [...this.alerts.values()]; }
  async saveAlert(alert: CampaignAlert) { this.alerts.set(alert.id, alert); this.persist(); }

  async getWallet() { return { ...this.wallet }; }
  async saveWallet(wallet: Wallet) { this.wallet = { ...wallet }; this.persist(); }
  async listPositions() { return [...this.positions.values()]; }
  async savePosition(position: Position) { this.positions.set(position.influencerId, position); this.persist(); }
  async listTransactions() { return [...this.transactions]; }
  async addTransaction(tx: Transaction) { this.transactions.push(tx); this.persist(); }

  async getRun(id: string) { return this.runs.get(id) ?? null; }
  async saveRun(run: RunRecord) { this.runs.set(run.id, run); this.persist(); }

  // Single-threaded and services validate before writing, so no rollback is needed.
  transaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T> { return fn(this); }
}

/** The mutable subset of state a MemoryStore persists between sessions. */
export interface MutableState {
  alerts: CampaignAlert[];
  positions: Position[];
  transactions: Transaction[];
  wallet: Wallet;
  runs: RunRecord[];
}
