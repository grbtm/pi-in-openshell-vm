# AGENTS.md

This repo is public. Keep private and local information out of every file, commit message and pull request:

- No names, user names, email addresses, account or project IDs, keys or tokens. The repo's own GitHub URL and the copyright line in `LICENSE` are the exceptions.
- No paths, host names or other details from the machine you work on (use placeholders such as `~/code/myrepo`, `myrepo` or `<project-id>`).
- No details of the maintainer's other tools, policies, projects or accounts, even as a comparison. Describe other products by their public documentation instead.

Data like this may come up while working, for example in command output or logs. Use it to make decisions, but don't write it down here.

## Layout

`pi-sandbox` creates and opens the sandboxes, with `policy.yaml` as their base policy, the OpenShell provider profiles in `providers/` and Pi's models in `models.json`. `Dockerfile.pi` and `pi-agent/` (Pi's context file, skills and Git settings, and in `personal/` the user's personal Pi config, which Git ignores) make the image. `README.md` and `docs/*.md` are for users, `docs/adr/` has the design decisions, and `.agents/skills/review` reviews a change.

## Checks

```sh
shellcheck pi-sandbox pi-agent/git-hooks/prepare-commit-msg
node --test pi-agent/skills/kagi-search/limit.test.mjs
npx prettier@3 --check pi-agent/skills/kagi-search/*.mjs
openshell profile lint -f providers/<profile>.yaml     # needs a running OpenShell gateway
```

## Conventions

- The README and the guides in `docs/*.md` describe how to use what exists today; the README is the entry point, the guides have the details. Plans, open questions and next steps go into ADRs in `docs/adr/`. ADRs describe the current design: when a change makes one wrong, update it.
- A change to `pi-sandbox`, `policy.yaml`, a provider profile or the image updates the docs in the same commit.
- A change that gives the VM a new way to send data out, or to change things on the Mac, either adds a step where the user reviews what passes (as the pull request before a merge does) or gets a line under "What this does **not** protect against" in `docs/security.md`.
- `pi-sandbox` runs with the bash and tools that ship with macOS, and on Linux: no bash 4 features, no GNU-only flags. Keep it clean under `shellcheck`.
- Keep the docs and ADRs free of clutter. A line belongs there only if a reader acts on it or a decision rests on it, and if it will still be true after the next release of the tools involved. Leave out test logs, dates and version snapshots, tips for other tools' interfaces, notes specific to one model provider, and anything the code or `policy.yaml` already says. What a work session finds goes into the reply, not into the repo.
