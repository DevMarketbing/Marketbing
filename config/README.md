# Editing your workspace data (no coding needed)

The files in this folder are the **inputs** to your Marketbing workspace.
Edit them in any text editor, save, then rebuild the database so the app
picks the changes up:

```
npm run db:reset
npm start
```

(Resetting clears trades, resolved alerts and past runs — the app rebuilds
everything from these files. If you're connected to Supabase, it asks you
to type `RESET` to confirm, because it deletes the data in Supabase too.)

If a file has a mistake in it, the server won't start; it prints the file
name and entry number of each problem so you know exactly what to fix.

**Golden rules for editing JSON files:**
- Keep the double quotes around names and text values.
- Numbers have no quotes and no commas inside them (`540000`, not `"5,40,000"`).
- Every entry `{ ... }` is separated from the next by a comma — but there is
  **no comma after the last one** in a list.

---

## products.json — what you sell

```json
{ "id": "glow-serum", "name": "Glow Serum", "priceInr": 899 }
```

| Field | Meaning |
|---|---|
| `id` | Short lowercase code, letters/dashes only. Used to link influencers to products — don't change it after launch. |
| `name` | The name shown in the app. |
| `priceInr` | Price in rupees. |

## influencers.json — your creator roster

```json
{
  "name": "Sana Kapoor",
  "handle": "@sanacares",
  "niche": "Dermatology-adjacent",
  "tier": "mid",
  "followers": 540000,
  "engagementRate": 6.1,
  "performance": 1.9,
  "products": ["glow-serum", "spf-shield"],
  "investedLakh": 1.8
}
```

| Field | Meaning |
|---|---|
| `name`, `handle`, `niche` | Shown in the marketplace. |
| `bio` | Optional one-line description. |
| `tier` | `"macro"`, `"mid"` or `"micro"`. |
| `followers` | Follower count as a plain number (540000 = 5.4 lakh). |
| `engagementRate` | Percent, e.g. `6.1` means 6.1%. |
| `performance` | Optional. How commercially effective they are: `1` ≈ breakeven, `2` ≈ about 2x sales per rupee spent. Drives their ROI and rating. |
| `products` | List of product `id`s (from products.json) they run campaigns for. |
| `investedLakh` | Optional. ₹ lakh already allocated to them when the workspace starts. |

## workspace.json — company-level settings

| Field | Meaning |
|---|---|
| `walletLakh` | Wallet balance (₹ lakh) a fresh workspace starts with. |

---

## API keys — a different file

Secret keys do **not** go in this folder (files here are saved to git).
They go in a file called `.env` in the project's main folder — copy
`.env.example` to `.env` and fill in the blanks. `.env` is ignored by git
so secrets never end up in the repository.
