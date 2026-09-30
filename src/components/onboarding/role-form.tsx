"use client";

import { useActionState, useState } from "react";
import { saveRole, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, ChoiceGroup, Field, Input } from "@/components/ui";
import { StepActions } from "./shell";

type Props = {
  initial: {
    rideRole: "DRIVER" | "PASSENGER" | "EITHER";
    preferDriving: boolean;
    vehicleDesc: string;
    seatsAvailable: number;
    maxDetourMin: number;
    pickupStyle: "DOOR" | "MEETING_POINT";
    maxWalkM: number;
    maxExtraRideMin: number;
  };
  returnTo?: string;
};

export function RoleForm({ initial, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveRole, null);
  const [role, setRole] = useState(initial.rideRole);
  const drives = role !== "PASSENGER";
  const rides = role !== "DRIVER";
  return (
    <form action={action}>
      {state?.errors && <Alert kind="error">{Object.values(state.errors)[0]}</Alert>}
      <ChoiceGroup
        name="rideRole"
        legend={t.onboarding.role.how}
        value={role}
        onChange={(v) => setRole(v as typeof role)}
        options={[
          { value: "DRIVER", label: t.onboarding.role.drive },
          { value: "PASSENGER", label: t.onboarding.role.ride },
          { value: "EITHER", label: t.onboarding.role.either },
        ]}
      />
      {role === "EITHER" && (
        <ChoiceGroup
          name="preferDriving"
          legend={t.onboarding.role.prefer}
          columns={2}
          value={initial.preferDriving ? "DRIVE" : "RIDE"}
          options={[
            { value: "DRIVE", label: t.onboarding.role.preferDrive },
            { value: "RIDE", label: t.onboarding.role.preferRide },
          ]}
        />
      )}
      {drives && (
        <>
          <Field label={t.onboarding.role.vehicle} htmlFor="vehicleDesc" help={t.onboarding.role.vehicleHelp}>
            <Input id="vehicleDesc" name="vehicleDesc" defaultValue={initial.vehicleDesc} maxLength={80} placeholder="e.g. grey Skoda Octavia" />
          </Field>
          <ChoiceGroup
            name="seatsAvailable"
            legend={t.onboarding.role.seats}
            columns={2}
            value={String(Math.max(1, initial.seatsAvailable))}
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          />
          <ChoiceGroup
            name="maxDetourMin"
            legend={t.onboarding.role.maxDetour}
            columns={3}
            value={String(initial.maxDetourMin)}
            options={[5, 10, 15, 20, 30].map((n) => ({ value: String(n), label: `${n} ${t.app.minutes}` }))}
          />
          <ChoiceGroup
            name="pickupStyle"
            legend={t.onboarding.role.pickupStyle}
            columns={2}
            value={initial.pickupStyle}
            options={[
              { value: "DOOR", label: t.onboarding.role.pickupDoor },
              { value: "MEETING_POINT", label: t.onboarding.role.pickupMeeting },
            ]}
          />
        </>
      )}
      {rides && (
        <>
          <ChoiceGroup
            name="maxWalkM"
            legend={t.onboarding.role.maxWalk}
            columns={2}
            value={String(initial.maxWalkM)}
            options={[0, 250, 500, 1000].map((n) => ({ value: String(n), label: `${n} ${t.app.metres}` }))}
          />
          <ChoiceGroup
            name="maxExtraRideMin"
            legend={t.onboarding.role.maxExtraRide}
            columns={3}
            value={String(initial.maxExtraRideMin)}
            options={[10, 15, 20, 30, 45].map((n) => ({ value: String(n), label: `${n} ${t.app.minutes}` }))}
          />
        </>
      )}
      <StepActions pending={pending} returnTo={returnTo} />
    </form>
  );
}
