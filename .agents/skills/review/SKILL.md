---
name: review
description: Adversarial review of a change in this repo (the current diff, or named files) before the maintainer tests and commits it. Use when asked to review a change.
---

# Review

Review each area below and skip areas that don't apply. If you can start subagents, start one per area, in parallel, and give each the files or diff and the repo context (`AGENTS.md`, the relevant ADRs), not your own conclusions. Reviews are read-only, no edits to repo files, scratch files in `mktemp -d`, and no personal or machine details in web requests.

1. **ADR fit:** the change does what the ADRs decide, and the README, ADRs and code still agree (`AGENTS.md`, "Conventions").
2. **Correctness and security:** concrete failure scenarios, verified by running the code where possible. Threat model: README "Security model", `docs/security.md` and ADR 0003 (untrusted content, data leaving through allowed hosts, keys).
3. **Simplicity and readability:** as simple as possible, but not simpler. Comments say why, not what, and read as documentation, not as notes from a work session.
   - Bash: [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html) and `shellcheck`, within the limits in `AGENTS.md`.
   - JavaScript: `npx prettier@3 --check` and ESLint's recommended rules (`@eslint/js` config in the temp folder, passed with `-c`).
   - Docs: the README is an entry point for using what exists, with details in `docs/*.md`; reasons and plans go into ADRs.
4. **Overengineering and clutter:** what could be left out, and what nobody asked for. In docs, apply the clutter rule in `AGENTS.md` to every added line.
5. **Versions** (when pins change): latest releases, and advisories that matter for how we use them.

Each review lists verified findings only, most severe first, each with file and line, the failure scenario and a minimal fix, then what was checked and found fine.

Then merge the reviews, drop what doesn't hold up, apply the fixes that are clearly right, and ask about the rest. Don't commit: the maintainer commits when they say "commit".
