# Question cache

One file per demo question: `<key>.json`, key = first 10 hex of sha256(normalised text + crewId).
Normalise: lower case, trim, collapse whitespace, strip trailing `.!?,;:`.

Every entry here has `"source": "llm"`: written by a real Groq call (`openai/gpt-oss-120b`, temperature 0,
JSON mode) via `npx tsx server/query/build-cache.ts`. None are hand-written. If one is ever hand-written,
it must say `"source": "hand"`.

The parse only says what was asked. The answer is always computed by rules in `answer.ts`.
Relative days ("tomorrow", "saturday") were resolved as if asked Fri 2026-11-13 20:30 (`ASKED_AT`).

Questions that need the electrical, painting and tiling crews or units 205/206 are skipped until
`data/floor.json` has them. Rerun `build-cache.ts` after the floor changes (`--force` to redo all).
Unknown ids in a cached parse become "not found" at answer time; they are never guessed.
