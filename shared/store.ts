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
 * Persistence boundary. The API server implements this over SQLite; the
 * embedded (in-browser demo) runtime implements it over memory +
 * localStorage. Service logic in services.ts only ever talks to this
 * interface, so swapping storage never touches business rules.
 */
export interface DataStore {
  listProducts(): Product[];
  listInfluencers(): InfluencerProfile[];
  listCampaigns(): Campaign[];
  listAlerts(): CampaignAlert[];
  saveAlert(alert: CampaignAlert): void;

  getWallet(): Wallet;
  saveWallet(wallet: Wallet): void;
  listPositions(): Position[];
  savePosition(position: Position): void;
  listTransactions(): Transaction[];
  addTransaction(tx: Transaction): void;

  getRun(id: string): RunRecord | null;
  saveRun(run: RunRecord): void;
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

  listProducts() { return this.seed.products; }
  listInfluencers() { return this.seed.influencers; }
  listCampaigns() { return this.seed.campaigns; }
  listAlerts() { return [...this.alerts.values()]; }
  saveAlert(alert: CampaignAlert) { this.alerts.set(alert.id, alert); this.persist(); }

  getWallet() { return { ...this.wallet }; }
  saveWallet(wallet: Wallet) { this.wallet = { ...wallet }; this.persist(); }
  listPositions() { return [...this.positions.values()]; }
  savePosition(position: Position) { this.positions.set(position.influencerId, position); this.persist(); }
  listTransactions() { return [...this.transactions]; }
  addTransaction(tx: Transaction) { this.transactions.push(tx); this.persist(); }

  getRun(id: string) { return this.runs.get(id) ?? null; }
  saveRun(run: RunRecord) { this.runs.set(run.id, run); this.persist(); }
}

/** The mutable subset of state a MemoryStore persists between sessions. */
export interface MutableState {
  alerts: CampaignAlert[];
  positions: Position[];
  transactions: Transaction[];
  wallet: Wallet;
  runs: RunRecord[];
}
