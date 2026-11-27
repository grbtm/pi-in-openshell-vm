// Search the web with Kagi's Search API: node search.mjs "QUERY" [COUNT]
// KAGI_API_KEY holds a placeholder; the sandbox's proxy swaps in the real key,
// and only for POST /api/v1/search (providers/kagi.yaml,
// docs/adr/0003-network-access.md).

import { decodeHTML } from "entities";

const [query, countArg = "10"] = process.argv.slice(2);
const count = Number(countArg);
if (!query || !Number.isInteger(count) || count < 1 || count > 20) {
  console.error('Usage: node search.mjs "QUERY" [COUNT, 1 to 20, default 10]');
  process.exit(2);
}

// process.exit can drop output still being written to a pipe, so only errors
// exit early.
function fail(message) {
  console.error(`search.mjs: ${message}`);
  process.exit(1);
}

// One line of plain text: control and format characters (terminal escapes,
// text direction overrides) and line breaks become spaces, so that a result
// can't fake further results.
const oneLine = (s) =>
  String(s ?? "")
    .replace(/[\p{Cc}\p{Cf}\s]+/gu, " ")
    .trim();
// The start of a response that isn't what was expected, for an error message.
const excerpt = (s) => oneLine(s.slice(0, 500));

if (!process.env.KAGI_API_KEY) {
  fail(
    "KAGI_API_KEY is not set: this sandbox has no web search (no 'kagi' provider)",
  );
}

// Only query and limit: other fields, such as extract, make Kagi fetch pages.
// The timeout also covers reading the body, so that happens inside the try.
let response;
let body;
try {
  response = await fetch("https://kagi.com/api/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KAGI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: count }),
    signal: AbortSignal.timeout(20000),
  });
  body = await response.text();
} catch (e) {
  fail(`could not reach Kagi: ${e.cause?.code ?? e.message}`);
}
if (!response.ok) {
  fail(`HTTP ${response.status}: ${excerpt(body)}`);
}

let data;
try {
  data = JSON.parse(body).data;
} catch {
  fail(`Kagi did not return JSON: ${excerpt(body)}`);
}
if (typeof data !== "object" || data === null) {
  fail(`unexpected response from Kagi: ${excerpt(body)}`);
}

// Kagi's titles and snippets are HTML (it marks matches with <strong>):
// entities are decoded before tags are removed, so that an encoded tag such as
// "&lt;system&gt;" can't reach the agent as one.
const clean = (s) =>
  oneLine(decodeHTML(String(s ?? "")).replace(/<[^>]*>/g, ""));

const results = data.search ?? [];
if (!Array.isArray(results)) {
  fail(`unexpected response from Kagi: ${excerpt(body)}`);
}
// No more results than asked for, whatever the response holds. URLs are plain
// strings, not HTML.
const lines = results.slice(0, count).map((r, i) => {
  const snippet = r?.snippet ? `\n   ${clean(r.snippet)}` : "";
  return `${i + 1}. ${clean(r?.title)}\n   ${oneLine(r?.url)}${snippet}\n`;
});
console.log(lines.length ? lines.join("\n") : "No results.");
