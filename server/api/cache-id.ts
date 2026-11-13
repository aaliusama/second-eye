import { liveCacheId } from "./live-id";

// Owner: A. npm run cache-id -- "<text>" <crewId>
// Prints the data/llm-cache file name a live phone message will read.

const [text, crewId] = process.argv.slice(2);
if (!text) {
  console.error('usage: npm run cache-id -- "<message text>" <crewId>');
  process.exit(1);
}
const id = liveCacheId(text, crewId);
console.log(`${id}  ->  data/llm-cache/${id}.json`);
