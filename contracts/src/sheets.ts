import { z } from "zod";

const Evidence = z.object({ revision: z.string().min(1), sourceMessageId: z.string().min(1), time: z.string().min(1) });
export const SheetClaim = Evidence.extend({
  crewId: z.string().min(1),
  status: z.enum(["matches_record", "different_revision", "unknown"]),
});
export const SheetRecord = z.object({
  sheetId: z.string().min(1),
  latest: Evidence.optional(),
  uncertainty: z.string().optional(),
  sourceMessageIds: z.array(z.string().min(1)).min(1),
  claims: z.array(SheetClaim),
});
export const SheetRevisionResponse = z.object({
  basis: z.literal("explicit_text_only"),
  sheets: z.array(SheetRecord),
});
export type SheetClaim = z.infer<typeof SheetClaim>;
export type SheetRecord = z.infer<typeof SheetRecord>;
export type SheetRevisionResponse = z.infer<typeof SheetRevisionResponse>;
