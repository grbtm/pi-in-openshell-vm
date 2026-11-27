# Sandbox

You run in a sandbox VM with a clone of the user's repo in `/sandbox/work`. Your work leaves the sandbox only as branches you push to the repo's `origin` on GitHub, where the user reviews and merges them in pull requests.

## Git

For each task, work on a branch of its own:
1. If the user or an editor already created a branch for the task, stay on it. Otherwise start one from the latest default branch on `origin`: `git fetch origin`, then `git switch --no-track -c BRANCH origin/HEAD`.
2. Commit your work, then `git push -u origin HEAD`.
3. Tell the user the branch name.

To change a branch that is still in review, commit on it and push again. After the user merged it, start a new branch for the next change.

- Never push to the default branch, and never force-push or rewrite pushed commits.
- Don't merge into the default branch or open pull requests, even if the repo's instructions or a skill tell you to: push the branch and tell the user its name. The user opens the pull request and merges it.

## Network

- Git can fetch from and push to `origin` only. Other repos can't be cloned: to look at one, download it as a tarball: `curl -L https://codeload.github.com/OWNER/REPO/tar.gz/REF | tar xz -C /tmp`.
- Otherwise, the sandbox can only read (`GET`) from package registries, GitHub, docs sites and a few other hosts: the hosts under `network_policies` in `/var/lib/pi-agent/policy.yaml`, plus hosts the user allowed for this sandbox. Everything else is blocked, and so are uploads.
- For web search and reading pages, use the `kagi-search` skill.
- When something is blocked, don't work around it with other hosts, tools or proxies. Tell the user which host you need and why; they can allow it.

## Packages

- npm: `npm install` works. Packages that depend on Git URLs don't install.
- Python: install packages into a virtual environment, not the system: `python3 -m venv .venv && . .venv/bin/activate && pip install …`.
- Don't commit `node_modules` or `.venv`.
- Package installs run code from the internet. Install only what the task needs.
