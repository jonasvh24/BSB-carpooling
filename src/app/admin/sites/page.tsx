import { t } from "@/i18n";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Button, Card, Field, Input, PageTitle } from "@/components/ui";
import { saveSiteAction } from "../actions";

export const metadata = { title: t.admin.sites };
export const dynamic = "force-dynamic";

function SiteForm({ site }: { site?: { id: string; name: string; address: string; lat: number; lng: number; defaultArriveBy: string; defaultDepartEarliest: string; parkingNote: string | null; active: boolean } }) {
  const p = site?.id ?? "new";
  return (
    <form action={saveSiteAction} className="grid grid-cols-2 gap-x-3">
      <input type="hidden" name="id" value={site?.id ?? ""} />
      <div className="col-span-2">
        <Field label={t.admin.ui.site.name} htmlFor={`${p}-name`}>
          <Input id={`${p}-name`} name="name" defaultValue={site?.name} required />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t.admin.ui.site.address} htmlFor={`${p}-address`}>
          <Input id={`${p}-address`} name="address" defaultValue={site?.address} />
        </Field>
      </div>
      <Field label={t.admin.ui.site.lat} htmlFor={`${p}-lat`}>
        <Input id={`${p}-lat`} name="lat" type="number" step="any" defaultValue={site?.lat} required />
      </Field>
      <Field label={t.admin.ui.site.lng} htmlFor={`${p}-lng`}>
        <Input id={`${p}-lng`} name="lng" type="number" step="any" defaultValue={site?.lng} required />
      </Field>
      <Field label={t.admin.ui.site.arrive} htmlFor={`${p}-arrive`}>
        <Input id={`${p}-arrive`} name="defaultArriveBy" type="time" defaultValue={site?.defaultArriveBy ?? "08:15"} required />
      </Field>
      <Field label={t.admin.ui.site.depart} htmlFor={`${p}-depart`}>
        <Input id={`${p}-depart`} name="defaultDepartEarliest" type="time" defaultValue={site?.defaultDepartEarliest ?? "16:30"} required />
      </Field>
      <div className="col-span-2">
        <Field label={t.admin.ui.site.parking} htmlFor={`${p}-parking`} optional>
          <Input id={`${p}-parking`} name="parkingNote" defaultValue={site?.parkingNote ?? ""} />
        </Field>
      </div>
      <label className="col-span-2 mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={site?.active ?? true} className="h-4 w-4 accent-navy" /> {t.admin.ui.site.active}
      </label>
      <div className="col-span-2">
        <Button type="submit">{t.app.save}</Button>
      </div>
    </form>
  );
}

export default async function AdminSites() {
  const admin = await requireAdmin();
  const sites = await db.site.findMany({ where: { orgId: admin.orgId }, orderBy: { name: "asc" } });
  return (
    <>
      <PageTitle>{t.admin.sites}</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {sites.map((s) => (
          <Card key={s.id}>
            <h2 className="mb-2 font-medium">{s.name}</h2>
            <SiteForm site={s} />
          </Card>
        ))}
        <Card>
          <h2 className="mb-2 font-medium">{t.admin.ui.newSite}</h2>
          <SiteForm />
        </Card>
      </div>
    </>
  );
}
