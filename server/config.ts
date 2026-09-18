import fs from "node:fs";
import path from "node:path";
import type { Product } from "../shared/types";
import type { EditableInfluencerSeed, SeedOverrides } from "../shared/seed";

/**
 * Loads the editable workspace configuration from the config/ folder.
 *
 * These are plain JSON files meant to be maintained by hand (see
 * config/README.md). Validation errors are collected and reported with
 * the file name and entry number so a non-developer can fix them.
 */
export function loadSeedOverrides(configDir: string): SeedOverrides {
  const errors: string[] = [];
  const overrides: SeedOverrides = {};

  const readJson = (name: string): unknown | undefined => {
    const file = path.join(configDir, name);
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${name}: not valid JSON — ${(e as Error).message}`);
      return undefined;
    }
  };

  /* ---- products.json ---- */
  const productsRaw = readJson("products.json");
  if (productsRaw !== undefined) {
    if (!Array.isArray(productsRaw)) {
      errors.push("products.json: expected a list [ ... ] of products");
    } else {
      const products: Product[] = [];
      productsRaw.forEach((p, i) => {
        const where = `products.json entry ${i + 1}`;
        if (typeof p !== "object" || p === null) return errors.push(`${where}: expected an object { ... }`);
        const { id, name, priceInr } = p as Record<string, unknown>;
        if (typeof id !== "string" || !id) errors.push(`${where}: "id" must be a short text like "glow-serum"`);
        if (typeof name !== "string" || !name) errors.push(`${where}: "name" is required`);
        if (typeof priceInr !== "number" || priceInr <= 0) errors.push(`${where}: "priceInr" must be a positive number`);
        products.push({ id: String(id), name: String(name), priceInr: Number(priceInr) });
      });
      overrides.products = products;
    }
  }

  /* ---- influencers.json ---- */
  const influencersRaw = readJson("influencers.json");
  if (influencersRaw !== undefined) {
    if (!Array.isArray(influencersRaw)) {
      errors.push("influencers.json: expected a list [ ... ] of influencers");
    } else {
      const productIds = new Set((overrides.products ?? []).map((p) => p.id));
      const seeds: EditableInfluencerSeed[] = [];
      influencersRaw.forEach((entry, i) => {
        const where = `influencers.json entry ${i + 1}`;
        if (typeof entry !== "object" || entry === null) return errors.push(`${where}: expected an object { ... }`);
        const e = entry as Record<string, unknown>;
        for (const field of ["name", "handle", "niche"] as const) {
          if (typeof e[field] !== "string" || !e[field]) errors.push(`${where}: "${field}" is required`);
        }
        if (!["macro", "mid", "micro"].includes(String(e.tier))) {
          errors.push(`${where}: "tier" must be "macro", "mid" or "micro"`);
        }
        if (typeof e.followers !== "number" || e.followers <= 0) {
          errors.push(`${where}: "followers" must be a number, e.g. 540000`);
        }
        if (typeof e.engagementRate !== "number" || e.engagementRate <= 0) {
          errors.push(`${where}: "engagementRate" must be a number in percent, e.g. 5.6`);
        }
        if (!Array.isArray(e.products) || e.products.length === 0) {
          errors.push(`${where}: "products" must list at least one product id from products.json`);
        } else if (productIds.size > 0) {
          for (const pid of e.products) {
            if (!productIds.has(String(pid))) {
              errors.push(`${where}: product "${pid}" is not defined in products.json`);
            }
          }
        }
        for (const numField of ["performance", "investedLakh", "avatarHue"] as const) {
          if (e[numField] !== undefined && typeof e[numField] !== "number") {
            errors.push(`${where}: "${numField}" must be a number when present`);
          }
        }
        seeds.push(entry as unknown as EditableInfluencerSeed);
      });
      overrides.influencers = seeds;
    }
  }

  /* ---- workspace.json ---- */
  const workspaceRaw = readJson("workspace.json");
  if (workspaceRaw !== undefined) {
    if (typeof workspaceRaw !== "object" || workspaceRaw === null) {
      errors.push("workspace.json: expected an object { ... }");
    } else {
      const w = workspaceRaw as Record<string, unknown>;
      if (w.walletLakh !== undefined) {
        if (typeof w.walletLakh !== "number" || w.walletLakh < 0) {
          errors.push('workspace.json: "walletLakh" must be a number of lakhs, e.g. 10');
        } else {
          overrides.walletLakh = w.walletLakh;
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Problems in the config/ folder:\n  - ${errors.join("\n  - ")}\n` +
        "Fix the file(s) above and start the server again.",
    );
  }
  return overrides;
}
