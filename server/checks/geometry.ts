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

const fmt = (v: number) => {
  // Under 5 cm is noise and reads "0.0" (the old 0.1 m rounding floor). Above it, centimetre precision with one
  // trailing zero dropped: 0.4 m stays "0.4", a 25 cm move reads "0.25", not a rounded "0.3".
  if (Math.abs(v) < 0.05) return "0.0";
  const s = (Math.round(Math.abs(v) * 100) / 100).toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
};

/**
 * Dimension label from where the crew thinks the element is (ghost) to where it is per the record.
 * x is east, y is north, to the centimetre. Both axes are named when both round to at least 0.1 m,
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

// ---------- Plane geometry (lane B). Pure functions, metres, x east, y north. ----------

/** Below this area (m²) or length (m) a shape counts as empty: absorbs floating-point noise only. */
const AREA_EPS = 1e-9;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

/** Signed shoelace area: positive when the points run counter-clockwise. */
export function signedArea(points: Point[]): number {
  let s = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) s += cross(points[j], points[i]);
  return s / 2;
}

export const polygonArea = (points: Point[]) => Math.abs(signedArea(points));

/** Convex hull, counter-clockwise, no collinear points (Andrew's monotone chain). Fewer than 3 points: []. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return [];
  const half = (list: Point[]) => {
    const h: Point[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 2])) <= AREA_EPS) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  return hull.length >= 3 && polygonArea(hull) > AREA_EPS ? hull : [];
}

export function isConvex(points: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const z = cross(sub(b, a), sub(c, b));
    if (Math.abs(z) <= AREA_EPS) continue;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Keep the part of a polygon where (p - origin) . normal >= 0 (one Sutherland-Hodgman pass).
 * Works for any simple polygon as input; the half-plane is convex by nature.
 */
export function clipHalfPlane(points: Point[], origin: Point, normal: Point): Point[] {
  const side = (p: Point) => dot(sub(p, origin), normal);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const prev = points[(i + points.length - 1) % points.length];
    const sc = side(cur);
    const sp = side(prev);
    if (sc >= 0) {
      if (sp < 0) out.push(add(prev, scale(sub(cur, prev), sp / (sp - sc))));
      out.push(cur);
    } else if (sp >= 0) {
      out.push(add(prev, scale(sub(cur, prev), sp / (sp - sc))));
    }
  }
  return out;
}

/**
 * Intersection of two polygons by Sutherland-Hodgman. ASSUMPTION: `clip` is convex (any orientation);
 * `subject` may be any simple polygon. With a non-convex clip the result is wrong, so callers pass convex
 * shapes (rooms on this floor are rectangles; anything else goes through convexHull first, which can only
 * enlarge a zone: an over-reported overlap, never a missed one). Empty intersection: [].
 */
export function intersectConvex(subject: Point[], clip: Point[]): Point[] {
  const ccw = signedArea(clip) >= 0 ? clip : [...clip].reverse();
  let out = subject;
  for (let i = 0; i < ccw.length && out.length > 0; i++) {
    const a = ccw[i];
    const b = ccw[(i + 1) % ccw.length];
    const d = sub(b, a);
    out = clipHalfPlane(out, a, [-d[1], d[0]]); // left of a->b is inside for a CCW polygon
  }
  return out.length >= 3 && polygonArea(out) > AREA_EPS ? out : [];
}

type Segment = Extract<Geometry, { kind: "segment" }>;
export type Face = [Point, Point];

/** Unit direction along the wall centre line and its left normal. Zero-length wall: undefined. */
export function wallFrame(seg: Segment): { dir: Point; normal: Point; length: number } | undefined {
  const d = sub(seg.to, seg.from);
  const length = Math.hypot(d[0], d[1]);
  if (length <= AREA_EPS) return undefined;
  const dir = scale(d, 1 / length);
  return { dir, normal: [-dir[1], dir[0]], length };
}

/** The wall face on the side `outward` points to (a unit normal of the wall), from..to order kept. */
export function wallFace(seg: Segment, outward: Point): Face {
  const frame = wallFrame(seg);
  if (!frame) return [seg.from, seg.to];
  const n = dot(frame.normal, outward) >= 0 ? frame.normal : scale(frame.normal, -1);
  const off = scale(n, seg.thickness / 2);
  return [add(seg.from, off), add(seg.to, off)];
}

/** The wall as a rectangle (centre line plus thickness). */
export function wallRect(seg: Segment): Point[] {
  const frame = wallFrame(seg);
  if (!frame) return [];
  const off = scale(frame.normal, seg.thickness / 2);
  return [sub(seg.from, off), sub(seg.to, off), add(seg.to, off), add(seg.from, off)];
}

/** The strip of floor in front of a face: `depth` metres along the unit normal `into`. */
export function strip(face: Face, into: Point, depth: number): Point[] {
  const off = scale(into, depth);
  return [face[0], face[1], add(face[1], off), add(face[0], off)];
}

/** Square of half-side `r` around a point (a fixture's work area). */
export function squareAround(p: Point, r: number): Point[] {
  return [[p[0] - r, p[1] - r], [p[0] + r, p[1] - r], [p[0] + r, p[1] + r], [p[0] - r, p[1] + r]];
}

/** Signed distance of p from the line through face[0] along unit normal n. */
export const offsetAlong = (p: Point, face: Face, n: Point) => dot(sub(p, face[0]), n);

/** A polygon of the area an element covers on plan: polygon as is, wall as its rectangle, point: none. */
export function footprint(g: Geometry): Point[] {
  if (g.kind === "polygon") return g.points;
  if (g.kind === "segment") return wallRect(g);
  return [];
}

/**
 * Which side of a wall a place lies on, as the unit normal pointing into it: the side of the wall's centre
 * line that holds more of the place's area. Undefined when the areas tie (within 1%) or the place has no area.
 */
export function sideTowards(seg: Segment, place: Point[]): Point | undefined {
  const frame = wallFrame(seg);
  if (!frame || place.length < 3) return undefined;
  const left = polygonArea(clipHalfPlane(place, seg.from, frame.normal));
  const right = polygonArea(clipHalfPlane(place, seg.from, scale(frame.normal, -1)));
  if (left + right <= AREA_EPS || Math.abs(left - right) <= 0.01 * (left + right)) return undefined;
  return left > right ? frame.normal : scale(frame.normal, -1);
}

/** Compass word for a direction vector: the dominant axis, east/west on a tie. */
export function compass(v: Point): "north" | "south" | "east" | "west" {
  if (Math.abs(v[1]) > Math.abs(v[0]) + 1e-9) return v[1] > 0 ? "north" : "south";
  return v[0] >= 0 ? "east" : "west";
}
