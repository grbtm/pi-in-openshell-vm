// Tests for limit.mjs, without network or npm packages:
//   node --test pi-agent/skills/kagi-search/limit.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { limitOutput, MAX_BYTES, MAX_LINES } from "./limit.mjs";

const dir = mkdtempSync(join(tmpdir(), "limit-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// What Pi's bash tool counts for printed output: console.log adds a newline,
// and a trailing newline doesn't start another line.
function assertFitsPi(out) {
  const printed = `${out}\n`;
  assert.ok(
    Buffer.byteLength(printed) <= MAX_BYTES,
    `${Buffer.byteLength(printed)} bytes`,
  );
  assert.ok(printed.split("\n").length - 1 <= MAX_LINES, "too many lines");
}

// Checks a cut output and returns its kept lines and the saved file's path.
function assertCut(out, text) {
  assertFitsPi(out);
  const lines = out.split("\n");
  const marker = lines.pop();
  assert.match(
    marker,
    /^\[Cut off (after|inside) line \d+ of \d+ lines \(\d+ bytes\)\. Full text: .+\. Read on with the read tool at offset \d+\.\]$/,
  );
  const file = /Full text: (.+)\. Read on/.exec(marker)[1];
  assert.equal(readFileSync(file, "utf8"), text);
  assert.ok(text.startsWith(lines.join("\n")));
  return { lines, marker };
}

test("short text is printed as it is", () => {
  const text = "# Title\n\nSome text with ümlauts and 日本語.";
  assert.equal(limitOutput(text, dir), text);
});

test("multi-byte text is cut by bytes at a line boundary", () => {
  // 3 bytes per character: 100 lines of 200 characters are 60,100 bytes but
  // only 20,099 characters.
  const text = Array.from({ length: 100 }, (_, i) =>
    `${i}`.padEnd(200, "語"),
  ).join("\n");
  const out = limitOutput(text, dir);
  const { lines, marker } = assertCut(out, text);
  assert.ok(lines.length < 100);
  assert.equal(lines.at(-1), text.split("\n")[lines.length - 1]);
  assert.match(
    marker,
    new RegExp(
      `after line ${lines.length} of 100 lines.*offset ${lines.length + 1}\\.`,
    ),
  );
});

test("many short lines are cut by lines", () => {
  const text = Array.from({ length: 5000 }, (_, i) => `- item ${i}`).join("\n");
  const out = limitOutput(text, dir);
  const { lines, marker } = assertCut(out, text);
  assert.equal(lines.length, MAX_LINES - 1);
  assert.match(marker, new RegExp(`after line ${MAX_LINES - 1} of 5000 lines`));
});

test("a line longer than the limit is cut inside the line, without splitting a character", () => {
  // A heading, then minified JSON in one line, with 4-byte characters.
  const text = `# Data\n\n${JSON.stringify({ items: Array(20000).fill("x😀") })}`;
  const out = limitOutput(text, dir);
  const { lines, marker } = assertCut(out, text);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.slice(0, 2), ["# Data", ""]);
  assert.ok(
    Buffer.byteLength(lines[2]) > MAX_BYTES - 500,
    "uses the room it has",
  );
  assert.ok(!lines[2].includes("�"));
  assert.ok(!/[\uD800-\uDBFF]$/.test(lines[2]), "ends in half a character");
  assert.match(marker, /inside line 3 of 3 lines.*offset 3\./);
});
