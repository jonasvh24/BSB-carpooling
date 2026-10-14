import { photonHits, photonReverseLabel, photonReverseUrl, photonSearchUrl, type GeocodeHit } from "./photon";
import { geopuntHits, geopuntReverseLabel, geopuntReverseUrl, geopuntSearchUrl } from "./geopunt";

// Fallback used only when the server's own lookup fails (the API route answers 503).
// The browser then asks the geocoders directly: a provider can refuse requests from
// shared cloud addresses such as Netlify's functions, but not from a colleague's own
// connection. On this path the typed text and the person's IP go to komoot (Germany)
// and, if needed, Digitaal Vlaanderen (Belgium), as listed in docs/DATA_MAP.md.
// Both origins must be allowed by connect-src (src/lib/csp.ts).
export const PHOTON_BROWSER_URL = process.env.NEXT_PUBLIC_PHOTON_URL || "https://photon.komoot.io";
export const GEOPUNT_BROWSER_URL = process.env.NEXT_PUBLIC_GEOPUNT_URL || "https://geo.api.vlaanderen.be/geolocation/v4";

async function getJson(url: URL, provider: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`${provider} ${res.status}`);
  return res.json();
}

export async function searchFromBrowser(query: string, near: { lat: number; lng: number }): Promise<GeocodeHit[]> {
  const q = query.trim().toLowerCase();
  let photon: GeocodeHit[] | null = null;
  try {
    photon = photonHits(await getJson(photonSearchUrl(PHOTON_BROWSER_URL, q, near), "Photon"));
    if (photon.length > 0) return photon;
  } catch {}
  try {
    return geopuntHits(await getJson(geopuntSearchUrl(GEOPUNT_BROWSER_URL, q), "Geopunt"));
  } catch (err) {
    if (photon) return photon;
    throw err;
  }
}

export async function reverseFromBrowser(p: { lat: number; lng: number }): Promise<string | null> {
  const viaPhoton = await getJson(photonReverseUrl(PHOTON_BROWSER_URL, p), "Photon").then(photonReverseLabel, () => null);
  if (viaPhoton) return viaPhoton;
  return getJson(geopuntReverseUrl(GEOPUNT_BROWSER_URL, p), "Geopunt").then(geopuntReverseLabel, () => null);
}
