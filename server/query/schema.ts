import { z } from "zod";
import { Id, StructuredQuery } from "@site/contracts";

// Owner: E. Question, StructuredQuery, Answer and AskRequest now live in contracts/ (one source for
// every lane); re-exported here so existing imports keep working. QueryCacheEntry is internal to the
// query cache and stays here.

export { Answer, AskRequest, Question, StructuredQuery } from "@site/contracts";
export type { Answer as AnswerType, AskRequest as AskRequestType } from "@site/contracts";

/** One file in server/query/cache/<key>.json. `query: null` means the parser could not tell what was asked. */
export const QueryCacheEntry = z.object({
  key: z.string().regex(/^[0-9a-f]{10}$/),
  text: z.string(),
  crewId: Id.optional(),
  query: StructuredQuery.nullable(),
  /** "llm": written by a real model call. "hand": written by a person; say so wherever it is shown. */
  source: z.enum(["llm", "hand"]),
  model: z.string().optional(),
});

export type QueryCacheEntry = z.infer<typeof QueryCacheEntry>;
