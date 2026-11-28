# ADR 0006: Personal Pi config

- **Status:** Accepted. Not built.

## Context

Pi users keep their own setup in Pi's config folder (`~/.pi/agent`): settings, skills, extensions and packages, among others. Each sandbox starts with Pi's defaults. A repo's own Pi setup (`.pi/`, `.agents/skills`) already works, behind Pi's trust prompt (`docs/usage.md`), but only for that repo.

What Pi loads in a sandbox is of three kinds:

- **Core:** what every sandbox needs: Pi, the context file and the Git settings.
- **Optional integrations:** the client of a provider that this repo has a profile for. It is in every image and works once its provider is added. Web search is one ([ADR 0003](0003-network-access.md), decision 4).
- **Personal config:** a user's own settings, skills, extensions and packages.

Core and integrations are tracked and reviewed in this repo; personal config is neither. What needs a provider profile or a rule in the policy is an integration, not personal config.

Mounting `~/.pi/agent` is not an option: nothing from the Mac is mounted (README, "Security model"), and the folder holds credentials and sessions. Pi's [containerization guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md) advises against it too.

## Decision

1. **A folder `pi-agent/personal/`, with the layout of Pi's config folder.** A `.gitignore` inside it (`*`, `!.gitignore`) keeps its content out of Git. "Personal" is the word Pi's docs use for this scope.
2. **The image takes only the folder's config files:** `settings.json`, `keybindings.json`, `mcp.json`, `SYSTEM.md`, `APPEND_SYSTEM.md`, `extensions/`, `skills/`, `prompts/` and `themes/`. `.dockerignore` keeps everything else out:
   - Pi's credentials and state, such as `auth.json`, `sessions/`, logs and the folders Pi installs into. A list of what to keep out couldn't be complete, because extensions write state of their own into the folder.
   - `models.json`, in which Pi accepts a literal key. The sandbox's comes from this repo.
   - `AGENTS.md`, which is the sandbox's context file, and `AGENTS.override.md`, which Pi would load in its place. Personal instructions go into `APPEND_SYSTEM.md`, which Pi adds to its system prompt.
   - The folder of an integration's skill (`skills/kagi-search`). So no file comes from both the folder and this repo, and the image's own `npm ci` never runs in a folder with personal files: npm reads the `.npmrc` of the folder it runs in.
3. **The copied files are readable and writable for the VM's user,** without setuid and setgid bits. Owners don't survive the conversion to the VM's disk (comment in `Dockerfile.pi`), so a file that only its owner can read on the Mac would be unreadable in the VM. Pi writes `settings.json` later, and Orca adds its own extensions to `extensions/` ([ADR 0001](0001-orca-via-ssh.md)). Writable gives the VM's user nothing new: it can replace any file in Pi's config folder anyway.
4. **Packages are installed in the VM, by `pi-sandbox run`.** They are listed under `packages` in the folder's `settings.json`. When `run` has created a sandbox from an image with such a file, it starts Pi there once without `PI_OFFLINE` (`PI_OFFLINE= pi --no-approve --list-models`). Pi then installs the listed packages that are missing, as the VM's user and under the sandbox's policy, which allows npm's registry read-only. `--no-approve` leaves a repo's own settings out. After that, Pi loads the packages with `PI_OFFLINE=1`.
   - **Not in the Docker build:** it runs on the Mac as root, with open network access and outside the sandbox's policy, and its result is the image every sandbox boots from. What the build installs for Pi and the integrations is tracked here; a user's packages are not.
   - **A failed install warns and doesn't stop `run`.** Without the install, a listed package is missing in the VM without a message, because `PI_OFFLINE=1` stops Pi from installing it at startup. In a sandbox that already exists, the user runs the command.
   - **npm packages only.** Git in the VM reaches only the sandbox's own repo ([ADR 0004](0004-git-host.md)), so Pi can't install a package from git. Such a package can be downloaded as a tarball and installed from its path, by hand.
   - **Entries should be pinned** (`npm:NAME@VERSION`). A pin fixes the package, not its dependencies, and each sandbox installs when it is created, so two sandboxes can get different versions of a dependency.
   - **Install scripts run,** in the VM. A package that compiles native code needs a compiler, which the image doesn't have.

## Consequences

- **The personal config is trusted, and it runs in every sandbox.** It can change what Pi does in the VM, the sandbox's own rules included: `SYSTEM.md` replaces Pi's default system prompt, an extension can rewrite it, and a personal skill with the name of an integration's skill can take its place. Code that Pi leaves in a VM acts only in that sandbox; a package or an extension in the folder runs in all of them from their first start, without a pull request. Only the policy and the ruleset enforce anything ([ADR 0004](0004-git-host.md)); the context file is a request.
- **Code in every VM can read the folder's files,** and so push them or send them to an allowed host. Keys don't belong in `mcp.json`, in `settings.json` or in an extension's config: credentials go into OpenShell's providers.
- **It can turn off the trust prompt:** with `defaultProjectTrust: "always"` in `settings.json`, Pi loads the `.pi/` and `.agents/skills` of every repo and branch in the sandbox without asking. A branch's extensions then run in Pi and its skills steer it as soon as Pi starts there.
- **No new way out of a running VM:** extensions, skills and packages run as code in the VM, which the security model already assumes, and reach only the hosts that the policy and the providers allow. A package that needs another host doesn't work until the host is allowed (`docs/security.md`, "Allowing another host").
- **A change to the folder reaches new sandboxes only,** after `pi-sandbox setup` has rebuilt the image.
- **A repo's own npm and git packages still aren't installed when Pi starts in the VM,** because `PI_OFFLINE=1` stops that.

## Options not chosen

- **Installing the packages in the Docker build,** with `pi install` for each entry and npm's install scripts off: see decision 4. In a test build, a package from git still ran its own code as root: npm reads the `.npmrc` of the folder it installs in, and a package from git brings one. For packages from npm's registry no such way was found, but the build would still download and unpack them as root, and a package that needs an install script would fail only when Pi loads it.
- **Packages copied in as folders,** listed by path: their dependencies would have to be built for Linux by hand, and a plain `npm install` adds a second copy of Pi, which Pi's own installer leaves out.
- **Shipping chosen packages in the image:** they would be opinionated for every user, and their updates would need tracking here.
- **Uploading the folder at `run`,** as `models.json` is: it would spare the rebuild after a change, but the list of files in decision 2 would move into `pi-sandbox`, and an upload replaces the image's files at the same paths.
- **A personal Dockerfile built `FROM pi-agent:local`:** `pi-sandbox` would need a setting for the image name, and the layers of such an image come after this repo's, so a personal `AGENTS.md` would replace the sandbox's.
- **Personal files next to the tracked ones in `pi-agent/`:** files of two owners in one folder, where a `git pull` that adds a file at a path in use fails.

## Open tests

- `run` installs a list of several packages through `openshell sandbox exec`.
- A git entry in `settings.json` makes `run` warn and go on.
- A proxy set in a personal `settings.json` doesn't take Pi off its route through OpenShell.
