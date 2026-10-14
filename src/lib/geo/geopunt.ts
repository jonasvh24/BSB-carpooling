import type { GeocodeHit } from "./photon";

// Geopunt Location API (Digitaal Vlaanderen, geo.api.vlaanderen.be): the Flemish
// government's free address service, no key needed. Second geocoder after Photon, so
// address search keeps working when Photon is down or refuses the host. It covers the
// Flemish address register (Tervuren and the corridors into it); an address it does not
// know simply returns no hits, and the map pin remains. Shared by server and browser.
//
// Response shape [MED, from the v4 documentation; parsed defensively]:
// { LocationResult: [{ FormattedAddress, Location: { Lat_WGS84, Lon_WGS84 } }] }

type Result = { FormattedAddress?: unknown; Location?: { Lat_WGS84?: unknown; Lon_WGS84?: unknown } };

export function geopuntSearchUrl(base: string, query: string): URL {
  const url = new URL(`${base.replace(/\/$/, "")}/Location`);
  url.searchParams.set("q", query);
  url.searchParams.set("c", "6");
  return url;
}

export function geopuntReverseUrl(base: string, p: { lat: number; lng: number }): URL {
  const url = new URL(`${base.replace(/\/$/, "")}/Location`);
  url.searchParams.set("latlon", `${p.lat},${p.lng}`);
  url.searchParams.set("c", "1");
  return url;
}

export function geopuntHits(json: unknown): GeocodeHit[] {
  const results = (json as { LocationResult?: Result[] } | null)?.LocationResult;
  if (!Array.isArray(results)) throw new Error("Geopunt: unexpected response");
  return results.flatMap((r) => {
    const lat = Number(r.Location?.Lat_WGS84);
    const lng = Number(r.Location?.Lon_WGS84);
    const label = typeof r.FormattedAddress === "string" ? r.FormattedAddress.trim() : "";
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ label: `${label}, Belgium`, lat, lng }];
  });
}

export function geopuntReverseLabel(json: unknown): string | null {
  const first = (json as { LocationResult?: Result[] } | null)?.LocationResult?.[0];
  return typeof first?.FormattedAddress === "string" && first.FormattedAddress.trim() ? first.FormattedAddress.trim() : null;
}
