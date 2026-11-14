import { z } from "zod";

// Standalone schemas avoid a circular runtime dependency on the main contract module.
export const AcknowledgeFixRequest = z.object({ crewId: z.string().min(1) });
export const IncidentReceipt = z.object({
  fixId: z.string(), findingId: z.string(), summary: z.string(), sourceMessageId: z.string(),
  evidenceMessageIds: z.array(z.string()), sentAt: z.string(),
  revisions: z.array(z.object({ elementId: z.string(), name: z.string(), version: z.number(), sourceMessageId: z.string(), signature: z.string() })),
  crews: z.array(z.object({ crewId: z.string(), crewName: z.string(), sentMessageId: z.string(), acknowledgedMessageId: z.string().optional(), acknowledgedAt: z.string().optional() })),
  status: z.enum(["awaiting_confirmation", "confirmed", "superseded"]),
});
export const AcknowledgementsResponse = z.object({ receipts: z.array(IncidentReceipt) });
export const AcknowledgeFixResponse = z.object({ receipt: IncidentReceipt, sourceMessageId: z.string() });
export type AcknowledgeFixRequest = z.infer<typeof AcknowledgeFixRequest>;
export type IncidentReceipt = z.infer<typeof IncidentReceipt>;
export type AcknowledgementsResponse = z.infer<typeof AcknowledgementsResponse>;
export type AcknowledgeFixResponse = z.infer<typeof AcknowledgeFixResponse>;
