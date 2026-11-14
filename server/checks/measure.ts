import type { Clearance, Crew, Element, Geometry, Id, Overlap, Point, TaskType } from "@site/contracts";
import {
  compass,
  convexHull,
  footprint,
  intersectConvex,
  isConvex,
  knownGeometry,
  midpoint,
  offsetAlong,
  polygonArea,
  sideTowards,
  squareAround,
  strip,
  wallFace,
  wallFrame,
  type Face,
} from "./geometry";
import { HOLD_FROM_M, MIN_OVERLAP_M2, TASK_GEOMETRY } from "./geometry-rules";
import { taskLabel } from "./rules";

// Owner: B. Measured geometry for latest_change (wall face clearance) and space_clash (work zone overlap).
// Pure functions: same input, same output. Numbers are rounded to the millimetre (0.01 m² for areas) on
// output only; decisions use the unrounded values.

type Segment = Extract<Geometry, { kind: "segment" }>;

const round = (v: number, step: number) => Math.round(v / step) * step;
const mm = (v: number) => Number(round(v, 0.001).toFixed(3));
const pt = (p: Point): Point => [mm(p[0]), mm(p[1])];
const m2 = (v: number) => v.toFixed(2);
const polygon = (points: Point[]): Geometry => ({ kind: "polygon", points: points.map(pt) });
const neg = (p: Point): Point => [-p[0], -p[1]];

export interface ClearanceInput {
  /** The wall's name, for the sentence. */
  name: string;
  crewName: string;
  taskType: TaskType;
  /** Where the crew believes the wall is. */
  believed: Geometry;
  /** Where the wall is per the record. */
  recorded: Geometry;
  /** The task's place (room polygon), used to pick the face the crew works on. */
  place?: Geometry;
}

export interface MeasuredClearance {
  clearance: Clearance;
  severity: "hold" | "warn";
  /** The numbers as a clause for the finding's summary sentence. */
  clause: string;
}

/** Signed move of the recorded face along n (positive: into the work side), largest at either end. */
function faceShift(believedFace: Face, recordedFace: Face, n: Point): number {
  const a = offsetAlong(recordedFace[0], believedFace, n);
  const b = offsetAlong(recordedFace[1], believedFace, n);
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

/**
 * latest_change, measured. The crew works along the face of the wall on its place's side (the side of the
 * centre line holding more of the place's area). The offset is perpendicular to the believed wall, between
 * the believed face and the same face per the record. If the record moved that face INTO the work side by
 * more than tolerance, work on the believed face lands inside the recorded wall; moved away: a gap.
 *
 * No place, or the place splits evenly across the wall: both faces are measured and the nearer recorded
 * face (smaller offset) is used. On a tie (a plain shift moves both faces equally) the face where the work
 * would land inside the wall is reported, the worse of the two, because the side is not on record.
 * Not two segments, or a zero-length wall: undefined (no measure, the check keeps its plain finding).
 */
export function measureClearance(input: ClearanceInput): MeasuredClearance | undefined {
  const { believed, recorded } = input;
  if (believed.kind !== "segment" || recorded.kind !== "segment") return undefined;
  const frame = wallFrame(believed);
  if (!frame || !wallFrame(recorded)) return undefined;

  const placePts = input.place ? footprint(input.place) : [];
  const sided = sideTowards(believed, placePts);
  const pick = (n: Point) => {
    const believedFace = wallFace(believed, n);
    const recordedFace = wallFace(recorded as Segment, n);
    return { n, believedFace, recordedFace, shift: faceShift(believedFace, recordedFace, n) };
  };
  let m = sided ? pick(sided) : undefined;
  if (!m) {
    const [l, r] = [pick(frame.normal), pick(neg(frame.normal))];
    const tie = Math.abs(Math.abs(l.shift) - Math.abs(r.shift)) < 0.0005;
    m = tie ? (l.shift >= r.shift ? l : r) : Math.abs(l.shift) < Math.abs(r.shift) ? l : r;
  }

  const rules = TASK_GEOMETRY[input.taskType];
  const offset = Math.abs(m.shift);
  const outcome: Clearance["outcome"] =
    m.shift > rules.toleranceM ? "inside_new_wall" : m.shift < -rules.toleranceM ? "gap" : "within_tolerance";
  const moved: Point = offset > 1e-9
    ? [m.n[0] * m.shift, m.n[1] * m.shift]
    : [midpoint(recorded)[0] - midpoint(believed)[0], midpoint(recorded)[1] - midpoint(believed)[1]];
  const direction = Math.hypot(moved[0], moved[1]) > 1e-9 ? compass(moved) : compass(m.n);
  const severity = outcome !== "within_tolerance" && offset >= HOLD_FROM_M ? "hold" : "warn";

  const face = `${compass(m.n)} face`;
  const tol = `${Math.round(rules.toleranceM * 1000)} mm`;
  const off = offset.toFixed(2);
  const task = taskLabel(input.taskType);
  const unknownSide = sided ? "" : " (the work side is not on record, so the nearer face is used)";
  const into = Math.min(offset, rules.clearanceM).toFixed(2);
  const result =
    outcome === "inside_new_wall"
      ? `${task} along the believed face would run into the recorded wall, which takes ${into} m of the ${rules.clearanceM.toFixed(2)} m work strip`
      : outcome === "gap"
        ? `${task} along the believed face would leave a ${off} m gap to the recorded face`
        : `that is within the ${tol} tolerance for ${task}`;
  const text =
    `Per the record, the ${face} of ${input.name} is ${off} m ${direction} of where ${input.crewName} believes it${unknownSide}: ` +
    `${result} (tolerance ${tol}).`;
  const clause =
    outcome === "inside_new_wall"
      ? `run into the recorded wall, whose ${face} reaches ${into} m into their work strip (tolerance ${tol})`
      : outcome === "gap"
        ? `leave a ${off} m gap at the ${face} (tolerance ${tol})`
        : `be ${off} m off at the ${face}, within the ${tol} tolerance`;

  return {
    severity,
    clause,
    clearance: {
      believedFace: [pt(m.believedFace[0]), pt(m.believedFace[1])],
      recordedFace: [pt(m.recordedFace[0]), pt(m.recordedFace[1])],
      offsetM: mm(offset),
      direction,
      requiredM: rules.clearanceM,
      outcome,
      workZone: polygon(strip(m.believedFace, m.n, rules.clearanceM)),
      text,
    },
  };
}

export interface ZoneInput {
  crewId: Id;
  taskType: TaskType;
  placeId?: Id;
  elementIds: Id[];
}

export interface WorkZone {
  /** Convex polygon, counter-clockwise. */
  points: Point[];
  /** Plain words: "all of Unit 206" or "a 0.90 m strip along Unit 206 living room niche wall". */
  described: string;
}

/**
 * Where a crew works: strips along the elements it names inside its place (walls: the clearance-deep strip
 * on the place's side of the face the crew believes in, both sides if the place splits evenly; fixtures: a
 * square of that half-size; zones: their polygon), cut to the place. No named element inside the place:
 * the whole place. Several pieces are joined by their convex hull, and a non-convex place is replaced by its
 * hull: both can only enlarge a zone (fail closed: an overlap may be over-reported, never hidden).
 * Unknown place, or a place with no area: undefined.
 */
export function workZone(elements: Element[], crews: Crew[], input: ZoneInput): WorkZone | undefined {
  const byId = (id: Id | undefined) => (id === undefined ? undefined : elements.find((e) => e.id === id));
  const place = byId(input.placeId);
  if (!place) return undefined;
  const { clearanceM } = TASK_GEOMETRY[input.taskType];
  const raw = place.geometry.kind === "point" ? squareAround(place.geometry.at, clearanceM) : footprint(place.geometry);
  const placePts = isConvex(raw) ? raw : convexHull(raw);
  if (placePts.length < 3 || polygonArea(placePts) <= 1e-9) return undefined;
  const crew = crews.find((c) => c.id === input.crewId);

  const named: { name: string; kind: Geometry["kind"] }[] = [];
  const pieces: Point[][] = [];
  for (const id of [...new Set(input.elementIds)].sort()) {
    const el = byId(id);
    if (!el || el.id === place.id) continue;
    const g = crew ? knownGeometry(el, crew) : el.geometry;
    let shapes: Point[][] = [];
    if (g.kind === "segment") {
      const frame = wallFrame(g);
      if (!frame) continue;
      const side = sideTowards(g, placePts);
      const sides = side ? [side] : [frame.normal, neg(frame.normal)];
      shapes = sides.map((n) => strip(wallFace(g, n), n, clearanceM));
    } else if (g.kind === "point") {
      shapes = [squareAround(g.at, clearanceM)];
    } else {
      shapes = [isConvex(g.points) ? g.points : convexHull(g.points)];
    }
    const cut = shapes.map((s) => intersectConvex(s, placePts)).filter((s) => s.length > 0);
    if (cut.length === 0) continue;
    pieces.push(...cut);
    named.push({ name: el.name, kind: g.kind });
  }

  if (pieces.length === 0) return { points: placePts, described: `all of ${place.name}` };
  const hull = pieces.length === 1 ? pieces[0] : convexHull(pieces.flat());
  if (hull.length < 3) return { points: placePts, described: `all of ${place.name}` };
  const described =
    named.length === 1 && named[0].kind === "segment"
      ? `a ${clearanceM.toFixed(2)} m strip along ${named[0].name}`
      : `the area around ${named.map((n) => n.name).join(", ")}`;
  return { points: hull, described };
}

export interface ZoneSide {
  crewId: Id;
  crewName: string;
  taskId: Id;
  zone: WorkZone;
}

/**
 * space_clash, measured: the intersection of two work zones. A clash needs at least MIN_OVERLAP_M2.
 * Under that, or no intersection: undefined.
 */
export function measureOverlap(a: ZoneSide, b: ZoneSide, when: string): Overlap | undefined {
  const inter = intersectConvex(a.zone.points, b.zone.points);
  const area = polygonArea(inter);
  if (inter.length === 0 || area < MIN_OVERLAP_M2) return undefined;
  return {
    areaM2: Number(round(area, 0.01).toFixed(2)),
    zone: polygon(inter),
    zones: [a, b].map((s) => ({ crewId: s.crewId, taskId: s.taskId, zone: polygon(s.zone.points) })),
    text:
      `Per the record, ${a.crewName}'s work zone (${a.zone.described}) and ${b.crewName}'s (${b.zone.described}) ` +
      `overlap by ${m2(area)} m² ${when}.`,
  };
}
