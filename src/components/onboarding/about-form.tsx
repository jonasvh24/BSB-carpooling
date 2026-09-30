"use client";

import { useActionState, useState } from "react";
import { saveAbout, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, ChoiceGroup, Field, Input } from "@/components/ui";
import { StepActions } from "./shell";

type Props = {
  initial: { name: string; phone: string; photoUrl: string | null; languages: string[] };
  returnTo?: string;
};

// Photos are shrunk in the browser to a 256 px JPEG so a 5 MB phone picture
// never reaches the server.
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const s = Math.min(bitmap.width, bitmap.height);
  g.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function AboutForm({ initial, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveAbout, null);
  const [photo, setPhoto] = useState<string>("");
  const [removed, setRemoved] = useState(false);
  const shown = photo || (!removed ? initial.photoUrl : null);

  return (
    <form action={action}>
      {state?.errors?.form && <Alert kind="error">{t.app.somethingWentWrong}</Alert>}
      <Field label={t.onboarding.about.name} htmlFor="name" error={state?.errors?.name && t.app.required}>
        <Input id="name" name="name" defaultValue={initial.name} required autoComplete="name" maxLength={80} />
      </Field>
      <Field label={t.onboarding.about.phone} htmlFor="phone" help={t.onboarding.about.phoneHelp} optional>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={initial.phone} maxLength={30} />
      </Field>
      <Field label={t.onboarding.about.photo} htmlFor="photoFile" help={t.onboarding.about.photoHelp} optional>
        <div className="flex items-center gap-3">
          {shown && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" width={56} height={56} className="rounded-full object-cover" />
          )}
          <input
            id="photoFile"
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setPhoto(await shrink(f));
                setRemoved(false);
              }
            }}
          />
          {shown && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setPhoto("");
                setRemoved(true);
              }}
            >
              {t.app.delete}
            </button>
          )}
        </div>
        <input type="hidden" name="photoUrl" value={photo} />
        {removed && <input type="hidden" name="removePhoto" value="1" />}
      </Field>
      <ChoiceGroup
        name="languages"
        legend={t.onboarding.about.languages}
        multiple
        columns={2}
        value={initial.languages}
        options={[
          { value: "nl", label: t.onboarding.about.lang.nl },
          { value: "fr", label: t.onboarding.about.lang.fr },
          { value: "en", label: t.onboarding.about.lang.en },
          { value: "other", label: t.onboarding.about.lang.other },
        ]}
      />
      <StepActions pending={pending} returnTo={returnTo} />
    </form>
  );
}
