import { z } from "zod";

export const DismissalRule = z.object({
  id: z.string().min(1), fingerprint: z.string().min(1), findingId: z.string().min(1),
  sourceMessageId: z.string().min(1), reason: z.string().trim().min(3).max(500),
  summary: z.string(), time: z.string().min(1), active: z.boolean(), undoneAt: z.string().optional(),
});
export const DismissalRequest = z.object({ findingId: z.string().min(1), reason: z.string().trim().min(3).max(500) });
export const DismissalsResponse = z.object({
  rules: z.array(DismissalRule),
  matches: z.array(z.object({ findingId: z.string(), ruleId: z.string() })),
});
export type DismissalRule = z.infer<typeof DismissalRule>;
export type DismissalRequest = z.infer<typeof DismissalRequest>;
export type DismissalsResponse = z.infer<typeof DismissalsResponse>;
