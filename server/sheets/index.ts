import type { ChatMessage, SheetRecord, SheetRevisionResponse } from "@site/contracts";

/** Explicit text ledger only. It neither reads attachments nor infers alphabetical revision order. */
export function sheetRevisions(messages: ChatMessage[]): SheetRevisionResponse {
  const sheets = new Map<string, SheetRecord>();
  const conflictAt = new Map<string, string>();
  // Stable timestamp order preserves record order for ties; contradictory simultaneous issues are unknown.
  for (const message of [...messages].sort((a, b) => a.time.localeCompare(b.time))) {
    if (message.senderRole === "system") continue;
    const mentions = [...message.text.matchAll(/\b([A-Z]{1,3}-\d{2,4})\s+(?:rev(?:ision)?\.?\s+)([A-Z0-9]+)\b/gi)];
    const sheetIds = [...new Set(mentions.map((m) => m[1]!.toUpperCase()))];
    if (!sheetIds.length) continue;
    const office = ["architect", "office", "superintendent"].includes(message.senderRole);
    const crew = ["crew", "crew_lead"].includes(message.senderRole) && message.crewId;
    const issued = /\b(issued|published|latest|current)\b/i.test(message.text);
    const using = /\b(?:we(?:'re| are)?\s+(?:on|using|working from)|i(?:'m| am)?\s+(?:on|using)|using|working from)\b/i.test(message.text);
    const uncertain = /\?|\b(maybe|perhaps|possibly|unsure|not|never|aren't|isn't|don't|unconfirmed|draft|proposed|will|might|could|should|planned|to be issued)\b/i.test(message.text);
    const withdrawn = /\b(retracted|withdrawn|revoked|superseded|void)\b/i.test(message.text);
    if (!(office && (issued || withdrawn)) && !(crew && using)) continue;
    for (const sheetId of sheetIds) {
      const row = sheets.get(sheetId) ?? { sheetId, claims: [], sourceMessageIds: [] };
      const revisions = [...new Set(mentions.filter((m) => m[1]!.toUpperCase() === sheetId).map((m) => m[2]!.toUpperCase()))];
      row.sourceMessageIds = [...new Set([...row.sourceMessageIds, message.id])];
      if (office) {
        if (uncertain || withdrawn || revisions.length !== 1) {
          // A question/draft cannot overwrite a known issued record. Explicit withdrawal or
          // conflicting issue text invalidates it until another unambiguous issuance arrives.
          if (withdrawn || (!uncertain && revisions.length !== 1)) {
            row.latest = undefined;
            row.uncertainty = "Issued revision needs confirmation from the office.";
          } else if (!row.latest) row.uncertainty = "No unambiguous issued revision found.";
        } else {
          const revision = revisions[0]!;
          if (conflictAt.get(sheetId) === message.time || (row.latest?.time === message.time && row.latest.revision !== revision)) {
            conflictAt.set(sheetId, message.time);
            row.latest = undefined;
            row.uncertainty = "Conflicting revisions were issued at the same recorded time.";
          } else {
            row.latest = { revision, sourceMessageId: message.id, time: message.time };
            row.uncertainty = undefined;
          }
        }
      } else if (crew) {
        const old = row.claims.findIndex((c) => c.crewId === message.crewId);
        const claim = { crewId: message.crewId!, revision: revisions.length === 1 && !uncertain ? revisions[0]! : "not found", sourceMessageId: message.id, time: message.time, status: "unknown" as const };
        if (old === -1) row.claims.push(claim); else row.claims[old] = claim;
      }
      sheets.set(sheetId, row);
    }
  }
  for (const row of sheets.values()) for (const claim of row.claims) {
    claim.status = !row.latest || claim.revision === "not found" ? "unknown" : claim.revision === row.latest.revision ? "matches_record" : "different_revision";
  }
  return { basis: "explicit_text_only", sheets: [...sheets.values()].sort((a, b) => a.sheetId.localeCompare(b.sheetId)) };
}
