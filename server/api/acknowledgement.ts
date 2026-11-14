import type { Element, IncidentReceipt, Scene } from "@site/contracts";

/** Acknowledgements record receipt, not a new design revision. */
export function revisionSignature(element: Element): string {
  const revision = [...element.history].reverse().find((entry) => !entry.sourceMessageId.startsWith("ack-"));
  return JSON.stringify([element.geometry, element.state, revision?.sourceMessageId, revision?.confidence]);
}

export function receiptStatus(receipt: IncidentReceipt, scene: Scene): IncidentReceipt["status"] {
  if (receipt.revisions.some((snapshot) => {
    const element = scene.elements.find((e) => e.id === snapshot.elementId);
    return !element || revisionSignature(element) !== snapshot.signature;
  })) return "superseded";
  return receipt.crews.every((crew) => crew.acknowledgedMessageId) ? "confirmed" : "awaiting_confirmation";
}
