# ADR 0006: Personal Pi config in the image

- **Status:** Proposed. Not built.

## Context

Pi users keep their own setup in Pi's config folder (`~/.pi/agent`): settings, skills, extensions and packages, among others. The image ships only what the sandbox needs: the context file, the `kagi-search` skill and the Git settings. So each sandbox starts with Pi's defaults, and the only way to add something to every sandbox is to edit files that this repo tracks. A repo's own Pi setup (`.pi/`, `.agents/skills`) already works, behind Pi's trust prompt (`docs/usage.md`), but only for that repo.

The other ways in don't fit:

- **Mounting `~/.pi/agent`:** nothing from the Mac is mounted (README, "Security model"), and the folder holds credentials and sessions. Pi's [containerization guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md) advises against it too.
- **`pi install` in the VM:** packages from npm install, packages from git don't, because Git reaches only the sandbox's own repo ([ADR 0004](0004-git-host.md)). What it installs is lost when the sandbox is deleted. At startup, `PI_OFFLINE=1` stops Pi from installing the packages that `settings.json` lists, but Pi loads those that are already installed.

## Decision

1. **A folder `pi-agent/personal/`, with the layout of Pi's config folder.** A `.gitignore` inside it (`*`, `!.gitignore`) keeps its content out of Git. "Personal" is the word Pi's docs use for this scope.
2. **`Dockerfile.pi` copies it into `/var/lib/pi-agent` before the image's own files.** The image's `AGENTS.md` and `kagi-search` files then replace files at the same paths, and `pi-sandbox run` uploads `models.json` and `policy.yaml` over both when it creates a sandbox.
3. **`.dockerignore` keeps Pi's credentials and state out of the image:** `auth.json`, `mcp-auth.json`, `trust.json`, `sessions/`, and the folders Pi installs into (`npm/`, `git/`, `tmp/`, `bin/`). It also keeps out `AGENTS.override.md`, which Pi would load instead of the sandbox's `AGENTS.md`.
4. **Pi installs the packages at build time.** A `RUN` step calls `pi install` for each entry under `packages` in `settings.json`, while the build can reach npm and GitHub. Entries are pinned: `npm:NAME@VERSION`, `git:github.com/OWNER/REPO@COMMIT`. In the VM, Pi loads them from `npm/` and `git/` with `PI_OFFLINE=1`. A loop is needed because `pi update --extensions` skips pinned npm entries.
5. **The files Pi writes later are made writable** for the VM's user: `settings.json` and the package folders. Owners don't survive the conversion to the VM's disk (comment in `Dockerfile.pi`).
6. **Docs:** a section in `docs/usage.md` on what goes into the folder, that `pi-sandbox setup` rebuilds the image with it and that only sandboxes created after that get it, and that its content is the user's to review. The README's description of `pi-agent/`, the Layout section in `AGENTS.md`, and the comments in `.dockerignore` and `Dockerfile.pi` name the folder.

## Consequences

- **The personal config is trusted.** It can change what Pi does in the VM, the sandbox's own rules included: `SYSTEM.md` replaces Pi's default system prompt, an extension can rewrite it, and a skill named `kagi-search` replaces the image's. Only the policy and the ruleset enforce anything ([ADR 0004](0004-git-host.md)); the context file is a request.
- **It can turn off the trust prompt,** and the build allows that: with `defaultProjectTrust: "always"` in `settings.json`, Pi loads the `.pi/` and `.agents/skills` of every repo and branch in the sandbox without asking. A branch's extensions then run in Pi and its skills steer it as soon as Pi starts there. The section in `docs/usage.md` says so, next to the advice on the trust prompt.
- **Packages' install scripts run during the build,** in Docker on the Mac, with network access: Pi's installer doesn't pass `--ignore-scripts`. They don't run on the Mac itself, and the build sees only `pi-agent/`.
- **A pin fixes the package, not its dependencies:** npm ignores the lockfile of a package it installs, so a rebuild can bring newer versions of an npm package's dependencies.
- **No new way out:** extensions and skills run as code in the VM, which the security model already assumes, and reach only the hosts that the policy and the providers allow.
- **Keys in `settings.json` would end up in the image,** where the VM can read them. Credentials belong in OpenShell's providers.
- **A repo's own npm and git packages still don't load in the VM,** because `PI_OFFLINE=1` stops their install at startup.

## Options not chosen

- **Packages copied in as folders,** listed by path: their dependencies would have to be built for Linux by hand, and a plain `npm install` adds a second copy of Pi, which Pi's own installer leaves out.
- **Shipping chosen packages in the image:** they would be opinionated for every user, and their updates would need tracking here.
- **Uploading the folder at `run`,** as `models.json` is: it would survive a new clone of this repo, but needs code in `pi-sandbox`, and git packages can't be installed in the VM.
- **A personal Dockerfile built `FROM pi-agent:local`:** `pi-sandbox` and the gateway's `bootstrap_image` setting (README, "One-time setup") would need a setting for the image name.

## Open tests

- Entries in the object form (`{"source": …, "skills": […]}`) keep their filters after `pi install`.
- `pi install npm:…` in a sandbox works after the change of modes.
