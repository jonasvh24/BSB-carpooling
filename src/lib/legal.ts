import { env } from "./env";
import { RETENTION } from "./retention";
import { MIN_CELL, MIN_GROUP } from "./admin/metrics";
import { t } from "@/i18n";

const ph = (what: string) => `[PLACEHOLDER: ${what}]`;

// Values the privacy notice and terms are filled with. Identity comes from the
// environment; anything not set shows as a visible placeholder rather than a
// blank, so an unfinished notice cannot be mistaken for a finished one.
export function legalVars(orgName: string | undefined) {
  return {
    app: t.app.name,
    org: orgName ?? ph("school name"),
    controller: env.CONTROLLER_NAME || ph("legal name of the operator"),
    address: env.CONTROLLER_ADDRESS || ph("registered address"),
    number: env.CONTROLLER_COMPANY_NUMBER || ph("company number"),
    email: env.PRIVACY_CONTACT_EMAIL || ph("privacy contact email"),
    dpo: env.DPO_CONTACT || ph("name and contact of the data protection officer, or \"none appointed\""),
    minGroup: MIN_GROUP,
    minCell: MIN_CELL,
    tripDays: RETENTION.tripAnonymiseDays,
    routeDays: RETENTION.routePointsDays,
    chatDays: RETENTION.endedPoolChatDays,
    notificationDays: RETENTION.notificationDays,
    requestDays: RETENTION.closedRequestDays,
    reportDays: RETENTION.resolvedReportDays,
    auditDays: RETENTION.auditDays,
    geoDays: RETENTION.geocodeCacheDays,
    routeCacheDays: RETENTION.routeCacheDays,
    invitationDays: RETENTION.invitationDays,
    backupDays: RETENTION.backupFiles,
  };
}
