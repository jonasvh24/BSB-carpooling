// Renders the PWA icons from the carpool logo tile in public/brand.
// Needs the Playwright Chromium that the e2e suite already installs.
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const logo = `data:image/png;base64,${readFileSync("public/brand/bsb-carpool-tile.png").toString("base64")}`;
mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#131f45"><img src="${logo}" style="width:100%"></body>`);
  await page.screenshot({ path: `public/icons/icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log("icons written");
