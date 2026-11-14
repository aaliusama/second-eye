import type { Clearance, Finding, Overlap, PlanGraph, Rehearsal, StateResponse } from "@site/contracts";

// Owner: D. SAMPLE data shaped exactly like lanes B (finding.measure) and C (rehearsal.graph), so the
// web can draw them before those lanes land. Used by tests and by the dev-only `?sample=lanes` flag.
// Never imported by the live data path: App loads it with a dynamic import only in a dev build.
// The numbers below are illustrative, not measured. Simulated site data.

/** W-12, Unit 204 bathroom east wall. Plumbing works on the west face; the record moved the wall 0.4 m east. */
export const sampleClearance: Clearance = {
  believedFace: [[17.94, 2], [17.94, 5]],
  recordedFace: [[18.34, 2], [18.34, 5]],
  offsetM: 0.4,
  direction: "east",
  requiredM: 0.1,
  outcome: "gap",
  workZone: { kind: "polygon", points: [[17.64, 2], [17.94, 2], [17.94, 5], [17.64, 5]] },
  text: "Per the record the west face is 0.40 m east of the face Novak Plumbing last heard; pipework set on the old face leaves a 0.40 m gap (tolerance 0.10 m).",
};

/** Unit 206, Saturday morning: electrical rough-in and painting share part of the room. */
export const sampleOverlap: Overlap = {
  areaM2: 6,
  zone: { kind: "polygon", points: [[26.5, 2.2], [28, 2.2], [28, 6.2], [26.5, 6.2]] },
  zones: [
    { crewId: "crew-electrical", taskId: "task-m-165-1", zone: { kind: "polygon", points: [[25.2, 2.2], [28, 2.2], [28, 9.8], [25.2, 9.8]] } },
    { crewId: "crew-painting", taskId: "task-m-170-1", zone: { kind: "polygon", points: [[26.5, 2.2], [29.8, 2.2], [29.8, 6.2], [26.5, 6.2]] } },
  ],
  text: "Per the plan, electrical and painting work zones share 6.0 m² of Unit 206 on Saturday morning.",
};

/** Saturday's plan as a dependency graph: two rooms, one violated edge in each. */
export const sampleGraph: PlanGraph = {
  taskIds: ["task-m-162-1", "task-m-175-1", "task-m-165-1", "task-m-176-1", "task-m-170-1", "task-m-002-1"],
  edges: [
    { from: "task-m-162-1", to: "task-m-175-1", placeId: "room-203", reason: "close wall needs the inspection first", violated: true },
    { from: "task-m-165-1", to: "task-m-176-1", placeId: "room-206", reason: "close wall needs the electrical rough-in first", violated: false },
    { from: "task-m-176-1", to: "task-m-170-1", placeId: "room-206", reason: "paint needs the wall closed first", violated: true },
  ],
  criticalPath: ["task-m-165-1", "task-m-176-1", "task-m-170-1"],
  slips: [
    { taskId: "task-m-165-1", blocks: ["task-m-176-1", "task-m-170-1"], crewIds: ["crew-drywall", "crew-painting"] },
    { taskId: "task-m-176-1", blocks: ["task-m-170-1"], crewIds: ["crew-painting"] },
    { taskId: "task-m-162-1", blocks: ["task-m-175-1"], crewIds: ["crew-drywall"] },
  ],
};

const withMeasure = (f: Finding): Finding => {
  if (f.check === "latest_change" && f.ghost?.elementId === "W-12") return { ...f, measure: { clearance: sampleClearance } };
  if (f.check === "space_clash" && f.elementIds.includes("room-206")) return { ...f, measure: { overlap: sampleOverlap } };
  return f;
};

/** The state and rehearsal with the sample measure and graph added. New objects; the inputs are not changed. */
export function withLaneSamples(state: StateResponse, rehearsal: Rehearsal | undefined): { state: StateResponse; rehearsal: Rehearsal | undefined } {
  return {
    state: { ...state, findings: state.findings.map(withMeasure) },
    rehearsal: rehearsal && {
      ...rehearsal,
      frames: rehearsal.frames.map((fr) => ({ ...fr, findings: fr.findings.map(withMeasure) })),
      graph: sampleGraph,
    },
  };
}
