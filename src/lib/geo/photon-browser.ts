import { photonHits, photonReverseLabel, photonReverseUrl, photonSearchUrl, type GeocodeHit } from "./photon";

// Fallback used only when the server's own lookup fails (the API route answers 503).
// The browser then asks Photon directly: komoot can refuse requests from shared cloud
// addresses such as Netlify's functions, but not from a colleague's own connection.
// The typed text and the person's IP go to komoot (Germany) on this path, as listed
// in docs/DATA_MAP.md. The origin must also be allowed by connect-src (src/lib/csp.ts).
export const PHOTON_BROWSER_URL = process.env.NEXT_PUBLIC_PHOTON_URL || "https://photon.komoot.io";

export async function searchFromBrowser(query: string, near: { lat: number; lng: number }): Promise<GeocodeHit[]> {
  const res = await fetch(photonSearchUrl(PHOTON_BROWSER_URL, query.trim().toLowerCase(), near), {
    signal: AbortSignal.timeout(6000),
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  return photonHits(await res.json());
}

export async function reverseFromBrowser(p: { lat: number; lng: number }): Promise<string | null> {
  const res = await fetch(photonReverseUrl(PHOTON_BROWSER_URL, p), { signal: AbortSignal.timeout(6000), referrerPolicy: "no-referrer" });
  if (!res.ok) return null;
  return photonReverseLabel(await res.json());
}
