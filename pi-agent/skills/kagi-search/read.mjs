// Fetch a web page and print it as Markdown: node read.mjs URL
// Runs in the VM, so it reaches only hosts that the sandbox allows.
//
// Adapted from content.js in https://github.com/badlogic/pi-skills (brave-search):
// Copyright (c) 2024 Mario Zechner. MIT License: permission is hereby granted,
// free of charge, to any person obtaining a copy of this software and
// associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy,
// modify, merge, publish, distribute, sublicense, and/or sell copies of the
// Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions: The above copyright notice and this
// permission notice shall be included in all copies or substantial portions of
// the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
// EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
// OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { limitOutput } from "./limit.mjs";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node read.mjs URL");
  process.exit(2);
}

// process.exit can drop output still being written to a pipe, so only errors
// exit early.
function fail(message) {
  console.error(`read.mjs: ${message}`);
  process.exit(1);
}

// HTML to Markdown, without links that have no text. No other cleanup: it would
// also change code blocks.
function htmlToMarkdown(html) {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);
  turndown.addRule("removeEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent.trim(),
    replacement: () => "",
  });
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The page's main content as Markdown: the article via Readability, else the
// main element without page chrome. Links resolve against baseUrl.
function pageToMarkdown(html, baseUrl) {
  // A virtual console that goes nowhere: by default jsdom prints messages such
  // as "Could not parse CSS stylesheet" to stderr, which Pi counts towards its
  // output limit and which say nothing about the page.
  const doc = new JSDOM(html, {
    url: baseUrl,
    virtualConsole: new VirtualConsole(),
  }).window.document;
  // Readability changes the document it gets, so it gets a copy.
  const article = new Readability(doc.cloneNode(true)).parse();
  if (article?.content) {
    return (
      (article.title ? `# ${article.title}\n\n` : "") +
      htmlToMarkdown(article.content)
    );
  }
  doc
    .querySelectorAll("script, style, noscript, nav, header, footer, aside")
    .forEach((el) => el.remove());
  const title = doc.querySelector("title")?.textContent.trim();
  const main =
    doc.querySelector("main, article, [role='main'], .content, #content") ??
    doc.body;
  // A few tags without text aren't the page's content.
  if (main.innerHTML.trim().length <= 100) {
    fail("could not extract readable content from this page");
  }
  return (title ? `# ${title}\n\n` : "") + htmlToMarkdown(main.innerHTML);
}

// The body as text, in the charset the server names (default UTF-8).
function decode(bytes, type) {
  const charset = /charset="?([^";\s]+)/.exec(type)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

// The largest body to load: more would only be cut away again, and a server
// that never stops sending could fill the VM's memory.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// The response's body, read in pieces so that it can stop at the limit.
async function readBody(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      fail(`the page is larger than ${MAX_BODY_BYTES / 1024 / 1024} MB`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Fetch the page. A blocked host fails here, before any HTTP status. The
// timeout also covers reading the body, so that happens inside the try.
let response;
let bytes;
try {
  response = await fetch(url, {
    headers: {
      // Some sites refuse requests that don't look like a browser's.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });
  bytes = await readBody(response);
} catch (e) {
  fail(
    `could not fetch ${url}: ${e.cause?.code ?? e.message}. If the sandbox blocks the host, use the search snippet or ask the user to allow the host.`,
  );
}
if (!response.ok) {
  fail(`HTTP ${response.status} ${response.statusText}`);
}

// HTML becomes Markdown; plain text and JSON are printed as they are; other
// types, such as PDFs and images, are refused.
const type = (response.headers.get("content-type") ?? "").toLowerCase();
let text;
if (type.includes("html")) {
  text = pageToMarkdown(decode(bytes, type), response.url);
} else if (type.startsWith("text/") || type.includes("json")) {
  text = decode(bytes, type);
} else {
  fail(`unsupported content type '${type}'`);
}
// Control and format characters (terminal escapes, text direction overrides)
// become spaces, as in search.mjs; line breaks and tabs stay.
console.log(limitOutput(text.replace(/(?![\n\t])[\p{Cc}\p{Cf}]/gu, " ")));
