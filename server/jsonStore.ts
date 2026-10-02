import fs from "node:fs";
import { MemoryStore, type DataStore, type MutableState, type WorkspaceStores } from "../shared/store";
import type { SeedData } from "../shared/seed";

/**
 * Workspaces kept in memory and saved to one JSON file, for runtimes that
 * cannot load SQLite (e.g. StackBlitz WebContainers). Every workspace
 * shares the catalog from the config/ folder; only its mutable state
 * (wallet, positions, ledger, alerts, runs) is saved.
 */
export class JsonStores implements WorkspaceStores {
  private workspaces = new Map<string, MemoryStore>();
  private states: Record<string, MutableState> = {};

  constructor(
    private file: string,
    private seed: SeedData,
  ) {
    if (!fs.existsSync(file)) return;
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as
      | { workspaces: Record<string, MutableState> }
      | MutableState;
    // Files from before workspaces hold a single state: it is the default workspace's.
    this.states = "workspaces" in saved ? saved.workspaces : { default: saved };
    for (const [id, state] of Object.entries(this.states)) this.workspaces.set(id, this.open(id, state));
  }

  private open(id: string, state?: MutableState) {
    return new MemoryStore(this.seed, state, (next) => {
      this.states[id] = next;
      fs.writeFileSync(this.file, JSON.stringify({ workspaces: this.states }));
    });
  }

  forWorkspace(workspaceId: string): DataStore {
    const store = this.workspaces.get(workspaceId);
    if (!store) throw new Error(`Workspace ${workspaceId} has no data`);
    return store;
  }

  async seedWorkspace(workspaceId: string, seed: SeedData): Promise<boolean> {
    if (this.workspaces.has(workspaceId)) return false;
    const store = new MemoryStore(seed);
    this.workspaces.set(workspaceId, this.open(workspaceId));
    // Save straight away so the new workspace exists on disk before its first change.
    this.states[workspaceId] = {
      alerts: await store.listAlerts(),
      positions: await store.listPositions(),
      transactions: await store.listTransactions(),
      wallet: await store.getWallet(),
      runs: [],
    };
    fs.writeFileSync(this.file, JSON.stringify({ workspaces: this.states }));
    return true;
  }
}
