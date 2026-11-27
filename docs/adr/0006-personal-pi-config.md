# ADR 0006: Personal Pi config in the image

- **Status:** Accepted. Two checks are open (see "Open tests").

## Context

Pi users keep their own setup in Pi's config folder (`~/.pi/agent`): settings, skills, extensions and packages, among others. The image ships only what the sandbox needs: the context file, the `kagi-search` skill and the Git settings. So each sandbox starts with Pi's defaults, and the only way to add something to every sandbox is to edit files that this repo tracks. A repo's own Pi setup (`.pi/`, `.agents/skills`) already works, behind Pi's trust prompt (`docs/usage.md`), but only for that repo.

The other ways in don't fit:

- **Mounting `~/.pi/agent`:** nothing from the Mac is mounted (README, "Security model"), and the folder holds credentials and sessions. Pi's [containerization guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md) advises against it too.
- **`pi install` in the VM:** packages from npm install, packages from git don't, because Git reaches only the sandbox's own repo ([ADR 0004](0004-git-host.md)). What it installs is lost when the sandbox is deleted. At startup, `PI_OFFLINE=1` stops Pi from installing the packages that `settings.json` lists, but Pi loads those that are already installed.

## Decision

1. **A folder `pi-agent/personal/`, with the layout of Pi's config folder.** A `.gitignore` inside it (`*`, `!.gitignore`) keeps its content out of Git. "Personal" is the word Pi's docs use for this scope.
2. **`Dockerfile.pi` copies it into `/var/lib/pi-agent` before the image's own files,** so the image's `kagi-search` files replace files at the same paths. The sandbox's `AGENTS.md`, `models.json` and `policy.yaml` never come from the folder (decision 3). Personal instructions go into `APPEND_SYSTEM.md`, which Pi adds to its system prompt.
3. **`.dockerignore` lets in only the files that are config,** and lists them. Everything else in the folder stays out of the image:
   - Pi's credentials and state, such as `auth.json`, `sessions/`, logs and the folders Pi installs into. A list of what to keep out couldn't be complete, because extensions write state of their own into the folder.
   - `models.json`, in which Pi accepts a literal key, and which the VM's user couldn't replace with the sandbox's.
   - `AGENTS.md` and `AGENTS.override.md`, which Pi would load in place of the sandbox's context file.
4. **Pi installs the npm and git packages at build time.** A `RUN` step calls `pi install` for each npm and git entry under `packages` in `settings.json`, while the build can reach npm and GitHub. Entries with a local path load as they are. Entries are pinned: `npm:NAME@VERSION`, `git:github.com/OWNER/REPO@COMMIT`. In the VM, Pi loads them from `npm/` and `git/` with `PI_OFFLINE=1`.
   - npm's install scripts are turned off for the step (`npm_config_ignore_scripts`), as for every other install in the image.
   - It is a loop of `pi install` calls because that command fails, and with it the build, when a package can't be installed. No other Pi command runs in the build: Pi would leave state files that only root can read.
5. **The copied files are made readable for the VM's user, and what is written later writable:** `settings.json` and the package folders, which Pi writes, and `extensions/`, where Orca adds its own ([ADR 0001](0001-orca-via-ssh.md)), each with everything in it. Owners don't survive the conversion to the VM's disk (comment in `Dockerfile.pi`), so a file that only its owner can read on the Mac would be unreadable in the VM, and Pi would start without the settings and packages. The rest can't be edited in place there, only replaced: changes made in the VM wouldn't come back to the Mac anyway.
6. **Docs:**
   - A section in `docs/usage.md`: what goes into the folder, that `pi-sandbox setup` rebuilds the image with it and that only sandboxes created after that get it, that its content is the user's to review, and what doesn't carry over from the Mac (symlinks, modules built on macOS, paths outside the folder).
   - A line under "What this does **not** protect against" in `docs/security.md` for the first two consequences below.
   - The README's description of `pi-agent/`, the Layout section in `AGENTS.md`, and the comments in `.dockerignore` and `Dockerfile.pi` name the folder.

## Consequences

- **The personal config is trusted, and it runs in every sandbox.** It can change what Pi does in the VM, the sandbox's own rules included: `SYSTEM.md` replaces Pi's default system prompt, an extension can rewrite it, and a personal skill can take the place of the image's `kagi-search`. Code that Pi leaves in a VM acts only in that sandbox; a package or an extension in the folder runs in all of them from their first start, without a pull request. Only the policy and the ruleset enforce anything ([ADR 0004](0004-git-host.md)); the context file is a request.
- **Code in every VM can read the folder's files,** and so push them or send them to an allowed host. Keys don't belong in `mcp.json`, in `settings.json` or in an extension's config: credentials go into OpenShell's providers.
- **It can turn off the trust prompt,** and the build allows that: with `defaultProjectTrust: "always"` in `settings.json`, Pi loads the `.pi/` and `.agents/skills` of every repo and branch in the sandbox without asking. A branch's extensions then run in Pi and its skills steer it as soon as Pi starts there. The section in `docs/usage.md` says so, next to the advice on the trust prompt.
- **Packages that need a build step don't work,** for example one with a native module: their install scripts don't run. Pi's installer would run them during the build, as root and with open network access, which would be the one place where a package's code runs outside the sandbox.
- **A pin fixes the package, not its dependencies:** npm ignores the lockfile of a package it installs, so a rebuild can bring newer versions of an npm package's dependencies.
- **No new way out of a running VM:** extensions and skills run as code in the VM, which the security model already assumes, and reach only the hosts that the policy and the providers allow.
- **A repo's own npm and git packages still aren't installed when Pi starts in the VM,** because `PI_OFFLINE=1` stops that.

## Options not chosen

- **Packages copied in as folders,** listed by path: their dependencies would have to be built for Linux by hand, and a plain `npm install` adds a second copy of Pi, which Pi's own installer leaves out.
- **Shipping chosen packages in the image:** they would be opinionated for every user, and their updates would need tracking here.
- **Uploading the folder at `run`,** as `models.json` is: it would survive a new clone of this repo, but needs code in `pi-sandbox`, and git packages can't be installed in the VM.
- **A personal Dockerfile built `FROM pi-agent:local`:** `pi-sandbox` and the gateway's `bootstrap_image` setting (README, "One-time setup") would need a setting for the image name.

## Open tests

- `pi install npm:…` in a sandbox works after the change of modes.
- A proxy set in a personal `settings.json` doesn't take Pi off its route through OpenShell.
