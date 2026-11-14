import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Cam, Grid, Shot } from "../components";
import { color, ease, FONT, W } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const draw = (f: number, a: number, d: number) => interpolate(f, [a, a + d], [0, 1], { ...clamp, easing: ease.camera });

/** One line of text that arrives, holds, and leaves: one emphasised motion at a time. */
const Beat: React.FC<{ from: number; to: number; size?: number; color?: string; weight?: number; children: React.ReactNode }> = ({
  from, to, size = 64, color: c = color.ink, weight = 600, children,
}) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [from, from + 18], [0, 1], { ...clamp, easing: ease.arrive });
  const b = interpolate(f, [to - 12, to], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, opacity: Math.min(a, b), transform: `translateY(${(1 - a) * 16}px)`, fontSize: size, fontWeight: weight, color: c, fontFamily: FONT, fontStretch: "90%", letterSpacing: "-0.015em", lineHeight: 1.15 }}>
      {children}
    </div>
  );
};

/**
 * Opening: the problem drawn as a construction drawing. A wall moves 40 cm in the office;
 * the old line stays behind in red, which is exactly what the product will later find.
 * Illustration of the scenario, not the product UI.
 */
export const Opening: React.FC<{ cues?: number[]; dur?: number }> = ({ cues = [30, 150, 200, 244], dur = 330 }) => {
  const f = useCurrentFrame();
  const [c0, c1, c2, c3] = cues;
  const X0 = 400, Y0 = 400, U = 380, HGT = 380;
  const lines = [
    [X0, Y0, X0, Y0 + HGT], [X0 + U, Y0, X0 + U, Y0 + HGT], [X0 + 2 * U, Y0, X0 + 2 * U, Y0 + HGT], [X0 + 3 * U, Y0, X0 + 3 * U, Y0 + HGT],
    [X0 - 40, Y0 + HGT, X0 + 3 * U + 40, Y0 + HGT], [X0 - 40, Y0 + HGT + 70, X0 + 3 * U + 40, Y0 + HGT + 70],
  ];
  const wallBase = X0 + U + 230;
  const mv = c0 + 40; // the wall moves as the voice says "moves a bathroom wall"
  const move = interpolate(f, [mv, mv + 40], [0, 1], { ...clamp, easing: ease.camera });
  const wallX = wallBase + move * 44;
  const ghost = interpolate(f, [mv + 25, mv + 45], [0, 1], clamp);
  const label = interpolate(f, [mv + 46, mv + 64], [0, 1], { ...clamp, easing: ease.arrive });
  return (
    <AbsoluteFill>
      <Grid drift={0.15} />
      <svg width={W} height={1080} style={{ position: "absolute", inset: 0 }}>
        {lines.map(([x1, y1, x2, y2], i) => {
          const len = Math.hypot(x2 - x1, y2 - y1);
          const p = draw(f, 6 + i * 5, 40);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.ink} strokeWidth={i > 3 ? 3 : 6} strokeDasharray={len} strokeDashoffset={(1 - p) * len} />;
        })}
        {["Unit 203", "Unit 204", "Unit 205"].map((t, i) => (
          <text key={t} x={X0 + U * i + U / 2} y={Y0 + 70} textAnchor="middle" fontFamily={FONT} fontSize={40} fontWeight={600} fill={color.ink}
            style={{ fontStretch: "72%" }} opacity={draw(f, 40 + i * 4, 20)}>{t}</text>
        ))}
        {/* the old line, left behind */}
        <line x1={wallBase} y1={Y0 + 170} x2={wallBase} y2={Y0 + HGT} stroke={color.redline} strokeWidth={5} strokeDasharray="14 9" opacity={ghost} />
        {/* the bathroom wall */}
        <line x1={wallX} y1={Y0 + 170} x2={wallX} y2={Y0 + HGT} stroke={color.ink} strokeWidth={12}
          strokeDasharray={HGT - 170} strokeDashoffset={(1 - draw(f, 50, 30)) * (HGT - 170)} />
        <g opacity={label}>
          <line x1={wallBase} y1={Y0 + 130} x2={wallBase + 44} y2={Y0 + 130} stroke={color.redline} strokeWidth={3} />
          <line x1={wallBase} y1={Y0 + 116} x2={wallBase} y2={Y0 + 150} stroke={color.redline} strokeWidth={3} />
          <line x1={wallBase + 44} y1={Y0 + 116} x2={wallBase + 44} y2={Y0 + 150} stroke={color.redline} strokeWidth={3} />
          <text x={wallBase + 22} y={Y0 + 104} textAnchor="middle" fontFamily={FONT} fontSize={34} fontWeight={600} fill={color.redline} style={{ fontStretch: "72%" }}>0.4 m east</text>
        </g>
      </svg>
      <div style={{ position: "absolute", left: 120, top: 120, width: 1500, height: 200 }}>
        <Beat from={c0 - 6} to={c3 - 4} size={34} weight={500} color={color.inkSoft}>Thursday, 14:02. The office chat.</Beat>
        <div style={{ position: "absolute", top: 50, left: 0, right: 0 }}>
          <Beat from={c0} to={c1}>The architect moves a bathroom wall 40 cm.</Beat>
          <Beat from={c1} to={c2}>He posts it in the office chat.</Beat>
          <Beat from={c2} to={c3}>The plumbers are not in that chat.</Beat>
          <Beat from={c3} to={dur}>Saturday, they run pipe to the old line.</Beat>
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, bottom: 70, fontFamily: FONT, fontSize: 22, color: color.inkSoft, opacity: draw(f, 20, 20) }}>
        A scenario in simulated site data
      </div>
    </AbsoluteFill>
  );
};

/** The brand mark, drawn stroke by stroke, then the name and the promise. */
export const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const box = interpolate(f, [0, 22], [0.85, 1], { ...clamp, easing: ease.arrive });
  const boxO = interpolate(f, [0, 14], [0, 1], clamp);
  const strokes = draw(f, 10, 34);
  const red = interpolate(f, [46, 60], [0, 1], { ...clamp, easing: ease.arrive });
  const name = interpolate(f, [52, 74], [0, 1], { ...clamp, easing: ease.arrive });
  const tag = interpolate(f, [80, 100], [0, 1], { ...clamp, easing: ease.arrive });
  const LEN = 420;
  return (
    <AbsoluteFill style={{ background: color.ink, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <svg width={240} height={240} viewBox="0 0 96 96" style={{ transform: `scale(${box})`, opacity: boxO }}>
          <rect width="96" height="96" rx="22" fill="#24384B" />
          <path d="M22 74V22h52v52H22Zm20 0V44h32M22 44h20M58 22v22" fill="none" stroke={color.paper} strokeWidth={4}
            strokeDasharray={LEN} strokeDashoffset={(1 - strokes) * LEN} />
          <path d="M51 44v30" stroke={color.redline} strokeWidth={3} strokeDasharray="4 3" opacity={red} transform={`translate(0 ${(1 - red) * -6})`} />
        </svg>
        <div style={{ fontFamily: FONT, color: color.paper }}>
          <div style={{ fontSize: 128, fontWeight: 700, letterSpacing: "-0.03em", opacity: name, transform: `translateX(${(1 - name) * -20}px)`, lineHeight: 1 }}>Second Eye</div>
          <div style={{ fontSize: 44, fontWeight: 450, marginTop: 22, color: "#C9D3DA", opacity: tag, transform: `translateY(${(1 - tag) * 10}px)` }}>
            See tomorrow's mistake before it gets built.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** A small live crop of a capture, used for the loop overview. */
const Crop: React.FC<{ src: string; x: number; y: number; w: number; width: number }> = ({ src, x, y, w, width }) => {
  const s = width / w;
  const height = (width * 10) / 16;
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", borderRadius: 6, background: color.surface, boxShadow: "0 0 0 1px rgb(28 43 58 / .12), 0 14px 30px rgb(28 43 58 / .16)" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: 1440 * s, height: 900 * s, left: -x * s, top: -y * s }} />
    </div>
  );
};

/** Integration: how the steps form one loop on one record. Every tile is a real capture. */
export const Loop: React.FC = () => {
  const f = useCurrentFrame();
  const steps = [
    { t: "Build", d: "Messages become one sourced record", c: { src: "capture/build.png", x: 700, y: 170, w: 740 } },
    { t: "Check", d: "Four rules find the ghost", c: { src: "capture/ghost-wall.png", x: 360, y: 300, w: 560 } },
    { t: "Rehearse", d: "Tomorrow, played forward", c: { src: "capture/rehearse.png", x: 0, y: 560, w: 760 } },
    { t: "Send · confirm", d: "Amber until the crew replies", c: { src: "capture/send.png", x: 380, y: 330, w: 700 } },
    { t: "Learn", d: "Mapped once, known next run", c: { src: "capture/run-2.png", x: 540, y: 300, w: 640 } },
  ];
  const head = interpolate(f, [6, 26], [0, 1], { ...clamp, easing: ease.arrive });
  const line = draw(f, 30, 120);
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 120, top: 110, fontFamily: FONT, color: color.ink, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <div style={{ fontSize: 22, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, color: color.inkSoft }}>One loop</div>
        <div style={{ fontSize: 64, fontWeight: 650, fontStretch: "90%", letterSpacing: "-0.015em", marginTop: 12 }}>One record. One checking engine. Two triggers.</div>
        <div style={{ fontSize: 30, color: color.inkSoft, marginTop: 14 }}>The moment a crew states its plan, and again the evening before.</div>
      </div>
      <svg width={W} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={190} y1={720} x2={190 + 1540 * line} y2={720} stroke={color.ink} strokeWidth={3} />
      </svg>
      <div style={{ position: "absolute", left: 100, right: 100, top: 540, display: "flex", justifyContent: "space-between" }}>
        {steps.map((s, i) => {
          const a = interpolate(f, [34 + i * 22, 34 + i * 22 + 20], [0, 1], { ...clamp, easing: ease.arrive });
          return (
            <div key={s.t} style={{ width: 316, opacity: a, transform: `translateY(${(1 - a) * 18}px)`, fontFamily: FONT }}>
              <Crop {...s.c} width={316} />
              <div style={{ fontSize: 30, fontWeight: 650, color: color.ink, marginTop: 26 }}>{s.t}</div>
              <div style={{ fontSize: 22, color: color.inkSoft, marginTop: 6, lineHeight: 1.3 }}>{s.d}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * The cost, in one number. The figure and its source are quoted from docs/pitch.md
 * (PlanGrid and FMI, 2018, about 600 construction leaders). It counts up as the voice says it.
 */
export const Stat: React.FC<{ cues: number[]; dur: number }> = ({ cues, dur }) => {
  const f = useCurrentFrame();
  const [c0, c1] = cues;
  const n = Math.round(interpolate(f, [c1 + 10, c1 + 70], [0, 48], { ...clamp, easing: ease.arrive }));
  const show = interpolate(f, [c1, c1 + 16], [0, 1], { ...clamp, easing: ease.arrive });
  const src = interpolate(f, [c1 + 70, c1 + 90], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Grid />
      <div style={{ position: "absolute", left: 120, top: 150, width: 1600, height: 140 }}>
        <Beat from={c0} to={c1 + 6} size={60}>Nobody did anything wrong.</Beat>
        <div style={{ position: "absolute", top: 82, left: 0, right: 0 }}>
          <Beat from={c0 + 50} to={c1 + 6} size={60} color={color.inkSoft}>On Monday, someone pays to rip it out.</Beat>
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, top: 300, fontFamily: FONT, color: color.ink, opacity: show, transform: `translateY(${(1 - show) * 20}px)` }}>
        <div style={{ fontSize: 300, fontWeight: 720, fontStretch: "86%", letterSpacing: "-0.04em", lineHeight: 1 }}>
          {n}<span style={{ fontSize: 180 }}>%</span>
        </div>
        <div style={{ fontSize: 50, fontWeight: 560, fontStretch: "90%", maxWidth: 1300, lineHeight: 1.18, marginTop: 18 }}>
          of rework was attributed to poor communication and poor project information.
        </div>
        <div style={{ fontSize: 24, color: color.inkSoft, marginTop: 26, opacity: src }}>
          PlanGrid and FMI survey of about 600 construction leaders, 2018.
        </div>
      </div>
      {void dur}
    </AbsoluteFill>
  );
};

/** The close: mark, name, promise, where to try it, and the boundaries. */
export const End: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 24], [0, 1], { ...clamp, easing: ease.arrive });
  const b = interpolate(f, [30, 50], [0, 1], { ...clamp, easing: ease.arrive });
  const c = interpolate(f, [60, 80], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: color.ink, alignItems: "center", justifyContent: "center", fontFamily: FONT, color: color.paper }}>
      <div style={{ textAlign: "center", opacity: a, transform: `translateY(${(1 - a) * 12}px)` }}>
        <Img src={staticFile("mark.svg")} style={{ width: 120, height: 120 }} />
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 26 }}>Second Eye</div>
      </div>
      <div style={{ fontSize: 46, marginTop: 20, color: "#C9D3DA", opacity: b }}>See tomorrow's mistake before it gets built.</div>
      <div style={{ marginTop: 70, fontSize: 30, fontWeight: 600, opacity: c, padding: "14px 26px", border: "1.5px solid rgb(238 241 242 / .35)", borderRadius: 6 }}>
        site-rehearsal.onrender.com
      </div>
      <div style={{ position: "absolute", bottom: 64, fontSize: 21, color: "#8FA1AF", opacity: c, textAlign: "center", lineHeight: 1.5 }}>
        Talona · Context for the Physical World · proximata Hackathon '26
        <br />
        Simulated site data. The record shows what was said, not what was built.
      </div>
    </AbsoluteFill>
  );
};

export { Shot };
export type { Cam };
