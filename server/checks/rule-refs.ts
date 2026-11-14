import type { CheckName, RuleRef } from "@site/contracts";

// The rule behind each finding, in plain words, for the "How it decided" trace.
// One entry per way a check can fire. Words only: the logic lives in the checks.

export const RULE = {
  unheardGeometry: {
    id: "latest_change.unheard_geometry",
    statement:
      "A crew's planned work touches an element whose latest position was said in a thread that crew does not read, so the crew may work from the earlier position.",
  },
  prerequisiteMissing: {
    id: "order_of_work.prerequisite_missing",
    statement: "This kind of work must follow a prerequisite in the same place, and no such prerequisite is on record.",
  },
  prerequisiteLater: {
    id: "order_of_work.prerequisite_later",
    statement: "This kind of work must follow a prerequisite in the same place, and the plan schedules it before that prerequisite is done.",
  },
  proposedElement: {
    id: "open_decision.proposed_element",
    statement: "Planned work depends on an element that is still only proposed: the decision is open, so the work may have to be redone.",
  },
  samePlaceAndTime: {
    id: "space_clash.same_place_and_slot",
    statement: "Two different crews are planned in the same place in overlapping time slots on the same day.",
  },
} as const satisfies Record<string, RuleRef>;

/** The rule a check fires by default, when the check has only one way to fire. */
export const DEFAULT_RULE: Partial<Record<CheckName, RuleRef>> = {
  latest_change: RULE.unheardGeometry,
  open_decision: RULE.proposedElement,
  space_clash: RULE.samePlaceAndTime,
};
