// Limits read.mjs's output to what Pi shows in one call.
//
// Pi's bash tool keeps only the last 2000 lines or 50 KB (51,200 bytes) of a
// command's stdout and stderr together. A longer page would lose its beginning,
// so read.mjs prints at most the limits below, counted like Pi counts: UTF-8
// bytes and lines, including the final newline and the marker line.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_BYTES = 48000;
export const MAX_LINES = 1900;

const bytes = (s) => Buffer.byteLength(s, "utf8");

// The beginning of s, at most n UTF-8 bytes, without splitting a character.
function sliceBytes(s, n) {
  const { read } = new TextEncoder().encodeInto(
    s,
    new Uint8Array(Math.max(0, n)),
  );
  return s.slice(0, read);
}

// What to print for text: the text itself if it fits. Otherwise its beginning,
// cut at a line boundary, and a marker line; the full text goes to a file in dir.
// A line longer than the whole limit is cut inside the line instead.
export function limitOutput(text, dir = tmpdir()) {
  const lines = text.split("\n");
  // console.log adds a newline, hence "<" rather than "<=".
  if (lines.length <= MAX_LINES && bytes(text) < MAX_BYTES) {
    return text;
  }

  const file = join(mkdtempSync(join(dir, "read-")), "page.md");
  writeFileSync(file, text);
  const marker = (where, offset) =>
    `[Cut off ${where} of ${lines.length} lines (${bytes(text)} bytes). ` +
    `Full text: ${file}. Read on with the read tool at offset ${offset}.]`;

  // Room for the marker at its longest and console.log's newline.
  const byteBudget =
    MAX_BYTES -
    bytes(marker(`inside line ${lines.length}`, lines.length + 1)) -
    1;
  const lineBudget = MAX_LINES - 1;

  const kept = [];
  let used = 0; // bytes of the kept lines, each with its newline
  for (const line of lines) {
    if (kept.length === lineBudget || used + bytes(line) + 1 > byteBudget)
      break;
    kept.push(line);
    used += bytes(line) + 1;
  }
  const next = lines[kept.length];
  if (kept.length < lineBudget && bytes(next) + 1 > byteBudget) {
    kept.push(sliceBytes(next, byteBudget - used - 1));
    return `${kept.join("\n")}\n${marker(`inside line ${kept.length}`, kept.length)}`;
  }
  return `${kept.join("\n")}\n${marker(`after line ${kept.length}`, kept.length + 1)}`;
}
