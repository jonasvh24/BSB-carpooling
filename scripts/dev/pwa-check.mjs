// Production-only check: manifest linked, service worker registered, icons reachable.
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3102";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(base + "/signin", { waitUntil: "networkidle" });
const manifestHref = await p.getAttribute('link[rel="manifest"]', "href");
const reg = await p.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  return { scope: r.scope, active: Boolean(r.active) };
});
const manifest = await (await p.request.get(base + manifestHref)).json();
const icons = await Promise.all(manifest.icons.map(async (i) => (await p.request.get(base + i.src)).status()));
const themeColor = await p.getAttribute('meta[name="theme-color"]', "content");
console.log(JSON.stringify({ manifestHref, sw: reg, display: manifest.display, start_url: manifest.start_url, icons, themeColor, name: manifest.name }, null, 2));
await b.close();
