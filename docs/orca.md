# Using Orca

[Orca](https://github.com/stablyai/orca) can use a sandbox as an SSH host and run Pi there, in one worktree per agent. Orca itself runs on the Mac, unsandboxed, and shows content from the VM ([ADR 0001](adr/0001-orca-via-ssh.md)). A flaw in how it handles that content is a way onto the Mac, and Orca's chat may load remote images on the Mac with no setting to stop it: treat it as a way out for data ([Security](security.md#what-this-does-not-protect-against)).

## Setup

Once: put this line at the top of `~/.ssh/config`, above every `Host` and `Match` line:

```
Include pi-sandbox.config
```

For each sandbox, after `pi-sandbox run`, on the Mac in your repo:

```sh
pi-sandbox ssh-config >> ~/.ssh/pi-sandbox.config
```

This appends the sandbox's SSH entry (host `openshell-myrepo.default`): OpenShell's entry, with agent, X11 and port forwarding turned off. For a sandbox with another name, pass it: `pi-sandbox ssh-config NAME`. Don't use `openshell sandbox connect --editor`, which writes an entry without these settings.

In Orca's settings, before you connect:

| Setting | Set to |
|---|---|
| "Allow TUI clipboard writes (OSC 52)", under Terminal | Off. Otherwise the VM can put a command on your clipboard. Check it again after Orca updates. |
| "Default Markdown view" | Source, and don't switch to the rich view for files from the VM: it loads remote images on the Mac, so a file from the VM can send data out. |
| "Link previews", under Chat | Off. |
| "Allow publishing public artifact links", under Artifacts | Off. |

Then:

1. Add `openshell-myrepo.default` as an SSH host, and under "Advanced" turn off "Allow this host to control Orca browser tabs in its workspaces" (on by default).
2. Create a workspace that runs on the SSH host. As its project, add the existing repo `/sandbox/work` with "Browse host", not "Create on host", which makes a new repo.
3. Under "Create From", pick `origin`'s default branch after a `git fetch origin` in the VM, and under "Branch for this worktree" choose "New branch", so that the workspace gets a worktree and a branch of its own. Orca finds a base by itself only if that branch is `main` or `master`; otherwise pick it yourself.

## While you work

- Don't forward ports from the SSH host's Ports tab.
- Orca's server in the VM tries to reach the internet and is blocked; Orca works anyway. Don't approve the allow rules OpenShell drafts for these requests ([Allowing another host](security.md#allowing-another-host)).
- Agents in one sandbox can read and change each other's worktrees and Pi's config, so run agents together only if they may trust each other.
- A diff shown in Orca is not the review. Push the branch, review the pull request, and merge it with the hash of the commit you reviewed ([Getting the results out](usage.md#getting-the-results-out)).

## Removing a sandbox

When you delete the sandbox, unlink Orca's server on it with `orca environment forget --environment openshell-myrepo.default --yes` (Orca refuses to remove the SSH host before that), then remove the SSH host in Orca and the sandbox's entry from `~/.ssh/pi-sandbox.config`: ssh uses the first entry for a host, so a stale one would win over a later sandbox with the same name.
