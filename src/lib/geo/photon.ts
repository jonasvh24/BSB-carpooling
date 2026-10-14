// Photon request building and result formatting, shared by the server (provider.ts)
// and the browser fallback (photon-browser.ts) so both produce identical labels.
// No server-only imports here: this file ships to the browser.

export type GeocodeHit = { label: string; lat: number; lng: number };
type Props = Record<string, string | number | undefined>;
type Feature = { geometry?: { coordinates?: [number, number] }; properties?: Props };

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : undefined);

export function photonSearchUrl(base: string, query: string, near?: { lat: number; lng: number }): URL {
  const url = new URL("/api/", base);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  return url;
}

export function photonReverseUrl(base: string, p: { lat: number; lng: number }): URL {
  const url = new URL("/reverse", base);
  url.searchParams.set("lat", String(p.lat));
  url.searchParams.set("lon", String(p.lng));
  url.searchParams.set("lang", "en");
  return url;
}

function streetOf(p: Props) {
  return [str(p.street) ?? str(p.name), str(p.housenumber)].filter(Boolean).join(" ");
}

export function photonHits(json: unknown): GeocodeHit[] {
  const features = (json as { features?: Feature[] } | null)?.features;
  if (!Array.isArray(features)) throw new Error("Photon: unexpected response");
  return features.flatMap((f) => {
    const c = f.geometry?.coordinates;
    if (!c || typeof c[0] !== "number" || typeof c[1] !== "number") return [];
    const p = f.properties ?? {};
    const label = [streetOf(p), [str(p.postcode), str(p.city) ?? str(p.locality) ?? str(p.county)].filter(Boolean).join(" "), str(p.country)]
      .filter(Boolean)
      .join(", ");
    return [{ label, lat: c[1], lng: c[0] }];
  });
}

export function photonReverseLabel(json: unknown): string | null {
  const p = (json as { features?: Feature[] } | null)?.features?.[0]?.properties;
  if (!p) return null;
  const town = str(p.city) ?? str(p.locality) ?? str(p.county) ?? "";
  return [streetOf(p), [str(p.postcode), town].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}
