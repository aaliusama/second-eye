import "@fontsource-variable/archivo/wdth.css";
import { Composition } from "remotion";
import { Film, FPS, TOTAL } from "./Film";

export const Root = () => <Composition id="Film" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />;
