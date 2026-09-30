"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveHome, type StepState } from "@/app/(app)/onboarding/actions";
import { t } from "@/i18n";
import { Alert, Field, Input } from "@/components/ui";
import { StepActions } from "./shell";

const HomeMap = dynamic(() => import("./home-map"), { ssr: false, loading: () => <div className="h-64 rounded-xl bg-surface-2" /> });

type Hit = { label: string; lat: number; lng: number };

type Props = {
  initial: { homeAddress: string; homeLat: number | null; homeLng: number | null };
  siteCentre: { lat: number; lng: number };
  returnTo?: string;
};

export function HomeForm({ initial, siteCentre, returnTo }: Props) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveHome, null);
  const [query, setQuery] = useState(initial.homeAddress);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Hit | null>(
    initial.homeLat != null && initial.homeLng != null ? { label: initial.homeAddress, lat: initial.homeLat, lng: initial.homeLng } : null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photon type-ahead: 400 ms debounce, minimum 3 characters (§5 step 2).
  function search(value: string) {
    setQuery(value);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        setHits(res.ok ? await res.json() : []);
      } finally {
        setSearching(false);
      }
    }, 400);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function moved(p: { lat: number; lng: number }) {
    setChosen({ label: t.onboarding.home.searching, ...p });
    try {
      const res = await fetch(`/api/geo/reverse?lat=${p.lat}&lng=${p.lng}`);
      const { label } = res.ok ? await res.json() : { label: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` };
      setChosen({ label, ...p });
      setQuery(label);
    } catch {
      setChosen({ label: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, ...p });
    }
  }

  const centre = chosen ?? { ...siteCentre, label: "" };

  return (
    <form action={action}>
      {state?.errors?.form && <Alert kind="error">{t.onboarding.home.needAddress}</Alert>}
      <Field label={t.onboarding.home.search} htmlFor="addressSearch">
        <div className="relative">
          <Input
            id="addressSearch"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t.onboarding.home.searchPlaceholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && hits.length > 0}
            aria-controls="addressHits"
            aria-autocomplete="list"
          />
          {open && (searching || hits.length > 0) && (
            <ul id="addressHits" role="listbox" className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
              {searching && <li className="px-3 py-2 text-sm text-muted">{t.onboarding.home.searching}</li>}
              {hits.map((h) => (
                <li key={`${h.lat},${h.lng}`} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-surface-2"
                    onClick={() => {
                      setChosen(h);
                      setQuery(h.label);
                      setHits([]);
                      setOpen(false);
                    }}
                  >
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      {!searching && query.trim().length >= 3 && open && hits.length === 0 && !chosen && (
        <p className="text-sm text-muted mb-3">{t.onboarding.home.noResults}</p>
      )}
      <HomeMap lat={centre.lat} lng={centre.lng} onMove={moved} ariaLabel={t.onboarding.home.mapLabel} />
      <p className="mt-2 text-sm text-muted">{t.onboarding.home.dragHint}</p>
      {chosen && (
        <p className="mt-2 text-sm">
          <span className="text-muted">{t.onboarding.home.selected}: </span>
          <span data-testid="chosen-address">{chosen.label}</span>
        </p>
      )}
      <p className="mt-3 text-sm text-muted">{t.onboarding.home.privacyHint}</p>
      <input type="hidden" name="homeAddress" value={chosen?.label ?? ""} />
      <input type="hidden" name="homeLat" value={chosen?.lat ?? ""} />
      <input type="hidden" name="homeLng" value={chosen?.lng ?? ""} />
      <StepActions pending={pending || !chosen} returnTo={returnTo} />
    </form>
  );
}
