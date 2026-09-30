// Renders the PWA icons from the school logo: white "BSB" and the red swoosh on
// the school navy, the same arrangement as the icon on britishschool.be.
// Needs the Playwright Chromium that the e2e suite already installs.
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const src = readFileSync("src/components/brand-paths.ts", "utf8");
const path = (name) => src.match(new RegExp(`${name} = "([^"]+)"`))[1];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 23 106 54" width="76%"><path fill="#fff" d="${path("BSB_LETTERS")}"/><path fill="#c11f1b" d="${path("BSB_SWOOSH")}"/></svg>`;

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#292f4c">${svg}</body>`);
  await page.screenshot({ path: `public/icons/icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log("icons written");
