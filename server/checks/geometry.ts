import type { Crew, Element, ElementChange, Geometry, Point } from "@site/contracts";

// Owner: C. Local copy of the model's "heard" logic so checks do not depend on server/model.
// Keep in step with knownGeometry in server/model/index.ts.

/** Whether a crew has heard a change said in this thread. "drawing" is the shared baseline. */
export function heardThread(thread: string, crew: Crew): boolean {
  return thread === "drawing" || crew.threads.includes(thread) || thread === `dm:${crew.id}`;
}

/** History in version order (does not trust array order). */
function byVersion(element: Element): ElementChange[] {
  return [...element.history].sort((a, b) => a.version - b.version);
}

/** The latest geometry-bearing history entry the crew has heard, or the first geometry entry. */
export function knownGeometryEntry(element: Element, crew: Crew): ElementChange | undefined {
  const history = byVersion(element);
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.geometry && heardThread(h.thread, crew)) return h;
  }
  return history.find((h) => h.geometry);
}

/** Where the crew thinks the element is. */
export function knownGeometry(element: Element, crew: Crew): Geometry {
  return knownGeometryEntry(element, crew)?.geometry ?? element.geometry;
}

/** Geometry changes after the crew's known version that the crew has not heard, in version order. */
export function unheardGeometryChanges(element: Element, crew: Crew): ElementChange[] {
  const known = knownGeometryEntry(element, crew);
  const after = known ? known.version : 0;
  return byVersion(element).filter((h) => h.geometry && h.version > after && !heardThread(h.thread, crew));
}

const EPS = 1e-6;
const samePoint = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

export function sameGeometry(a: Geometry, b: Geometry): boolean {
  if (a.kind === "segment" && b.kind === "segment") {
    return samePoint(a.from, b.from) && samePoint(a.to, b.to) && Math.abs(a.thickness - b.thickness) < EPS;
  }
  if (a.kind === "polygon" && b.kind === "polygon") {
    return a.points.length === b.points.length && a.points.every((p, i) => samePoint(p, b.points[i]));
  }
  if (a.kind === "point" && b.kind === "point") return samePoint(a.at, b.at);
  return false;
}

/** Segment midpoint, polygon vertex average, or the point itself. */
export function midpoint(g: Geometry): Point {
  if (g.kind === "segment") return [(g.from[0] + g.to[0]) / 2, (g.from[1] + g.to[1]) / 2];
  if (g.kind === "point") return g.at;
  const n = g.points.length;
  return [g.points.reduce((s, p) => s + p[0], 0) / n, g.points.reduce((s, p) => s + p[1], 0) / n];
}

/** Whether a point lies inside a polygon (ray casting). Only polygons contain anything. */
export function inside(p: Point, area: Geometry): boolean {
  if (area.kind !== "polygon") return false;
  let hit = false;
  const pts = area.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const fmt = (v: number) => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);

/**
 * Dimension label from where the crew thinks the element is (ghost) to where it is per the record.
 * x is east, y is north, rounded to 0.1 m. Both axes are named when both round to at least 0.1 m,
 * north/south first ("0.3 m north, 0.4 m east"). "same position, changed shape" when the midpoint did not move.
 */
export function moveLabel(ghost: Geometry, current: Geometry): string {
  const [gx, gy] = midpoint(ghost);
  const [cx, cy] = midpoint(current);
  const dx = cx - gx;
  const dy = cy - gy;
  const parts: string[] = [];
  if (fmt(dy) !== "0.0") parts.push(`${fmt(dy)} m ${dy > 0 ? "north" : "south"}`);
  if (fmt(dx) !== "0.0") parts.push(`${fmt(dx)} m ${dx > 0 ? "east" : "west"}`);
  return parts.length ? parts.join(", ") : "same position, changed shape";
}
