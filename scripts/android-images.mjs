// Renders the Android app's PNG images (launcher icons for Android 7.x,
// splash screens) from the Marketbing logo. Newer Android versions use the
// vector icon in android/app/src/main/res/drawable*/ic_launcher_*.xml.
// Re-run after changing the logo or colours:
//   node scripts/android-images.mjs [path-to-chromium]
import { chromium } from "playwright-core";
import fs from "node:fs";

const RES = "android/app/src/main/res";
const SPARK =
  '<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" fill="#fff"/>' +
  '<path d="M19 15l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1 1-2.7z" fill="#fff" opacity=".7"/>';
const GRADIENT =
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>';

/** The logo tile: gradient square (or circle) with the spark. */
const tile = (size, shape) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    ${GRADIENT}
    ${shape === "round" ? '<circle cx="24" cy="24" r="22" fill="url(#g)"/>' : '<rect x="2" y="2" width="44" height="44" rx="10" fill="url(#g)"/>'}
    <g transform="translate(12 12)">${SPARK}</g>
  </svg>`;

const browser = await chromium.launch({ executablePath: process.argv[2] || process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function render(file, width, height, html) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden">${html}</body>`);
  await page.screenshot({ path: file, omitBackground: true });
  console.log(`${file} (${width}x${height})`);
}

// Launcher icons for Android 7.x (8+ uses the adaptive vector icon).
for (const [dpi, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  await render(`${RES}/mipmap-${dpi}/ic_launcher.png`, size, size, tile(size, "square"));
  await render(`${RES}/mipmap-${dpi}/ic_launcher_round.png`, size, size, tile(size, "round"));
}

// Splash screens: the logo and name centred on the app's background.
const splash = (w, h) => {
  const logo = Math.round(Math.min(w, h) * 0.22);
  return `<div style="width:${w}px;height:${h}px;background:#f8fafc;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:${Math.round(logo * 0.25)}px;font-family:system-ui,sans-serif">
    ${tile(logo, "square")}
    <div style="font-size:${Math.round(logo * 0.3)}px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">Marketbing</div>
  </div>`;
};
for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith("drawable"))) {
  const file = `${RES}/${dir}/splash.png`;
  if (!fs.existsSync(file)) continue;
  const header = fs.readFileSync(file).subarray(16, 24);
  await render(file, header.readUInt32BE(0), header.readUInt32BE(4), splash(header.readUInt32BE(0), header.readUInt32BE(4)));
}

await browser.close();
