import { z } from "zod";

// §13 go/no-go thresholds, editable in admin. Stored as JSON text on the organisation.
export const Thresholds = z.object({
  signupRate: z.number().min(0).max(1).default(0.3),
  onboarding: z.number().min(0).max(1).default(0.8),
  matchable: z.number().min(0).max(1).default(0.5),
  poolConversion: z.number().min(0).max(1).default(0.25),
  poolSurvival: z.number().min(0).max(1).default(0.6),
  tripCadence: z.number().min(0).default(3),
  cancellation: z.number().min(0).max(1).default(0.15),
  recommend: z.number().min(0).max(1).default(0.6),
  commercial: z.number().min(0).max(1).default(0.5),
});
export type Thresholds = z.infer<typeof Thresholds>;

export function parseThresholds(text: string | null | undefined): Thresholds {
  try {
    return Thresholds.parse(JSON.parse(text || "{}"));
  } catch {
    return Thresholds.parse({});
  }
}
