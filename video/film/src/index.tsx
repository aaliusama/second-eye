import React from "react";
import { Composition, continueRender, delayRender, registerRoot, staticFile } from "remotion";
import { Film } from "./Film";
import { FPS, H, W } from "./theme";
import { TOTAL } from "./timeline";

// Archivo, the product's own typeface, self-hosted from the repo's Fontsource package.
const wait = delayRender("font");
const face = new FontFace("Archivo Film", `url(${staticFile("fonts/archivo-latin-wdth-normal.woff2")}) format("woff2")`, {
  weight: "100 900",
  stretch: "62% 125%",
});
face.load().then((f) => {
  (document.fonts as unknown as { add: (f: FontFace) => void }).add(f);
  continueRender(wait);
}).catch(() => continueRender(wait));

const Root: React.FC = () => (
  <Composition id="Film" component={Film} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
);

registerRoot(Root);
