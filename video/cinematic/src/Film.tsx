import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

// The Second Eye film. Every product image is a still captured from the running app by capture.mjs
// (public/shots). Colours and type are the app's own tokens (web/src/tokens.ts). All site data shown is
// simulated, and every scene carries that label. Numbers are the ones `npm run eval` printed.

export const FPS = 30;
const C = { paper: "#EEF1F2", rule: "#D9DFE2", surface: "#FFFFFF", ink: "#1C2B3A", soft: "#526575", red: "#D4281C", clear: "#1F8A4C", pending: "#E0A100" };
const FONT = "'Archivo Variable', sans-serif";
const s = (sec: number) => Math.round(sec * FPS);

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
/** 0..1 between two frames, eased, clamped. */
const tween = (f: number, from: number, to: number, e = ease) => interpolate(f, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

// ---------- Shared pieces ----------

/** The drafting paper every scene sits on: the app's dot field. */
function Paper({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgb(28 43 58 / 0.11) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }} />
      {children}
      <div style={{ position: "absolute", right: 180, top: 70, display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: C.soft, fontStretch: "88%" }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: C.pending }} />
        Simulated site data
      </div>
    </AbsoluteFill>
  );
}

/** The app's own mark (web/src/App.tsx), drawn stroke by stroke. */
function Mark({ size, draw = 1 }: { size: number; draw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M4 27V5h24v22H4Zm8 0V13h16M4 13h8M21 5v8" fill="none" stroke={C.ink} strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
    </svg>
  );
}

/** Scene fade: in over the first frames, out over the last, so cuts are soft and all alike. */
function Fade({ dur, children }: { dur: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const o = Math.min(tween(f, 0, 12, Easing.linear), 1 - tween(f, dur - 12, dur, Easing.linear));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

/** Kicker and headline above the product window. */
function Caption({ step, title, line, at = 6 }: { step: string; title: string; line?: string; at?: number }) {
  const f = useCurrentFrame();
  const a = tween(f, at, at + 18);
  const b = tween(f, at + 8, at + 26);
  return (
    <div style={{ position: "absolute", left: 180, top: 52, right: 180 }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 10}px)`, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.soft, fontStretch: "85%" }}>{step}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 6 }}>
        <div style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px)`, fontSize: 50, fontWeight: 650, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{title}</div>
        {line && <div style={{ opacity: b, transform: `translateY(${(1 - b) * 14}px)`, fontSize: 25, color: C.soft, lineHeight: 1.25 }}>{line}</div>}
      </div>
    </div>
  );
}

type Cam = { x: number; y: number; z: number };
type Layer = { src: string; from?: number };

/**
 * The product window: one or more app stills (later ones cross-fade in at `from`), seen through a camera
 * that eases from one framing to the next. x, y are the point of the still held at the window's centre
 * (0..1), z is the zoom.
 */
function Window({ layers, cams, times }: { layers: Layer[]; cams: Cam[]; times: number[] }) {
  const f = useCurrentFrame();
  const W = 1560;
  const H = 877.5;
  const at = (k: keyof Cam) => (cams.length === 1 ? cams[0]![k] : interpolate(f, times, cams.map((c) => c[k]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: inOut }));
  const [x, y, z] = [at("x"), at("y"), at("z")];
  // Keep the still covering the window: the centre point cannot come closer to an edge than half a view.
  const cx = Math.min(1 - 0.5 / z, Math.max(0.5 / z, x));
  const cy = Math.min(1 - 0.5 / z, Math.max(0.5 / z, y));
  const enter = tween(f, 0, 22);
  const img: CSSProperties = { position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${W / 2 - cx * W * z}px, ${H / 2 - cy * H * z}px) scale(${z})` };
  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - W) / 2,
        top: 170,
        width: W,
        height: H,
        borderRadius: 16,
        overflow: "hidden",
        background: C.surface,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 28}px) scale(${0.985 + 0.015 * enter})`,
        boxShadow: "0 0 0 1px rgb(28 43 58 / 0.10), 0 2px 6px rgb(28 43 58 / 0.06), 0 30px 70px -20px rgb(28 43 58 / 0.30)",
      }}
    >
      {layers.map((l) => (
        <Img key={l.src + (l.from ?? 0)} src={staticFile(`shots/${l.src}.png`)} style={{ ...img, opacity: l.from === undefined ? 1 : tween(f, l.from, l.from + 14, Easing.linear) }} />
      ))}
    </div>
  );
}

/** A small label pinned over the window (which state of a toggle is showing). */
function Tag({ text, from, to }: { text: string; from: number; to: number }) {
  const f = useCurrentFrame();
  const o = Math.min(tween(f, from, from + 10), 1 - tween(f, to - 8, to, Easing.linear));
  return (
    <div style={{ position: "absolute", left: 212, top: 948, opacity: o, transform: `translateY(${(1 - o) * 8}px)`, background: C.ink, color: C.surface, fontSize: 26, fontWeight: 600, padding: "12px 20px", borderRadius: 8 }}>
      {text}
    </div>
  );
}

function Shot({ dur, step, title, line, layers, cams, times, tags = [] }: { dur: number; step: string; title: string; line?: string; layers: Layer[]; cams: Cam[]; times?: number[]; tags?: { text: string; from: number; to: number }[] }) {
  return (
    <Paper>
      <Fade dur={dur}>
        <Caption step={step} title={title} line={line} />
        <Window layers={layers} cams={cams} times={times ?? [20, dur - 20]} />
        {tags.map((t) => <Tag key={t.text} {...t} />)}
      </Fade>
    </Paper>
  );
}

// ---------- Scene 1: the problem, in the two messages that cause it ----------

function Bubble({ who, where, when, text, at, dark = false, note }: { who: string; where: string; when: string; text: string; at: number; dark?: boolean; note?: string }) {
  const f = useCurrentFrame();
  const a = tween(f, at, at + 20);
  const shown = Math.round(tween(f, at + 6, at + 6 + text.length * 0.9, Easing.linear) * text.length);
  return (
    <div style={{ opacity: a, transform: `translateY(${(1 - a) * 18}px)`, width: 760 }}>
      <div style={{ fontSize: 22, color: C.soft, marginBottom: 10, fontStretch: "88%" }}>
        <b style={{ color: C.ink, fontWeight: 650 }}>{where}</b> · {who} · {when}
      </div>
      <div style={{ background: dark ? C.ink : C.surface, color: dark ? C.surface : C.ink, fontSize: 34, lineHeight: 1.3, padding: "22px 28px", borderRadius: 18, minHeight: 132, boxShadow: "0 0 0 1px rgb(28 43 58 / 0.08), 0 14px 34px -14px rgb(28 43 58 / 0.25)" }}>
        {text.slice(0, shown)}
        <span style={{ opacity: 0 }}>{text.slice(shown)}</span>
      </div>
      {note && <div style={{ marginTop: 14, fontSize: 22, color: C.soft, opacity: tween(f, at + 50, at + 66) }}>{note}</div>}
    </div>
  );
}

function Problem({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const end = tween(f, s(6.6), s(7.4));
  return (
    <Paper>
      <Fade dur={dur}>
        <div style={{ position: "absolute", left: 160, top: 150, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.soft, opacity: tween(f, 4, 20) }}>One building site · two group chats</div>
        <div style={{ position: "absolute", left: 160, top: 250, display: "flex", gap: 80 }}>
          <Bubble where="Office thread" who="Lena Hofer" when="Thu 14:02" at={s(0.6)} text="Rev C: W-12 in the 204 bathroom moves 40 cm east so the vanity fits." note="The architect moves a bathroom wall." />
          <Bubble where="Site group" who="Marek" when="Fri 17:40" at={s(3.2)} dark text="tomorrow morning we rough in the 204 bath along the east wall" note="The plumbers do not read the office thread." />
        </div>
        <div style={{ position: "absolute", left: 160, top: 720, fontSize: 76, fontWeight: 650, letterSpacing: "-0.025em", opacity: end, transform: `translateY(${(1 - end) * 18}px)` }}>
          Two threads. One wall. <span style={{ color: C.red }}>40 cm apart.</span>
        </div>
      </Fade>
    </Paper>
  );
}

// ---------- Scene 2 and the last: the name and the promise ----------

function Title({ dur, closing = false }: { dur: number; closing?: boolean }) {
  const f = useCurrentFrame();
  const draw = tween(f, 6, 40, inOut);
  const name = tween(f, 26, 48);
  const promise = tween(f, 52, 76);
  const rule = tween(f, 44, 80, inOut);
  return (
    <Paper>
      <Fade dur={dur}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <Mark size={132} draw={draw} />
            <div style={{ fontSize: 132, fontWeight: 700, letterSpacing: "-0.035em", opacity: name, transform: `translateX(${(1 - name) * -24}px)` }}>Second Eye</div>
          </div>
          <div style={{ width: 900 * rule, height: 2, background: C.ink, marginTop: 36, opacity: 0.85 }} />
          <div style={{ marginTop: 36, fontSize: 46, fontWeight: 500, opacity: promise, transform: `translateY(${(1 - promise) * 14}px)` }}>
            See tomorrow's mistake <span style={{ color: C.red }}>before it gets built.</span>
          </div>
          {closing && (
            <div style={{ marginTop: 44, fontSize: 24, color: C.soft, opacity: tween(f, 90, 112), textAlign: "center", lineHeight: 1.5 }}>
              Every crew's stated plan, checked against one record of the floor.
              <br />
              It shows risks in the record, not what was built.
            </div>
          )}
        </AbsoluteFill>
      </Fade>
    </Paper>
  );
}

// ---------- The measured numbers, as printed by `npm run eval` ----------

function Numbers({ dur }: { dur: number }) {
  const f = useCurrentFrame();
  const rows: [string, number, number, number][] = [
    ["latest change", 6, 0, 0],
    ["space clash", 5, 0, 0],
    ["order of work", 3, 0, 0],
    ["open decision", 4, 0, 0],
  ];
  const big = (label: string, value: number, at: number, tone: string) => {
    const a = tween(f, at, at + 24);
    return (
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 18}px)` }}>
        <div style={{ fontSize: 190, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: tone, fontVariantNumeric: "tabular-nums" }}>{Math.round(value * tween(f, at, at + 30, Easing.out(Easing.cubic)))}</div>
        <div style={{ fontSize: 30, color: C.soft, marginTop: 8 }}>{label}</div>
      </div>
    );
  };
  return (
    <Paper>
      <Fade dur={dur}>
        <Caption step="Measured" title="Four checks, one labelled scenario" />
        <div style={{ position: "absolute", left: 180, top: 300, display: "flex", gap: 150 }}>
          {big("caught", 18, 20, C.ink)}
          {big("missed", 0, 32, C.ink)}
          {big("false alarms", 0, 44, C.ink)}
        </div>
        <div style={{ position: "absolute", left: 180, top: 640, width: 1160 }}>
          {rows.map(([name, caught, missed, alarms], i) => {
            const a = tween(f, 60 + i * 7, 78 + i * 7);
            return (
              <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 200px 200px 260px", fontSize: 30, padding: "12px 0", borderTop: `1px solid ${C.rule}`, opacity: a, fontVariantNumeric: "tabular-nums" }}>
                <span>{name}</span>
                <span style={{ textAlign: "right" }}>{caught} caught</span>
                <span style={{ textAlign: "right", color: C.soft }}>{missed} missed</span>
                <span style={{ textAlign: "right", color: C.soft }}>{alarms} false alarms</span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 180, bottom: 96, fontSize: 24, color: C.soft, opacity: tween(f, 96, 116) }}>
          npm run eval · replay golden · 18 labelled cases. Synthetic labelled scenario, not field results.
        </div>
      </Fade>
    </Paper>
  );
}

// ---------- The cut ----------

const plan = { x: 0.39, y: 0.66 };
const panel = { x: 0.87, y: 0.55 };
const whole: Cam = { x: 0.5, y: 0.5, z: 1 };

const SCENES: { dur: number; el: (dur: number) => ReactNode }[] = [
  { dur: s(8.5), el: (d) => <Problem dur={d} /> },
  { dur: s(4.6), el: (d) => <Title dur={d} /> },
  {
    dur: s(6.5),
    el: (d) => <Shot dur={d} step="1 · Build" title="Chat becomes one record" line="Every change to the floor keeps the message that said it." layers={[{ src: "beat-build" }]} cams={[whole, { x: 0.8, y: 0.55, z: 1.45 }]} />,
  },
  {
    dur: s(9),
    el: (d) => (
      <Shot dur={d} step="2 · The ghost wall" title="The mistake, before it is built" line="Red: where three crews would build. Ink: the wall per the record." layers={[{ src: "open" }, { src: "beat-ghost", from: s(2.2) }]} cams={[whole, whole, { ...plan, z: 2.0 }]} times={[0, s(2.6), s(6)]} />
    ),
  },
  {
    dur: s(9),
    el: (d) => (
      <Shot
        dur={d}
        step="2 · The ghost wall"
        title="One wall, three views"
        line="What the crews picture, the gap between, and what should be built."
        layers={[{ src: "ghost-earlier" }, { src: "beat-ghost", from: s(3) }, { src: "ghost-latest", from: s(6) }]}
        cams={[{ ...plan, z: 2.0 }]}
        tags={[
          { text: "Earlier position: the floor as the crews picture it", from: 10, to: s(3) },
          { text: "Compare: the 0.4 m gap, and whose work sits in it", from: s(3), to: s(6) },
          { text: "Latest record: the floor as it should be built", from: s(6), to: d - 6 },
        ]}
      />
    ),
  },
  {
    dur: s(6),
    el: (d) => <Shot dur={d} step="2 · The ghost wall" title="The same record, in 3D" line="One scene, two renderers. The plan is never a second source of truth." layers={[{ src: "ghost-3d" }]} cams={[{ x: 0.36, y: 0.55, z: 1.25 }, { x: 0.38, y: 0.6, z: 1.75 }]} />,
  },
  {
    dur: s(6.5),
    el: (d) => <Shot dur={d} step="3 · Who knows what" title="The floor as one crew knows it" line="Each crew reads different threads, so each works from its own version." layers={[{ src: "beat-why" }]} cams={[{ x: 0.42, y: 0.62, z: 1.35 }, { x: 0.8, y: 0.6, z: 1.6 }]} />,
  },
  {
    dur: s(6.5),
    el: (d) => <Shot dur={d} step="4 · How it decided" title="The model reads. Rules decide." line="Said, read into facts, then a fixed rule with the measured gap." layers={[{ src: "beat-decided" }]} cams={[{ x: 0.8, y: 0.3, z: 1.5 }, { x: 0.8, y: 0.72, z: 1.5 }]} />,
  },
  {
    dur: s(6),
    el: (d) => <Shot dur={d} step="5 · Rehearse" title="Tomorrow, played forward" line="What must finish first, and the critical path through the day." layers={[{ src: "beat-rehearse" }]} cams={[whole, { x: 0.25, y: 0.82, z: 2.0 }]} times={[14, 110]} />,
  },
  {
    dur: s(8),
    el: (d) => (
      <Shot
        dur={d}
        step="6 · Fix"
        title="One tap sends the correction"
        line="Sent is not heard. It stays open until the crew confirms this revision."
        layers={[{ src: "beat-fix" }, { src: "beat-confirm", from: s(4) }]}
        cams={[{ x: 0.8, y: 0.5, z: 1.45 }]}
        tags={[
          { text: "Sent · awaiting crew confirmation", from: 14, to: s(4) },
          { text: "Confirmed · the record is rechecked", from: s(4), to: d - 6 },
        ]}
      />
    ),
  },
  {
    dur: s(5.5),
    el: (d) => <Shot dur={d} step="7 · Ask" title="Crews ask. The record answers." line="HOLD or CLEAR, one reason, and the source." layers={[{ src: "beat-ask" }]} cams={[{ x: 0.8, y: 0.5, z: 1.3 }, { x: 0.82, y: 0.68, z: 1.7 }]} />,
  },
  {
    dur: s(8),
    el: (d) => (
      <Shot
        dur={d}
        step="8 · Learn"
        title="It learns the site's own words"
        line="No model is retrained. The stored correction changes the next run."
        layers={[{ src: "beat-learn" }, { src: "beat-run2", from: s(4) }]}
        cams={[{ x: 0.8, y: 0.45, z: 1.45 }]}
        tags={[
          { text: "Run 1: “the blue room” is not placed, so it asks", from: 14, to: s(4) },
          { text: "Run 2: same words, placed on its own", from: s(4), to: d - 6 },
        ]}
      />
    ),
  },
  { dur: s(7), el: (d) => <Numbers dur={d} /> },
  { dur: s(7), el: (d) => <Title dur={d} closing /> },
];

export const TOTAL = SCENES.reduce((n, sc) => n + sc.dur, 0);

export function Film() {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {SCENES.map((sc, i) => {
        const start = from;
        from += sc.dur;
        return (
          <Sequence key={i} from={start} durationInFrames={sc.dur}>
            {sc.el(sc.dur)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
