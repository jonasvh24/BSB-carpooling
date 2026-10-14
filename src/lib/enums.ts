import { z } from "zod";

// Every enum-like String column in prisma/schema.prisma is constrained here.
// Keeping them as Zod unions (not Prisma enums) keeps the schema Postgres-portable.

export const Role = z.enum(["MEMBER", "ADMIN"]);
export const UserStatus = z.enum(["ACTIVE", "SUSPENDED", "DELETED"]);
export const RideRole = z.enum(["DRIVER", "PASSENGER", "EITHER"]);
export const Directions = z.enum(["AM", "PM", "BOTH"]);
export const Direction = z.enum(["AM", "PM"]);
export const PickupStyle = z.enum(["DOOR", "MEETING_POINT"]);
export const Smoking = z.enum(["NO", "YES", "ANY"]);
export const Talk = z.enum(["QUIET", "CHATTY", "ANY"]);
export const Music = z.enum(["ANY", "NONE", "DRIVER_CHOICE"]);
export const GenderPref = z.enum(["ANY", "SAME"]);
export const Gender = z.enum(["FEMALE", "MALE", "OTHER"]);
export const CostMode = z.enum(["CONTRIBUTE", "ALTERNATE", "EITHER"]);
export const ExceptionKind = z.enum(["OFF", "CHANGED"]);
export const SurveyKey = z.enum(["ONBOARDING", "WEEK4", "EXIT"]);
export const ConsentScope = z.enum(["LOCATION_SHARING", "PILOT_RESEARCH"]);
export const MatchStatus = z.enum([
  "NEW",
  "SEEN",
  "DISMISSED_BY_DRIVER",
  "DISMISSED_BY_PASSENGER",
  "CONVERTED",
]);
export const RequestStatus = z.enum(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN"]);
export const PoolStatus = z.enum(["FORMING", "ACTIVE", "PAUSED", "ENDED"]);
export const MemberRole = z.enum(["DRIVER", "PASSENGER"]);
export const MemberStatus = z.enum(["ACTIVE", "LEFT"]);
export const TripStatus = z.enum(["PLANNED", "CONFIRMED", "CANCELLED", "DONE", "NOT_HAPPENED"]);
export const ParticipantStatus = z.enum(["IN", "OUT", "NO_SHOW", "UNKNOWN"]);
export const ReportStatus = z.enum(["OPEN", "RESOLVED"]);
export const GeoCacheKind = z.enum(["GEOCODE", "REVERSE", "ROUTE"]);
export const SuspendReason = z.enum(["CONDUCT", "SAFETY", "NOT_STAFF", "OTHER"]);
export const Language = z.enum(["nl", "fr", "en", "other"]);

export type Role = z.infer<typeof Role>;
export type UserStatus = z.infer<typeof UserStatus>;
export type RideRole = z.infer<typeof RideRole>;
export type Directions = z.infer<typeof Directions>;
export type Direction = z.infer<typeof Direction>;
export type PickupStyle = z.infer<typeof PickupStyle>;
export type Smoking = z.infer<typeof Smoking>;
export type Talk = z.infer<typeof Talk>;
export type Music = z.infer<typeof Music>;
export type GenderPref = z.infer<typeof GenderPref>;
export type Gender = z.infer<typeof Gender>;
export type CostMode = z.infer<typeof CostMode>;
export type ExceptionKind = z.infer<typeof ExceptionKind>;
export type SurveyKey = z.infer<typeof SurveyKey>;
export type ConsentScope = z.infer<typeof ConsentScope>;
export type MatchStatus = z.infer<typeof MatchStatus>;
export type RequestStatus = z.infer<typeof RequestStatus>;
export type PoolStatus = z.infer<typeof PoolStatus>;
export type MemberRole = z.infer<typeof MemberRole>;
export type MemberStatus = z.infer<typeof MemberStatus>;
export type TripStatus = z.infer<typeof TripStatus>;
export type ParticipantStatus = z.infer<typeof ParticipantStatus>;
export type ReportStatus = z.infer<typeof ReportStatus>;
export type GeoCacheKind = z.infer<typeof GeoCacheKind>;
export type Language = z.infer<typeof Language>;

// Notification kinds (§8.1). DRIVER_CANCELLED is always emailed and cannot be muted.
export const NotificationKind = z.enum([
  "REQUEST_RECEIVED",
  "REQUEST_ACCEPTED",
  "REQUEST_DECLINED",
  "POOL_PLAN_CHANGED",
  "DAILY_DIGEST",
  "DRIVER_CANCELLED",
  "TRIP_VERIFICATION",
  "NEW_MATCH",
  "WEEKLY_JOINED",
  "SURVEY",
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

// Helpers for the comma-list columns.
export const parseDays = (s: string | null | undefined): number[] =>
  (s ?? "")
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);

export const formatDays = (days: number[]): string =>
  Array.from(new Set(days))
    .sort((a, b) => a - b)
    .join(",");

export const parseList = (s: string | null | undefined): string[] =>
  (s ?? "")
    .split(",")
    // "@britishschool.be" and "britishschool.be" mean the same domain.
    .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
