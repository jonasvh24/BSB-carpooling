"use client";

import { useActionState, useState } from "react";
import { savePrefs, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, ChoiceGroup, Field, Textarea } from "@/components/ui";
import { StepActions } from "./shell";

type Props = {
  initial: {
    smoking: string;
    talk: string;
    music: string;
    genderPref: string;
    gender: string;
    costMode: string;
    notes: string;
  };
  returnTo?: string;
};

export function PrefsForm({ initial, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(savePrefs, null);
  const [same, setSame] = useState(initial.genderPref === "SAME");
  return (
    <form action={action}>
      {state?.errors && <Alert kind="error">{Object.values(state.errors)[0]}</Alert>}
      <ChoiceGroup
        name="smoking"
        legend={t.onboarding.prefs.smoking}
        columns={3}
        value={initial.smoking}
        options={[
          { value: "NO", label: t.onboarding.prefs.smokingNo },
          { value: "YES", label: t.onboarding.prefs.smokingYes },
          { value: "ANY", label: t.onboarding.prefs.smokingAny },
        ]}
      />
      <ChoiceGroup
        name="talk"
        legend={t.onboarding.prefs.talk}
        columns={3}
        value={initial.talk}
        options={[
          { value: "QUIET", label: t.onboarding.prefs.talkQuiet },
          { value: "CHATTY", label: t.onboarding.prefs.talkChatty },
          { value: "ANY", label: t.onboarding.prefs.talkAny },
        ]}
      />
      <ChoiceGroup
        name="music"
        legend={t.onboarding.prefs.music}
        columns={3}
        value={initial.music}
        options={[
          { value: "ANY", label: t.onboarding.prefs.musicAny },
          { value: "NONE", label: t.onboarding.prefs.musicNone },
          { value: "DRIVER_CHOICE", label: t.onboarding.prefs.musicDriver },
        ]}
      />
      <div className="mb-4">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="genderPref" checked={same} onChange={(e) => setSame(e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
          <span>
            <span className="block font-medium">{t.onboarding.prefs.sameGender}</span>
            <span className="block text-sm text-muted">{t.onboarding.prefs.sameGenderHelp}</span>
          </span>
        </label>
      </div>
      {same && (
        <ChoiceGroup
          name="gender"
          legend={t.onboarding.prefs.gender}
          columns={3}
          value={initial.gender}
          options={[
            { value: "FEMALE", label: t.onboarding.prefs.genderFemale },
            { value: "MALE", label: t.onboarding.prefs.genderMale },
            { value: "OTHER", label: t.onboarding.prefs.genderOther },
          ]}
        />
      )}
      <ChoiceGroup
        name="costMode"
        legend={t.onboarding.prefs.cost}
        value={initial.costMode}
        options={[
          { value: "CONTRIBUTE", label: t.onboarding.prefs.costContribute },
          { value: "ALTERNATE", label: t.onboarding.prefs.costAlternate },
          { value: "EITHER", label: t.onboarding.prefs.costEither },
        ]}
      />
      <Field label={t.onboarding.prefs.notes} htmlFor="notes" help={t.onboarding.prefs.notesHelp} optional>
        <Textarea id="notes" name="notes" rows={3} maxLength={200} defaultValue={initial.notes} placeholder={t.onboarding.prefs.notesPlaceholder} />
      </Field>
      <StepActions pending={pending} returnTo={returnTo} />
    </form>
  );
}
