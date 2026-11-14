// Lane L. Presenter mode (?present=1, or key P): the demo beats from docs/demo-script.md.
// Every beat does what the presenter would do by hand, through the same store actions and API calls.
// Edit the phone texts HERE, in one place. A text still in [[...]] is not sent; the bar says so.

/** What the phone sends in the demo. Each text needs a cache entry (data/llm-cache/live-<id>.json). */
export const PHONE = {
  /** Plumbing states tomorrow's rough-in in the 204 bath: the ghost-wall beat. */
  plumbingIntent: {
    crewId: "crew-plumbing",
    // Cached offline under the text-based live id; matches data/scenario.md's phone script.
    text: "tomorrow morning we rough in the 204 bath along the east wall",
  },
  /** A crew question answered from the record (POST /api/ask). */
  question: {
    crewId: "crew-plumbing",
    text: "can we start the 204 bath tomorrow morning?",
  },
  /** A crew names "the blue room": run 1 cannot place it, the superintendent maps it once. */
  blueRoom: {
    crewId: "crew-drywall",
    text: "tmrw afternoon we start boarding the blue room, ceiling first",
  },
} as const;

/** Where "the blue room" is, for the Learning beat. */
export const BLUE_ROOM = { alias: "the blue room", elementId: "room-204" } as const;

export const isPlaceholder = (text: string) => text.trim().startsWith("[[");

export type BeatId =
  | "clean"
  | "build"
  | "ghost"
  | "why"
  | "rehearse"
  | "fix"
  | "confirm"
  | "ask"
  | "learn"
  | "run2"
  | "numbers";

export interface Beat {
  id: BeatId;
  /** Short title on the step bar. */
  title: string;
  /** One line for the presenter: what to say while it plays. */
  note: string;
}

/** In demo order. Times match docs/demo-script.md. */
export const BEATS: Beat[] = [
  { id: "clean", title: "Problem", note: "0:00 Site decisions live in group chats. A change in the office thread never reaches the plumber." },
  { id: "build", title: "Build", note: "0:20 Chat becomes the model: the wall as of the architect's Rev C, every row quotes its message." },
  { id: "ghost", title: "Ghost wall", note: "0:45 Plumbing says what it does tomorrow. Red: where plumbing thinks the wall is." },
  { id: "why", title: "Why", note: "1:20 The floor as Novak Plumbing knows it. Each crew hears different threads, so each works from its own version." },
  { id: "rehearse", title: "Rehearse", note: "1:35 Tomorrow, played forward. Redline on the track marks the clash." },
  { id: "fix", title: "Send", note: "1:55 Correction sent. The recorded risk stays open until the crew confirms the revision." },
  { id: "confirm", title: "Confirm", note: "2:05 Simulate the crew confirming the sent revision. Recheck the record; this is not proof of completed work." },
  { id: "ask", title: "Ask", note: "2:10 Crews text a question and get an answer from the record, with sources." },
  { id: "learn", title: "Learn", note: "2:20 Run 1 cannot place \"the blue room\". The superintendent maps it once." },
  { id: "run2", title: "Run 2", note: "2:35 Same words, next run: resolved on its own." },
  { id: "numbers", title: "Numbers", note: "2:45 Say the numbers exactly as shown. Close with the anchor sentence." },
];
