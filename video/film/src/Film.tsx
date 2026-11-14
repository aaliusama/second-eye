import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Burst, Cam, ChapterBar, Fade, Grid, Mark, Shot, SimLabel, VoiceCaption } from "./components";
import { End, Loop, Opening, Reveal, Stat } from "./scenes/Designed";
import { color, ease, FONT } from "./theme";
import { CHAPTERS, cue, FPS, layout, SceneId, TOTAL, VOICE } from "./timeline";

const C = (src: string) => `capture/${src}`;
const burst = (name: string, n: number) => Array.from({ length: n }, (_, i) => C(`${name}-burst-${String(i).padStart(2, "0")}.jpg`));
type P = { dur: number };
const say = (id: SceneId, kicker: string, dur: number, extra: Partial<React.ComponentProps<typeof VoiceCaption>> = {}) => (
  <VoiceCaption kicker={kicker} lines={VOICE[id] ?? []} dur={dur} fps={FPS} {...extra} />
);

// --- Product scenes. Camera rectangles are CSS px of the 1440x900 capture (capture/manifest.json).
// Moves and state changes are cued to the voice: cue(scene, i) is the frame where line i starts.

const Overview: React.FC<P> = ({ dur }) => {
  const cam: Cam[] = [{ f: 0, x: 0, y: 0, w: 1440 }, { f: dur, x: 0, y: 24, w: 1340 }];
  return (<><Shot layers={[{ src: C("problem.png") }]} cam={cam} />{say("overview", "The superintendent's desk", dur)}</>);
};

const Build: React.FC<P> = ({ dur }) => {
  const m = cue("build", 1);
  const cam: Cam[] = [{ f: 0, x: 0, y: 30, w: 1440 }, { f: m - 20, x: 0, y: 30, w: 1440 }, { f: m + 50, x: 700, y: 170, w: 740 }];
  return (
    <>
      <Shot layers={[{ src: C("build.png") }]} cam={cam} />
      <Mark rect={{ x: 1068, y: 222, w: 364, h: 268 }} cam={cam} at={m + 55} />
      {say("build", "Every message, sourced", dur)}
    </>
  );
};

const Ghost: React.FC<P> = ({ dur }) => {
  const b = cue("ghost", 1) - 10; // the reveal plays as the voice says "and draws the problem"
  const hold = cue("ghost", 4);
  const cam: Cam[] = [
    { f: 0, x: 0, y: 60, w: 1180 },
    { f: b + 40, x: 0, y: 60, w: 1180 },
    { f: b + 110, x: 380, y: 355, w: 560 },
    { f: hold - 10, x: 380, y: 355, w: 560 },
    { f: hold + 55, x: 500, y: 300, w: 940 },
  ];
  return (
    <>
      <Sequence from={0} durationInFrames={b}><Shot layers={[{ src: C("ghost-wall-burst-00.jpg") }]} cam={cam} /></Sequence>
      <Sequence from={b}><Burst files={burst("ghost-wall", 8)} hold={5} then={C("ghost-wall.png")} cam={cam.map((k) => ({ ...k, f: k.f - b }))} /></Sequence>
      <Mark rect={{ x: 1082, y: 586, w: 312, h: 148 }} cam={cam} at={hold + 60} />
      {say("ghost", "The ghost wall", dur, { sides: [{ from: 0, side: "right" }, { from: hold - 4, side: "left" }] })}
    </>
  );
};

const Why: React.FC<P> = ({ dur }) => {
  const m = cue("why", 1);
  const cam: Cam[] = [{ f: 0, x: 0, y: 70, w: 1100 }, { f: m - 10, x: 0, y: 70, w: 1100 }, { f: m + 60, x: 560, y: 300, w: 880 }];
  return (
    <>
      <Shot layers={[{ src: C("why.png") }]} cam={cam} />
      <Mark rect={{ x: 1080, y: 443, w: 340, h: 84 }} cam={cam} at={m + 66} />
      {say("why", "Why it happens", dur)}
    </>
  );
};

const Rehearse: React.FC<P> = ({ dur }) => {
  const m = cue("rehearse", 1);
  const cam: Cam[] = [{ f: 0, x: 0, y: 395, w: 900 }, { f: m - 10, x: 0, y: 395, w: 900 }, { f: m + 60, x: 0, y: 40, w: 1060 }];
  return (<><Shot layers={[{ src: C("rehearse.png") }]} cam={cam} />{say("rehearse", "Rehearse tomorrow", dur, { sides: [{ from: 0, side: "right" }] })}</>);
};

const Send: React.FC<P> = ({ dur }) => {
  const cam: Cam[] = [{ f: 0, x: 380, y: 250, w: 1060 }, { f: dur, x: 400, y: 260, w: 1020 }];
  return (
    <>
      <Shot layers={[{ src: C("ghost-wall.png") }, { src: C("send.png"), from: cue("send", 0) + 45, fade: 14 }]} cam={cam} />
      {say("send", "Send the fix", dur)}
    </>
  );
};

const Confirm: React.FC<P> = ({ dur }) => {
  const cam: Cam[] = [{ f: 0, x: 400, y: 260, w: 1020 }, { f: dur, x: 420, y: 270, w: 980 }];
  return (
    <>
      <Shot layers={[{ src: C("send.png") }, { src: C("confirm.png"), from: cue("confirm", 1), fade: 14 }]} cam={cam} />
      {say("confirm", "Confirmed, with a receipt", dur)}
    </>
  );
};

const Ask: React.FC<P> = ({ dur }) => {
  const f = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const a = interpolate(f, [4, 26], [0, 1], { ...clamp, easing: ease.arrive });
  const p = interpolate(f, [16, 40], [0, 1], { ...clamp, easing: ease.arrive });
  const scroll = interpolate(f, [cue("ask", 1) - 10, cue("ask", 1) + 40], [0, -150], { ...clamp, easing: ease.camera });
  const S = 1.9;
  return (
    <>
      <Grid />
      <div style={{ position: "absolute", left: 120, top: 96, width: 384 * S, height: 620, overflow: "hidden", borderRadius: 8, background: color.surface,
        boxShadow: "0 0 0 1px rgb(28 43 58 / .1), 0 24px 50px rgb(28 43 58 / .18)", opacity: a, transform: `translateY(${(1 - a) * 18}px)` }}>
        <Img src={staticFile(C("ask.png"))} style={{ position: "absolute", width: 1440 * S, height: 900 * S, left: -1064 * S, top: -350 * S + scroll }} />
      </div>
      <div style={{ position: "absolute", right: 150, top: 90, width: 410, height: 880, borderRadius: 58, background: color.ink, padding: 14,
        boxShadow: "0 30px 60px rgb(28 43 58 / .3)", opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 46, overflow: "hidden", position: "relative", background: color.surface }}>
          <Img src={staticFile(C("phone-ask.png"))} style={{ width: 382, height: 827 }} />
        </div>
      </div>
      {say("ask", "Ask the record", dur)}
    </>
  );
};

const Learn: React.FC<P> = ({ dur }) => {
  const x = cue("learn", 2);
  const cam: Cam[] = [{ f: 0, x: 660, y: 150, w: 780 }, { f: x - 20, x: 660, y: 150, w: 780 }, { f: x + 40, x: 560, y: 110, w: 880 }];
  return (
    <>
      <Shot layers={[{ src: C("learn.png") }, { src: C("run-2.png"), from: x - 10, fade: 18 }]} cam={cam} />
      {say("learn", "It learns your site's words", dur)}
    </>
  );
};

const Numbers: React.FC<P> = ({ dur }) => {
  const z = cue("numbers", 0) + 40;
  const cam: Cam[] = [{ f: 0, x: 0, y: 40, w: 1440 }, { f: z, x: 0, y: 40, w: 1440 }, { f: z + 70, x: 28, y: 100, w: 1004 }];
  return (<><Shot layers={[{ src: C("numbers.png") }]} cam={cam} />{say("numbers", "Measured, not assumed", dur, { sides: [{ from: 0, side: "right" }], top: true })}</>);
};

const LoopScene: React.FC<P> = ({ dur }) => (<><Loop />{say("loop", "One loop", dur)}</>);

const RENDER: Record<SceneId, React.FC<P>> = {
  opening: ({ dur }) => <Opening dur={dur} cues={[0, 1, 2, 3].map((i) => cue("opening", i))} />,
  stat: ({ dur }) => <Stat dur={dur} cues={[0, 1].map((i) => cue("stat", i))} />,
  reveal: () => <Reveal />,
  overview: Overview,
  build: Build,
  ghost: Ghost,
  why: Why,
  rehearse: Rehearse,
  send: Send,
  confirm: Confirm,
  ask: Ask,
  learn: Learn,
  numbers: Numbers,
  loop: LoopScene,
  end: () => <End />,
};

const PRODUCT = new Set<SceneId>(["overview", "build", "ghost", "why", "rehearse", "send", "confirm", "ask", "learn", "numbers"]);
const NO_BAR = new Set<SceneId>(["reveal", "end"]);

export const Film: React.FC = () => {
  const scenes = layout();
  const at = (id: SceneId) => scenes.find((s) => s.id === id)!.from;
  // Every spoken interval on the film's clock, for ducking the music under the voice.
  const spoken = scenes.flatMap((s) => s.lines.map((l) => [s.from + Math.round(l.start * FPS), s.from + Math.round((l.start + l.dur) * FPS)] as const));
  const duck = (f: number) => {
    let d = Infinity;
    for (const [a, b] of spoken) d = Math.min(d, f < a ? a - f : f > b ? f - b : 0);
    return interpolate(d, [0, 14], [0.13, 0.38], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };
  const span = CHAPTERS.map((_, c) => {
    const inC = scenes.filter((s) => s.chapter === c);
    return [inC[0].from, inC[inC.length - 1].from + inC[inC.length - 1].dur] as const;
  });
  return (
    <AbsoluteFill style={{ background: color.ink }}>
      {scenes.map((s, i) => {
        const Comp = RENDER[s.id];
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
            <Fade dur={s.dur} inF={i === 0 ? 20 : 12} outF={i === scenes.length - 1 ? 40 : 12}>
              <Comp dur={s.dur} />
              {PRODUCT.has(s.id) ? <SimLabel /> : null}
              {!NO_BAR.has(s.id) ? <Bar chapter={s.chapter} from={s.from} span={span[s.chapter]} /> : null}
            </Fade>
            {s.lines.map((l, j) => (
              <Sequence key={j} from={Math.round(l.start * FPS)} name={`vo ${s.id}-${j}`}>
                <Audio src={staticFile(l.file)} volume={1} />
              </Sequence>
            ))}
          </Sequence>
        );
      })}

      <Audio src={staticFile("audio/score.wav")} volume={(f) => duck(f) * interpolate(f, [0, 30, TOTAL - 75, TOTAL], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      <Sequence from={at("reveal") - 10}><Audio src={staticFile("audio/whoosh.wav")} volume={0.35} /></Sequence>
      <Sequence from={at("reveal") + 46}><Audio src={staticFile("audio/tick.wav")} volume={0.3} /></Sequence>
      <Sequence from={at("ghost") + cue("ghost", 1) + 30}><Audio src={staticFile("audio/impact.wav")} volume={0.55} /></Sequence>
      <Sequence from={at("send") + cue("send", 0) + 45}><Audio src={staticFile("audio/tick.wav")} volume={0.3} /></Sequence>
      <Sequence from={at("confirm") + cue("confirm", 1)}><Audio src={staticFile("audio/resolve.wav")} volume={0.35} /></Sequence>
      <Sequence from={at("learn") + cue("learn", 2) - 10}><Audio src={staticFile("audio/tick.wav")} volume={0.25} /></Sequence>
      <Sequence from={at("loop") - 10}><Audio src={staticFile("audio/whoosh.wav")} volume={0.25} /></Sequence>
      <Sequence from={at("end") + 6}><Audio src={staticFile("audio/resolve.wav")} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};

/** The chapter bar inside a scene; progress is measured on the film clock. */
const Bar: React.FC<{ chapter: number; from: number; span: readonly [number, number] }> = ({ chapter, from, span }) => {
  const f = useCurrentFrame() + from;
  const progress = Math.min(1, Math.max(0, (f - span[0]) / (span[1] - span[0])));
  return <ChapterBar chapters={CHAPTERS} active={chapter} progress={progress} />;
};
