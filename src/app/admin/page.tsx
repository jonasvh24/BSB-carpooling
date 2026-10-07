import { t, fmt } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { computeMetrics, heatCells, MIN_GROUP } from "@/lib/admin/metrics";
import { Alert, Button, Card, PageTitle } from "@/components/ui";
import { BarChart } from "@/components/bar-chart";
import { HeatMapClient } from "@/components/heat-map-client";
import { recomputeAction } from "./actions";

export const metadata = { title: t.admin.dashboard };
export const dynamic = "force-dynamic";

const pct = (x: number) => `${Math.round(x * 100)}%`;

// Each metric shows its definition on hover (title) and to screen readers.
function Metric({ label, def, value, sub }: { label: string; def: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3" title={def}>
      <p className="text-sm text-muted">
        {label}
        <span className="sr-only">. {def}</span>
      </p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ recomputed?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const m = await computeMetrics(admin.orgId, { withDiagnostics: true });
  const cells = await heatCells(admin.orgId);
  const site = await db.site.findFirst({ where: { orgId: admin.orgId, active: true } });
  const md = t.admin.metrics;
  const r = t.onboarding.research;
  const labelOf = (k: keyof typeof m.values) =>
    ({
      signupRate: md.signupRate,
      onboarding: md.onboarding,
      matchable: md.matchable,
      poolConversion: md.poolConversion,
      poolSurvival: md.poolSurvival,
      tripCadence: md.tripCadence,
      cancellation: md.cancellation,
      recommend: md.recommend,
      commercial: md.commercial,
    })[k];
  const fmtVal = (k: keyof typeof m.values, v: number) => (k === "tripCadence" ? v.toFixed(1) : pct(v));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageTitle sub={m.org.name}>{t.admin.dashboard}</PageTitle>
        <form action={recomputeAction}>
          <Button type="submit" variant="secondary">
            {t.admin.recompute}
          </Button>
        </form>
      </div>
      {sp.recomputed && <Alert kind="success">{fmt(t.admin.recomputed, { ms: sp.recomputed })}</Alert>}

      <section aria-labelledby="gonogo" className="mb-6">
        <h2 id="gonogo" className="mb-2 text-lg font-bold">
          {t.admin.goNoGo}
        </h2>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {m.goNoGo.map((g) => (
            <li key={g.key} className={`rounded-xl border p-3 ${g.ok ? "border-ok" : "border-danger"}`} title={`${labelOf(g.key)} ${g.lowerIsBetter ? "≤" : "≥"} ${fmtVal(g.key, g.threshold)}`}>
              <p className="text-sm text-muted">{labelOf(g.key)}</p>
              <p className={`text-xl font-semibold ${g.ok ? "text-ok" : "text-danger"}`}>{fmtVal(g.key, g.value)}</p>
              <p className="text-xs text-muted">
                {g.lowerIsBetter ? "≤" : "≥"} {fmtVal(g.key, g.threshold)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="density" className="mb-6">
        <h2 id="density" className="mb-2 text-lg font-bold">
          {t.admin.ui.density}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label={md.signupRate} def={md.signupRateDef} value={pct(m.values.signupRate)} sub={`${m.signups} / ${m.org.headcount}`} />
          <Metric label={md.onboarding} def={md.onboardingDef} value={pct(m.values.onboarding)} sub={`${m.completed} / ${m.signups}`} />
          <Metric label={md.matchable} def={md.matchableDef} value={pct(m.values.matchable)} sub={`${m.matchable} / ${m.completed} · ≤ ${m.org.threshold} min`} />
          <Metric label={md.roleSplit} def={md.roleSplitDef} value={`${m.roleSplit.DRIVER} / ${m.roleSplit.PASSENGER} / ${m.roleSplit.EITHER}`} sub={t.admin.ui.dash.driverPassengerEither} />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <BarChart title={md.unmatched} data={m.unmatched} labels={t.admin.unmatchedReasons} />
          <BarChart title={md.siteSplit} data={Object.fromEntries(m.siteSplit.map((s) => [s.site, s.users]))} />
        </div>
      </section>

      <section aria-labelledby="behaviour" className="mb-6">
        <h2 id="behaviour" className="mb-2 text-lg font-bold">
          {t.admin.ui.behaviour} · {m.trips.week}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label={md.pools} def={md.poolsDef} value={String(m.pools.active)} sub={`${m.pools.paused} ${t.admin.ui.dash.paused} · ${m.pools.ended} ${t.admin.ui.dash.ended} · ${t.admin.ui.dash.avg} ${m.pools.avgSize.toFixed(1)}`} />
          <Metric label={md.trips} def={md.tripsDef} value={`${m.trips.done} ${t.admin.ui.dash.done}`} sub={`${m.trips.planned} ${t.admin.ui.dash.planned} · ${m.trips.confirmed} ${t.admin.ui.dash.confirmed} · ${m.trips.cancelled} ${t.admin.ui.dash.cancelled}`} />
          <Metric label={md.cancellation} def={md.cancellationDef} value={pct(m.trips.cancellationRate)} sub={`${t.admin.ui.dash.noShow} ${pct(m.trips.noShowRate)}`} />
          <Metric label={md.tripCadence} def={md.tripCadenceDef} value={m.trips.cadence.toFixed(1)} />
        </div>
      </section>

      <section aria-labelledby="impact" className="mb-6">
        <h2 id="impact" className="mb-2 text-lg font-bold">
          {t.admin.ui.impact}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label={md.kmSaved} def={md.kmSavedDef} value={`${m.impact.kmSaved} km`} />
          <Metric label={md.co2} def={md.co2Def} value={`${m.impact.co2Kg} kg`} sub={`${m.org.co2GramsPerKm} g/km`} />
          <Metric label={md.money} def={md.moneyDef} value={`€${m.impact.moneyEur.toFixed(2)}`} sub={`${m.org.kmRateCents} c/km`} />
          <Metric label={md.parking} def={md.parkingDef} value={String(m.impact.parkingFreed)} />
        </div>
      </section>

      <section aria-labelledby="survey" className="mb-6">
        <h2 id="survey" className="mb-2 text-lg font-bold">
          {t.admin.ui.surveyHeading} · n = {m.survey.n}
        </h2>
        {m.survey.suppressed && <Alert>{fmt(t.admin.ui.suppressed, { min: MIN_GROUP })}</Alert>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <BarChart title={r.r1} data={m.survey.r1} labels={r.r1o} />
          <BarChart title={`${r.r2} · median ${m.survey.r2.median}`} data={m.survey.r2.buckets} />
          <BarChart title={r.r3} data={m.survey.r3} labels={r.r3o} />
          <BarChart title={r.r4} data={m.survey.r4} labels={r.r4o} />
          <BarChart title={r.r5} data={m.survey.r5} labels={r.r5o} />
          <BarChart title={r.r6} data={m.survey.r6} labels={r.r6o} />
          <BarChart title={r.r7} data={m.survey.r7} />
          <BarChart title={r.r8} data={m.survey.r8} labels={r.r8o} />
          <BarChart title={r.r9} data={m.survey.r9} labels={r.r9o} />
          <Card>
            <h3 className="text-sm font-medium">{r.r10}</h3>
            {m.survey.r10.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-sm">
                {m.survey.r10.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <p className="mt-2 text-sm text-muted">
          {t.survey.week4Title}: n = {m.week4.n}, {md.recommend} {pct(m.week4.recommend)} · {t.survey.exitTitle}: n = {m.exit.n}, {t.admin.ui.dash.keep} {m.exit.keep}, {t.admin.ui.dash.pay} {m.exit.pay}
        </p>
      </section>

      <section aria-labelledby="heat" className="mb-6">
        <h2 id="heat" className="mb-1 text-lg font-bold">
          {t.admin.heatmap}
        </h2>
        <p className="mb-2 text-sm text-muted">{t.admin.heatmapHelp}</p>
        {site && <HeatMapClient cells={cells} site={{ lat: site.lat, lng: site.lng, name: site.name }} ariaLabel={t.admin.heatmap} labels={{ cell: t.admin.ui.heatCell, coarse: t.admin.ui.heatCellCoarse }} />}
      </section>
    </>
  );
}
