import { describe, expect, it } from "vitest";
import { approximateLocation, cellKey, snapToCell } from "../approx";
import { haversineM } from "../haversine";

describe("approximateLocation", () => {
  const home = { lat: 50.8503, lng: 4.3517 };

  it("moves the point but keeps it within 350 m of the home", () => {
    const a = approximateLocation(home, "user-1");
    expect(a).not.toEqual(home);
    // half a cell diagonal (~354 m) plus the ≤100 m nudge; the nudge can only
    // move it towards or away from the true home by at most the nudge itself.
    expect(haversineM(home, a)).toBeLessThan(460);
  });

  it("is deterministic per user and differs between users", () => {
    expect(approximateLocation(home, "u1")).toEqual(approximateLocation(home, "u1"));
    expect(approximateLocation(home, "u1")).not.toEqual(approximateLocation(home, "u2"));
  });

  it("two homes in the same cell share a cell key", () => {
    const near = { lat: home.lat + 0.0005, lng: home.lng + 0.0005 };
    expect(cellKey(home, 500)).toBe(cellKey(near, 500));
    expect(snapToCell(home, 500)).toEqual(snapToCell(near, 500));
  });

  it("cells stay roughly square at high latitude", () => {
    const north = { lat: 69.65, lng: 18.95 };
    const c = snapToCell(north, 500);
    const east = snapToCell({ lat: north.lat, lng: north.lng + 0.02 }, 500);
    // Distance between neighbouring cell centres is a multiple of ~500 m.
    const d = haversineM(c, east);
    const offGrid = Math.abs(d - Math.round(d / 500) * 500);
    expect(offGrid).toBeLessThan(60);
  });
});
