import { t } from "@/i18n";
import { Button } from "./ui";
import { confirmAction, optOutAction } from "@/app/(app)/trips/[id]/actions";

// One tap each: confirm or opt out (§7.4).
export function TripQuickActions({ tripId, status, isDriver }: { tripId: string; status: string; isDriver: boolean }) {
  return (
    <div className="mt-3 flex gap-2">
      {status !== "IN" || !isDriver ? (
        <form action={confirmAction}>
          <input type="hidden" name="id" value={tripId} />
          <Button type="submit" variant={status === "IN" ? "secondary" : "primary"} disabled={status === "IN" && !isDriver}>
            {status === "IN" && !isDriver ? t.trips.confirmed : t.trips.confirm}
          </Button>
        </form>
      ) : null}
      {status !== "OUT" && (
        <form action={optOutAction}>
          <input type="hidden" name="id" value={tripId} />
          <Button type="submit" variant="secondary">
            {isDriver ? t.trips.cancelTrip : t.trips.cantMakeIt}
          </Button>
        </form>
      )}
    </div>
  );
}
