// A stored trip route (Trip.plannedRoute, JSON text) holds the stop order, the
// times, the user ids and the route points. The points are home coordinates.
// Scrubbing drops the points and swaps the given user ids for placeholders, and
// leaves the times so an old trip page still shows its timetable.
export function scrubRoute(text: string | null, replaceUserIds: Record<string, string>): string | null {
  if (!text) return text;
  let route: { driverId?: string; stops?: Array<{ userId?: string }>; points?: unknown[] };
  try {
    route = JSON.parse(text);
  } catch {
    return null;
  }
  const swap = (id: string | undefined) => (id && replaceUserIds[id]) || id;
  return JSON.stringify({
    ...route,
    driverId: swap(route.driverId),
    stops: (route.stops ?? []).map((s) => ({ ...s, userId: swap(s.userId) })),
    points: [],
  });
}
