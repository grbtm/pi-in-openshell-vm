# Security

The README's [security model](../README.md#security-model) says what this setup protects. This page lists what it doesn't, what to check in Pi's pull requests, and how to check a sandbox and widen its network access.

## What this does **not** protect against

- **Data leaving through allowed hosts.**
  - A hosted model provider gets your code and prompts, and Kagi gets your searches; only llama-server keeps prompts local. The code is on GitHub either way.
  - Even a `GET` carries data in its URL, and anyone can publish on GitHub, npm or PyPI and see the requests to what they publish (PyPI's download statistics are public, including a User-Agent that code in the VM sets).
  - Code in the VM can send a key of its own, for example an attacker's, to an allowed provider: OpenShell passes keys it doesn't know through unchanged, so data can go to that account. It can also make Kagi fetch the result pages of a search (Kagi's `extract` option), Anthropic reach any URL (images and documents given by URL, and server-side tools such as web fetch), and Mistral fetch any URL (images and documents given by URL), because OpenShell's rules don't check request bodies.
- **Pushes from the VM.** No review happens before a push.
  - Pi can push anything it can read in the VM to your repo, including the repo's whole history and all its branches. In a public repo, that is public at once, and a push can't be taken back reliably.
  - At most the default branch is protected, and only if the repo has the ruleset for it ([Set up your repo](../README.md#set-up-your-repo)). Without it, Pi can push there, and a `git pull` brings unreviewed code to the Mac. Pi can create, move and delete every other branch and every tag, so look before you pull a branch on the Mac, and keep tags and other branches from triggering anything: release workflows, published sites, other projects that install from them.
  - A GitHub Actions workflow that runs for Pi's branch or tag runs Pi's code outside the sandbox, with the secrets that workflow gets.
  - Pushes count as yours: they use your token.
  - If the token covers more than one repo, Git in the VM can at least list the branches and tags, with their commits, of all of them, because it sends the token with every read from `github.com`. Git's own fetch works only for the repo `pi-sandbox run` allowed; whether another read from `github.com` returns the other repos' contents is untested ([ADR 0004](adr/0004-git-host.md), "Open tests"). A token limited to one repo avoids both.
- **Prompt injection.** Pi has no approval prompts and can do anything the sandbox allows. Code and instructions it leaves in the VM act again later in that sandbox: `~/.profile` runs whenever the sandbox's main shell starts, `~/.bashrc` in every interactive SSH session such as an editor's terminal, and Pi loads its config folder and the context files and skills in folders above the repo, such as `/sandbox/AGENTS.md` and `/sandbox/.agents/skills`, without asking.
- **Programs that handle VM content:**
  - your terminal, which shows Pi's output, file names and diffs, and with them escape codes from the VM: turn off clipboard writes by programs (OSC 52), so that a command from the VM can't end up on your clipboard;
  - viewers that load remote content, such as Markdown previews, and GitHub's pull request page, which renders Pi's Markdown and collapses files marked as generated;
  - an editor connected to the sandbox ([Orca](orca.md)): it reads files, diffs and terminal output from the VM, and a flaw in how it handles them is a way onto the Mac. Orca's chat may load remote images on the Mac, with no setting to stop it; treat it as a way out for data;
  - llama-server, which runs unsandboxed and which the VM can reach.
- **Spending.** Code in the VM can use your keys freely. Set a spending or usage limit at each service whose key you add.
- **VM escapes.** The gateway and the VMs run as your macOS user, so an escape would land with your rights. OpenShell's microVM driver is marked experimental and has not been independently audited ([ADR 0000](adr/0000-openshell-microvm.md)).

## Reviewing Pi's pull requests

Review them like pull requests from an untrusted contributor, before running anything from the branch on the Mac. Besides the diff, look at:
- The commit messages and authors: both were written in the VM.
- The files GitHub collapses as generated, and changed `.gitattributes`, `.gitmodules` and `.lfsconfig` files: they change how Git handles files.
- Invisible Unicode characters that make code read differently than it runs ("Trojan Source"), and binary files.
- Lockfiles: check the hosts and packages in them, and install on the Mac with `npm ci --ignore-scripts` or not at all.
- Files that run automatically: `package.json` scripts, Makefiles, `conftest.py`, `setup.py`, `pyproject.toml`, `.pre-commit-config.yaml`, `.envrc`, `.vscode/`, `.github/workflows/`, `.pi/` and `.agents/`.
- Context files in any folder: `AGENTS.md`, `CLAUDE.md`, and `AGENTS.override.md`, which replaces the `AGENTS.md` next to it. Pi loads them without asking, and they instruct every agent that later works on the repo, in sandboxes and on the Mac.

Don't open the branch's files in a Markdown preview or another viewer on the Mac that loads remote images: `![](https://…)` in a file would send data out from the Mac.

## Allowing another host

Allow only hosts where nobody else can publish and see the requests (not `*.github.io`, for example), and that don't fetch URLs they are given.

For one sandbox, until it is deleted, run on the Mac:

```sh
openshell policy update myrepo --rule-name extra_hosts \
  --binary /usr/local/bin/node --binary /usr/bin/python3.13 --binary /usr/bin/curl \
  --add-endpoint docs.example.com:443:read-only:rest:enforce --wait
```

The `--binary` paths are the programs under `binaries` in `policy.yaml`. Then tell Pi: its copy of `policy.yaml` doesn't show the new host. To take it back: `openshell policy update myrepo --remove-endpoint docs.example.com:443 --wait`, or `--remove-rule extra_hosts` for all hosts added this way.

For every new sandbox, add a line at the end of the endpoints in `policy.yaml`.

Never approve the allow rules OpenShell drafts for blocked requests (`openshell rule get myrepo --status pending`). Pi or a malicious repo can trigger them on purpose, and they can allow more than reading, such as `POST /api/v1/extract`. Use the commands above.

## Checking the sandbox

Inside the VM:

| Command | Expected |
|---|---|
| `env` | No secrets: the key variables of the sandbox's providers ([Providers](providers.md)) hold placeholders, and the CA variables point to OpenShell's certificate. |
| `cat /proc/mounts` | No `virtiofs`, `9p` or `fuse` entries, so no Mac folders. |
| `node -e "fetch('https://example.com').then(r=>console.log(r.status),e=>console.log(e.cause?.code))"` | `EACCES`: the host isn't allowed. |
| `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.github.com/` | `403`: allowed hosts are read-only. |
| `cat /var/lib/dpkg/status` | `Permission denied`: the folder rules in `policy.yaml` are enforced. |

If the repo has the ruleset for its default branch ([Set up your repo](../README.md#set-up-your-repo)), test it once in the VM (replace `main` with the branch's name):

```sh
git fetch origin
c=$(git commit-tree 'origin/main^{tree}' -p origin/main -m 'must be refused') && git push origin "$c:refs/heads/main"
```

This pushes a new empty commit on top of `origin/main` and leaves the clone as it is. GitHub must answer with a rule violation. If it answers "fetch first" or "non-fast-forward" instead, `main` moved after the fetch and the rules were never checked: run both commands again. If the push goes through, the ruleset is not in effect.

On the Mac:

| Command | Shows |
|---|---|
| `openshell policy get myrepo --full` | The read-only hosts, the rule for the repo, and the providers' endpoints. |
| `openshell logs myrepo --tail` | Blocked connections, for example `DENIED ... example.com:443`. |
