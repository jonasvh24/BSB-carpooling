import { chromium } from "@playwright/test";
const [,, url, out, uid] = process.argv;
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();
if (uid) await p.goto("http://localhost:3100/dev/login-as/" + uid, { waitUntil: "networkidle" });
await p.goto(url, { waitUntil: "networkidle" });
await p.screenshot({ path: out, fullPage: true });
console.log(p.url());
await b.close();
