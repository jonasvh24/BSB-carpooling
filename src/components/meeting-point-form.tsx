"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { t } from "@/i18n";
import { Button, Field, Input } from "./ui";
import { meetingPointAction } from "@/app/(app)/pools/[id]/actions";

const HomeMap = dynamic(() => import("./onboarding/home-map"), { ssr: false });

// Driver sets a labelled meeting point for one member by dragging the pin (§7.2).
export function MeetingPointForm({ poolId, member }: { poolId: string; member: { userId: string; name: string; lat: number; lng: number; label: string } }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ lat: member.lat, lng: member.lng });
  if (!open) {
    return (
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        {t.pools.meetingPoint}
      </button>
    );
  }
  return (
    <form action={meetingPointAction} className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
      <p className="mb-2 text-sm text-muted">{t.pools.meetingPointHelp}</p>
      <HomeMap lat={p.lat} lng={p.lng} onMove={setP} ariaLabel={t.pools.meetingPoint} />
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="userId" value={member.userId} />
      <input type="hidden" name="lat" value={p.lat} />
      <input type="hidden" name="lng" value={p.lng} />
      <div className="mt-2">
        <Field label={t.pools.meetingPointLabel} htmlFor={`label-${member.userId}`}>
          <Input id={`label-${member.userId}`} name="label" defaultValue={member.label} maxLength={60} required />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit">{t.app.save}</Button>
        <Button type="submit" name="clear" value="1" variant="secondary">
          {t.app.delete}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t.app.cancel}
        </Button>
      </div>
    </form>
  );
}
