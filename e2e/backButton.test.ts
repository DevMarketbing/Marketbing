/**
 * Android back button ordering (src/backButton.ts), without a phone.
 * Usage: npx tsx e2e/backButton.test.ts
 */
import assert from "node:assert/strict";
import { addLayer, BackLevel, goBack } from "../src/backButton";

const closed: string[] = [];
const layer = (name: string, level: number) => addLayer(level, () => closed.push(name));

assert.equal(goBack(), false, "nothing open: back leaves the app");

// Opened in an awkward order: a page registered before its section (React
// runs child effects first), then a dialog and the menu.
const page = layer("detail page", BackLevel.page);
const section = layer("marketplace section", BackLevel.section);
const dialog = layer("trade dialog", BackLevel.dialog);
const menu = layer("menu", BackLevel.menu);

goBack();
menu();
goBack();
dialog();
goBack();
page();
goBack();
section();
assert.deepEqual(closed, ["menu", "trade dialog", "detail page", "marketplace section"]);
assert.equal(goBack(), false, "all closed: back leaves the app");

// Same level: the most recently opened closes first.
const first = layer("first", BackLevel.page);
layer("second", BackLevel.page);
goBack();
assert.equal(closed.at(-1), "second");
first();

console.log("ALL PASSED");
