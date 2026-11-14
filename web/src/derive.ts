import type { ChatMessage, Crew, Element, Finding, Fix, Geometry, PlanTask, Point, Rehearsal, RehearsalFrame, Scene } from "@site/contracts";
import { crewHues } from "./tokens";

// Owner: D. Pure helpers from server data to what the screen draws. No timers, no wall clock.

/** Live and rehearsal findings can share an id; the key keeps them apart. */
export const findingKey = (f: Finding) => `${f.id}:${f.trigger}`;

/** "2026-11-13T17:40:00" -> "Fri 13 Nov 17:40". Replay time is site time; read it as UTC so nothing shifts. */
export function formatTime(t: string): string {
  const d = new Date(`${t}Z`);
  if (Number.isNaN(d.getTime())) return t;
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day} ${t.slice(11, 16)}`;
}

export const clock = (t: string) => t.slice(11, 16);

export function crewById(scene: Scene, id: string): Crew | undefined {
  return scene.crews.find((c) => c.id === id);
}

export const crewName = (scene: Scene, id: string) => crewById(scene, id)?.name ?? id;

export function crewHue(scene: Scene, id: string): string {
  const i = scene.crews.findIndex((c) => c.id === id);
  return crewHues[(i < 0 ? 0 : i) % crewHues.length];
}

export const elementById = (scene: Scene, id: string | undefined): Element | undefined =>
  id === undefined ? undefined : scene.elements.find((e) => e.id === id);

export function messageMap(messages: ChatMessage[]): Map<string, ChatMessage> {
  return new Map(messages.map((m) => [m.id, m]));
}

/** "drawing:rev-B" -> "Drawing rev B". Other sources are message ids. */
export function sourceLabel(id: string): string | undefined {
  if (!id.startsWith("drawing:")) return undefined;
  return `Drawing ${id.slice("drawing:".length).replace(/-/g, " ")}`;
}

// ---------- Who knows what: each crew's version of the floor ----------
// Same rule as server/checks/geometry.ts (heardThread, knownGeometryEntry). Keep them in step.

/** Whether a crew could have heard a change said in this thread. "drawing" is the shared baseline. */
export function heardThread(thread: string, crew: Crew): boolean {
  return thread === "drawing" || crew.threads.includes(thread) || thread === `dm:${crew.id}`;
}

const byVersion = (el: Element) => [...el.history].sort((a, b) => a.version - b.version);

/** Where this crew believes the element is: the latest geometry it has heard. */
export function beliefGeometry(el: Element, crew: Crew | undefined): Geometry {
  if (!crew) return el.geometry;
  const h = byVersion(el);
  for (let i = h.length - 1; i >= 0; i--) if (h[i].geometry && heardThread(h[i].thread, crew)) return h[i].geometry!;
  return h.find((x) => x.geometry)?.geometry ?? el.geometry;
}

/** The changes to this element after the drawing that the crew has not heard. */
export function unheardChanges(el: Element, crew: Crew) {
  return byVersion(el).filter((h) => h.thread !== "drawing" && !heardThread(h.thread, crew));
}

/** The state this crew last heard for the element. */
export function beliefState(el: Element, crew: Crew | undefined): Element["state"] {
  if (!crew) return el.state;
  const h = byVersion(el);
  for (let i = h.length - 1; i >= 0; i--) if (h[i].state && heardThread(h[i].thread, crew)) return h[i].state!;
  return h.find((x) => x.state)?.state ?? el.state;
}

export function sameGeometry(a: Geometry, b: Geometry): boolean {
  const pa = pointsOf(a);
  const pb = pointsOf(b);
  return a.kind === b.kind && pa.length === pb.length && pa.every((p, i) => Math.abs(p[0] - pb[i][0]) < 1e-6 && Math.abs(p[1] - pb[i][1]) < 1e-6);
}

/** Dimension label, belief to record, x east and y north, to 0.1 m. Same wording as the server's moveLabel. */
export function offsetLabel(from: Geometry, to: Geometry): string {
  const [gx, gy] = midpoint(from);
  const [cx, cy] = midpoint(to);
  const f = (v: number) => {
    // Under 5 cm is noise and reads "0.0" (the old 0.1 m rounding floor). Above it, centimetre precision with one
    // trailing zero dropped: 0.4 m stays "0.4", a 25 cm move reads "0.25", not a rounded "0.3".
    if (Math.abs(v) < 0.05) return "0.0";
    const s = (Math.round(Math.abs(v) * 100) / 100).toFixed(2);
    return s.endsWith("0") ? s.slice(0, -1) : s;
  };
  const parts: string[] = [];
  if (f(cy - gy) !== "0.0") parts.push(`${f(cy - gy)} m ${cy > gy ? "north" : "south"}`);
  if (f(cx - gx) !== "0.0") parts.push(`${f(cx - gx)} m ${cx > gx ? "east" : "west"}`);
  return parts.length ? parts.join(", ") : "changed shape";
}

/** "office" -> "Office thread", "dm:crew-drywall" -> "Direct message to Walsh Drywall". */
export function threadLabel(scene: Scene, thread: string): string {
  if (thread.startsWith("dm:")) return `Direct message to ${crewName(scene, thread.slice(3))}`;
  const name = thread.replace(/[-_]/g, " ");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} thread`;
}

export type KnowledgeRow = {
  elementId: string;
  name: string;
  version: number;
  time: string;
  thread: string;
  sourceMessageId: string;
  what: string;
  /** Per crew, in scene order: heard, not heard, or not heard while the crew's planned work touches it. */
  cells: { crewId: string; heard: boolean; exposed: boolean }[];
};

/** "crewId|elementId" for every open finding: where the checks say a crew's work meets an element. */
export function flaggedPairs(findings: Finding[]): Set<string> {
  return new Set(findings.flatMap((f) => f.crewIds.flatMap((c) => [...f.elementIds, ...(f.ghost ? [f.ghost.elementId] : [])].map((e) => `${c}|${e}`))));
}

/**
 * Every change since the drawing, against every crew. Pure function of the scene; `flagged` (from the
 * open findings) marks an unheard change red only where the checks found that crew's work meets it.
 */
export function knowledgeMatrix(scene: Scene, flagged: Set<string> = new Set()): { rows: KnowledgeRow[]; versions: number } {
  const touches = (crewId: string, el: Element) => flagged.has(`${crewId}|${el.id}`);
  const rows: KnowledgeRow[] = scene.elements.flatMap((el) =>
    el.history
      .filter((h) => h.thread !== "drawing")
      .map((h) => ({
        elementId: el.id,
        name: el.name,
        version: h.version,
        time: h.time,
        thread: h.thread,
        sourceMessageId: h.sourceMessageId,
        what: h.geometry ? (h.operationType === "add" ? "added" : "moved") : h.state ? `now ${h.state}` : h.operationType.replace(/_/g, " "),
        cells: scene.crews.map((c) => {
          const heard = heardThread(h.thread, c);
          return { crewId: c.id, heard, exposed: !heard && touches(c.id, el) };
        }),
      })),
  );
  rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.elementId.localeCompare(b.elementId)));
  // Crews that heard exactly the same changes share one version of the floor.
  const versions = new Set(scene.crews.map((_, i) => rows.map((r) => (r.cells[i].heard ? 1 : 0)).join(""))).size;
  return { rows, versions };
}

/** Sending a confirmation request does not resolve the uncertainty it asks about. */
export function resolvedFindingIds(fixes: Fix[], findings: Finding[]): Set<string> {
  const warnings = new Set(findings.filter((f) => f.severity === "warn" || f.check === "latest_change").map((f) => f.id));
  return new Set(fixes.filter((f) => f.status === "approved" && f.kind !== "ask_crew" && !warnings.has(f.findingId)).map((f) => f.findingId));
}

// ---------- Rehearsal slider ----------

/** Slider steps: tomorrow 07:00 to 17:00 in half hours. */
export const SLIDER_STEPS = 20;
export const sliderClock = (step: number) => {
  const minutes = 7 * 60 + step * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
export const slotOfStep = (step: number): "morning" | "afternoon" => (step < 10 ? "morning" : "afternoon");

/** The rehearsal frame for a slider step: morning frame before 12:00, afternoon after. Pure. */
export function frameAt(rehearsal: Rehearsal | undefined, step: number): RehearsalFrame | undefined {
  if (!rehearsal) return undefined;
  const clockTime = slotOfStep(step) === "morning" ? "07:00" : "12:00";
  return rehearsal.frames.find((f) => clock(f.time) === clockTime);
}

export function tasksOfDay(scene: Scene, day: string | undefined): PlanTask[] {
  if (!day) return [];
  return scene.tasks.filter((t) => t.day === day && t.status !== "cancelled");
}

/** Slider steps where a frame has findings: marked in redline on the track before scrubbing. */
export function troubleSteps(rehearsal: Rehearsal | undefined, resolved: Set<string> = new Set()): Set<number> {
  const out = new Set<number>();
  for (let s = 0; s < SLIDER_STEPS; s++) {
    if ((frameAt(rehearsal, s)?.findings ?? []).some((f) => !resolved.has(f.id))) out.add(s);
  }
  return out;
}

// ---------- Geometry ----------

export function pointsOf(g: Geometry): Point[] {
  if (g.kind === "segment") return [g.from, g.to];
  if (g.kind === "polygon") return g.points;
  return [g.at];
}

export function midpoint(g: Geometry): Point {
  const ps = pointsOf(g);
  return [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
}

/** A wall segment as its outline rectangle. */
export function segmentOutline(from: Point, to: Point, thickness: number): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return [
    [from[0] + nx, from[1] + ny],
    [to[0] + nx, to[1] + ny],
    [to[0] - nx, to[1] - ny],
    [from[0] - nx, from[1] - ny],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Geometry part way from a to b. Shapes that cannot blend jump to b. */
export function blendGeometry(a: Geometry, b: Geometry, t: number): Geometry {
  if (a.kind === "segment" && b.kind === "segment") {
    return { kind: "segment", from: lerpPoint(a.from, b.from, t), to: lerpPoint(a.to, b.to, t), thickness: lerp(a.thickness, b.thickness, t) };
  }
  if (a.kind === "point" && b.kind === "point") return { kind: "point", at: lerpPoint(a.at, b.at, t) };
  if (a.kind === "polygon" && b.kind === "polygon" && a.points.length === b.points.length) {
    return { kind: "polygon", points: a.points.map((p, i) => lerpPoint(p, b.points[i], t)) };
  }
  return b;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxOf(points: Point[], pad = 0): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
}

export const lerpBox = (a: Box, b: Box, t: number): Box => ({
  minX: lerp(a.minX, b.minX, t),
  minY: lerp(a.minY, b.minY, t),
  maxX: lerp(a.maxX, b.maxX, t),
  maxY: lerp(a.maxY, b.maxY, t),
});

/** Which room or zone contains a point (by polygon test); used to frame the ghost reveal. */
export function containingPlace(scene: Scene, p: Point): Element | undefined {
  return scene.elements.find((e) => (e.type === "room" || e.type === "zone") && e.geometry.kind === "polygon" && inside(p, e.geometry.points));
}

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

// ---------- Presenter focus ----------

/** The wall the demo story is about (the presenter's ghost-wall beats). */
export const STORY_ELEMENT = "W-12";
/** Beats that tell the one ghost-wall story: only that finding is drawn in redline. */
export const STORY_BEATS: ReadonlySet<string> = new Set(["ghost", "why", "fix", "confirm"]);

/** Whether a finding concerns work on `day`. A finding with no known task is kept (nothing to say it is another day). */
export function onDay(scene: Scene, f: Finding, day: string | undefined): boolean {
  if (!day) return true;
  const days = f.taskIds.map((id) => scene.tasks.find((t) => t.id === id)?.day).filter((d): d is string => d !== undefined);
  return days.length === 0 || days.includes(day);
}

/**
 * One ghost per incident: the same element, the same crews and the same ghost line (a crew restating
 * its plan live and the replayed message are one mistake, not two). Live wins, then the latest.
 */
export function oneGhostPerIncident(ghosts: Finding[]): Finding[] {
  const key = (f: Finding) => `${f.ghost!.elementId}|${[...f.crewIds].sort().join(",")}|${JSON.stringify(f.ghost!.geometry)}`;
  const rank = (f: Finding) => `${f.trigger === "live" ? 1 : 0}|${f.time}|${f.id}`;
  const best = new Map<string, Finding>();
  for (const f of ghosts) {
    const k = key(f);
    const cur = best.get(k);
    if (!cur || rank(f) > rank(cur)) best.set(k, f);
  }
  return [...best.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Latest-change findings whose correction was sent but not yet confirmed by the crew (they stay open). */
export function sentNotConfirmed(fixes: Fix[], findings: Finding[]): Set<string> {
  const latest = new Set(findings.filter((f) => f.check === "latest_change").map((f) => f.id));
  return new Set(fixes.filter((x) => x.status === "approved" && x.kind !== "ask_crew" && latest.has(x.findingId)).map((x) => x.findingId));
}
