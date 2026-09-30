"use client";

import { useActionState, useMemo, useState } from "react";
import { saveDays, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, ChoiceGroup, Select } from "@/components/ui";
import { StepActions } from "./shell";

export type DayEntry = {
  weekday: number;
  siteId: string;
  arriveBy: string;
  arriveFlexMin: number;
  departEarliest: string;
  departFlexMin: number;
  wantsAm: boolean;
  wantsPm: boolean;
};

type Props = {
  sites: Array<{ id: string; name: string; defaultArriveBy: string; defaultDepartEarliest: string }>;
  initial: { directions: "AM" | "PM" | "BOTH"; entries: DayEntry[] };
  returnTo?: string;
};

const ARRIVE_PRESETS = ["07:30", "07:45", "08:00", "08:15", "08:30"];
const ARRIVE_FLEX = [0, 10, 20, 30, 45];
const DEPART_PRESETS = ["15:00", "15:30", "16:00", "16:30", "17:00"];
const DEPART_FLEX = [0, 15, 30, 45, 60, 90];

function TimePicker({
  id,
  label,
  presets,
  value,
  onChange,
}: {
  id: string;
  label: string;
  presets: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = presets.includes(value);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <fieldset className="mb-4">
      <legend className="text-base font-medium mb-2">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={!custom && value === p}
            className={`min-h-11 rounded-xl border px-2 transition-colors ${!custom && value === p ? "border-navy bg-navy font-semibold text-on-navy" : "border-border bg-surface"}`}
            onClick={() => {
              setCustom(false);
              onChange(p);
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          className={`min-h-11 rounded-xl border px-2 transition-colors ${custom ? "border-navy bg-navy font-semibold text-on-navy" : "border-border bg-surface"}`}
          onClick={() => setCustom(true)}
        >
          {t.onboarding.days.custom}
        </button>
      </div>
      {custom && (
        <div className="mt-2">
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <input
            id={id}
            type="time"
            step={300}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3"
          />
        </div>
      )}
    </fieldset>
  );
}

function MinutesPicker({ label, options, value, onChange, name }: { label: string; options: number[]; value: number; onChange: (v: number) => void; name: string }) {
  return (
    <ChoiceGroup
      name={name}
      legend={label}
      columns={3}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={options.map((o) => ({ value: String(o), label: `${o} ${t.app.minutes}` }))}
    />
  );
}

export function DaysForm({ sites, initial, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveDays, null);
  const defaultSite = sites[0];
  const initialDays = initial.entries.map((e) => e.weekday);
  const [days, setDays] = useState<number[]>(initialDays.length ? initialDays : [1, 2, 3, 4, 5]);
  const [weekend, setWeekend] = useState(initialDays.some((d) => d > 5));
  const [siteId, setSiteId] = useState(initial.entries[0]?.siteId ?? defaultSite.id);
  const first = initial.entries[0];
  const [arriveBy, setArriveBy] = useState(first?.arriveBy ?? defaultSite.defaultArriveBy);
  const [arriveFlex, setArriveFlex] = useState(first?.arriveFlexMin ?? 10);
  const [departEarliest, setDepartEarliest] = useState(first?.departEarliest ?? defaultSite.defaultDepartEarliest);
  const [departFlex, setDepartFlex] = useState(first?.departFlexMin ?? 30);
  const sameInitially = useMemo(() => {
    if (initial.entries.length < 2) return true;
    return initial.entries.every(
      (e) =>
        e.siteId === first.siteId &&
        e.arriveBy === first.arriveBy &&
        e.arriveFlexMin === first.arriveFlexMin &&
        e.departEarliest === first.departEarliest &&
        e.departFlexMin === first.departFlexMin &&
        e.wantsAm === first.wantsAm &&
        e.wantsPm === first.wantsPm,
    );
  }, [initial.entries, first]);
  const [same, setSame] = useState(sameInitially);
  const [directions, setDirections] = useState<"AM" | "PM" | "BOTH">(initial.directions);
  const [grid, setGrid] = useState<Record<number, DayEntry>>(() => {
    const g: Record<number, DayEntry> = {};
    for (const e of initial.entries) g[e.weekday] = e;
    return g;
  });

  function entryFor(wd: number): DayEntry {
    return (
      grid[wd] ?? {
        weekday: wd,
        siteId,
        arriveBy,
        arriveFlexMin: arriveFlex,
        departEarliest,
        departFlexMin: departFlex,
        wantsAm: true,
        wantsPm: true,
      }
    );
  }

  function patch(wd: number, p: Partial<DayEntry>) {
    setGrid((g) => ({ ...g, [wd]: { ...entryFor(wd), ...p } }));
  }

  const payload = useMemo(() => {
    const entries = days
      .sort((a, b) => a - b)
      .map((wd) =>
        same
          ? { weekday: wd, siteId, arriveBy, arriveFlexMin: arriveFlex, departEarliest, departFlexMin: departFlex, wantsAm: true, wantsPm: true }
          : entryFor(wd),
      );
    return JSON.stringify({ directions, entries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, same, siteId, arriveBy, arriveFlex, departEarliest, departFlex, directions, grid]);

  const shownDays = weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];

  return (
    <form action={action}>
      {state?.errors && <Alert kind="error">{t.onboarding.days.needDay}</Alert>}
      {sites.length > 1 && (
        <div className="mb-4">
          <label htmlFor="siteId" className="block text-base font-medium mb-1">
            {t.onboarding.days.site}
          </label>
          <p className="text-sm text-muted mb-1">{t.onboarding.days.siteHelp}</p>
          <Select id="siteId" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <fieldset className="mb-4">
        <legend className="text-base font-medium mb-2">{t.onboarding.days.which}</legend>
        <div className="grid grid-cols-5 gap-2">
          {shownDays.map((wd) => {
            const on = days.includes(wd);
            return (
              <label
                key={wd}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border transition-colors ${on ? "border-navy bg-navy font-semibold text-on-navy" : "border-border bg-surface"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => setDays((d) => (on ? d.filter((x) => x !== wd) : [...d, wd]))}
                />
                {t.weekdays.short[wd]}
              </label>
            );
          })}
        </div>
        <button type="button" className="mt-2 text-sm underline" onClick={() => setWeekend((w) => !w)}>
          {weekend ? t.onboarding.days.hideWeekend : t.onboarding.days.showWeekend}
        </button>
      </fieldset>

      <TimePicker id="arriveBy" label={t.onboarding.days.arriveBy} presets={ARRIVE_PRESETS} value={arriveBy} onChange={setArriveBy} />
      <MinutesPicker name="arriveFlex" label={t.onboarding.days.arriveFlex} options={ARRIVE_FLEX} value={arriveFlex} onChange={setArriveFlex} />
      <TimePicker id="departEarliest" label={t.onboarding.days.departEarliest} presets={DEPART_PRESETS} value={departEarliest} onChange={setDepartEarliest} />
      <MinutesPicker name="departFlex" label={t.onboarding.days.departFlex} options={DEPART_FLEX} value={departFlex} onChange={setDepartFlex} />

      <ChoiceGroup
        name="same"
        legend={t.onboarding.days.sameEveryDay}
        value={same ? "yes" : "no"}
        onChange={(v) => setSame(v === "yes")}
        options={[
          { value: "yes", label: t.onboarding.days.sameYes },
          { value: "no", label: t.onboarding.days.sameNo },
        ]}
      />

      {!same && (
        <section aria-label={t.onboarding.days.perDay} className="mb-4 space-y-3">
          {days
            .slice()
            .sort((a, b) => a - b)
            .map((wd) => {
              const e = entryFor(wd);
              return (
                <div key={wd} className="rounded-lg border border-border bg-surface p-3">
                  <h3 className="font-medium mb-2">{t.weekdays.long[wd]}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {sites.length > 1 && (
                      <label className="col-span-2">
                        <span className="block text-muted">{t.onboarding.days.site}</span>
                        <Select value={e.siteId} onChange={(ev) => patch(wd, { siteId: ev.target.value })}>
                          {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                    <label>
                      <span className="block text-muted">{t.onboarding.days.gridArrive}</span>
                      <input type="time" step={300} value={e.arriveBy} onChange={(ev) => patch(wd, { arriveBy: ev.target.value })} className="w-full min-h-11 rounded-lg border border-border bg-surface px-2" />
                    </label>
                    <label>
                      <span className="block text-muted">{t.onboarding.days.gridFlex}</span>
                      <Select value={e.arriveFlexMin} onChange={(ev) => patch(wd, { arriveFlexMin: Number(ev.target.value) })}>
                        {ARRIVE_FLEX.map((m) => (
                          <option key={m} value={m}>
                            {m} {t.app.minutes}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span className="block text-muted">{t.onboarding.days.gridDepart}</span>
                      <input type="time" step={300} value={e.departEarliest} onChange={(ev) => patch(wd, { departEarliest: ev.target.value })} className="w-full min-h-11 rounded-lg border border-border bg-surface px-2" />
                    </label>
                    <label>
                      <span className="block text-muted">{t.onboarding.days.gridStay}</span>
                      <Select value={e.departFlexMin} onChange={(ev) => patch(wd, { departFlexMin: Number(ev.target.value) })}>
                        {DEPART_FLEX.map((m) => (
                          <option key={m} value={m}>
                            {m} {t.app.minutes}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex items-center gap-2 min-h-11">
                      <input type="checkbox" checked={e.wantsAm} onChange={(ev) => patch(wd, { wantsAm: ev.target.checked })} className="h-4 w-4 accent-navy" />
                      {t.onboarding.days.gridAm}
                    </label>
                    <label className="flex items-center gap-2 min-h-11">
                      <input type="checkbox" checked={e.wantsPm} onChange={(ev) => patch(wd, { wantsPm: ev.target.checked })} className="h-4 w-4 accent-navy" />
                      {t.onboarding.days.gridPm}
                    </label>
                  </div>
                </div>
              );
            })}
        </section>
      )}

      <ChoiceGroup
        name="directions"
        legend={t.onboarding.days.share}
        help={t.onboarding.days.shareHelp}
        columns={3}
        value={directions}
        onChange={(v) => setDirections(v as "AM" | "PM" | "BOTH")}
        options={[
          { value: "AM", label: t.onboarding.days.shareAm },
          { value: "PM", label: t.onboarding.days.sharePm },
          { value: "BOTH", label: t.onboarding.days.shareBoth },
        ]}
      />

      <input type="hidden" name="payload" value={payload} />
      <StepActions pending={pending || days.length === 0} returnTo={returnTo} />
    </form>
  );
}
