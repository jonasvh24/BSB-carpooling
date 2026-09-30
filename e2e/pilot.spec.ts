import { test, expect } from "@playwright/test";

// PILOT_MODE=true: no dev routes, no mailbox, still a working PWA shell.
test("pilot mode exposes no development routes", async ({ request }) => {
  for (const path of ["/dev", "/dev/mailbox", "/dev/mailbox/api", "/dev/recompute", "/dev/jobs?run=digest", "/dev/login-as/anything"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});

test("pilot mode still serves the sign-in page, manifest, service worker and privacy notice", async ({ request }) => {
  for (const path of ["/signin", "/manifest.webmanifest", "/sw.js", "/privacy", "/icons/icon-192.png"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
});
