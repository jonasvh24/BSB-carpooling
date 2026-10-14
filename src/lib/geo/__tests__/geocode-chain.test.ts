import { afterEach, describe, expect, it, vi } from "vitest";
import { geopuntHits, geopuntReverseLabel, geopuntSearchUrl } from "../geopunt";
import { searchFromBrowser } from "../geo-browser";

const SITE = { lat: 50.8467, lng: 4.3525 };
const photonBody = {
  features: [{ geometry: { coordinates: [4.5156, 50.8236] }, properties: { street: "Pater Dupierreuxlaan", housenumber: "1", postcode: "3080", city: "Tervuren", country: "Belgium" } }],
};
const geopuntBody = {
  LocationResult: [{ FormattedAddress: "Pater Dupierreuxlaan 1, 3080 Tervuren", Location: { Lat_WGS84: 50.8236, Lon_WGS84: 4.5156, X_Lambert72: 162000, Y_Lambert72: 168000 } }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Geopunt parsing", () => {
  it("turns a LocationResult into hits with WGS84 coordinates", () => {
    expect(geopuntHits(geopuntBody)).toEqual([{ label: "Pater Dupierreuxlaan 1, 3080 Tervuren, Belgium", lat: 50.8236, lng: 4.5156 }]);
    expect(geopuntReverseLabel(geopuntBody)).toBe("Pater Dupierreuxlaan 1, 3080 Tervuren");
  });

  it("skips results without coordinates and rejects an unknown shape", () => {
    expect(geopuntHits({ LocationResult: [{ FormattedAddress: "Somewhere" }] })).toEqual([]);
    expect(() => geopuntHits({ error: "x" })).toThrow();
  });

  it("builds the v4 Location URL", () => {
    expect(geopuntSearchUrl("https://geo.api.vlaanderen.be/geolocation/v4/", "pater dup").toString()).toBe(
      "https://geo.api.vlaanderen.be/geolocation/v4/Location?q=pater+dup&c=6",
    );
  });
});

describe("browser search chain", () => {
  it("uses Photon when it answers", async () => {
    const fetchMock = vi.fn(async () => json(photonBody));
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchFromBrowser("pater dup", SITE))[0].label).toBe("Pater Dupierreuxlaan 1, 3080 Tervuren, Belgium");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Geopunt when Photon is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => (String(url).includes("photon") ? json({}, 403) : json(geopuntBody))));
    expect(await searchFromBrowser("pater dup", SITE)).toEqual([{ label: "Pater Dupierreuxlaan 1, 3080 Tervuren, Belgium", lat: 50.8236, lng: 4.5156 }]);
  });

  it("falls back to Geopunt when Photon finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => (String(url).includes("photon") ? json({ features: [] }) : json(geopuntBody))));
    expect(await searchFromBrowser("pater dup", SITE)).toHaveLength(1);
  });

  it("throws only when both fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(searchFromBrowser("pater dup", SITE)).rejects.toThrow();
  });
});
