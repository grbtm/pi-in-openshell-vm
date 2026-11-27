# pi-in-openshell-vm

Run the [Pi](https://pi.dev) coding agent in a sandbox on a Mac (Apple silicon). [OpenShell](https://github.com/ai-openshell/OpenShell) runs the sandbox as a microVM, limits its network access to an allowlist, and keeps API keys outside it.

This repo adds the `pi-sandbox` script. In a Git repo that has its `origin` on GitHub, `pi-sandbox run` clones the repo from GitHub into a new sandbox and opens a shell there, where Pi is started. Pi pushes its work to GitHub as branches, for review and merging as pull requests. The LLM that Pi works with comes from a model provider: a hosted API, or a server running locally on the Mac ([Providers](docs/providers.md)). The Orca desktop app can connect to a sandbox over SSH and run Pi there ([Using Orca](docs/orca.md)).

The sandbox narrows what Pi can reach; it doesn't stop data from leaving through the sites and APIs on the allowlist ([Security model](#security-model)).

## How it works

```text
+----------------------------------- Mac ------------------------------------+
|                                                                            |
|  +------------------------------------------+                              |
|  | microVM (the sandbox)                    |     +---------------------+  |
|  | Pi, in a clone of the repo               |     | local LLM server    |  |
|  | placeholder keys only, no Mac folders    |     | (if you run one)    |  |
|  +------------------------------------------+     +---------------------+  |
|                       |                                      ^             |
|                       | all of the VM's traffic              |             |
|                       v                                      |             |
|  +----------------------------------------------------------------------+  |
|  | OpenShell                                                            |  |
|  | checks the traffic against the policy and the providers              |  |
|  | holds the real keys, and swaps the placeholders for them             |  |
|  +----------------------------------------------------------------------+  |
|         |                       |                       |                  |
+---------|-----------------------|-----------------------|------------------+
          v                       v                       v
      hosted LLM API          the repo on GitHub      the hosts in
      web search (optional)   (Git fetch and push)    policy.yaml (read-only)

      everything else: blocked
```

OpenShell runs on the Mac in two parts. The **gateway** is a background service that creates the sandboxes and stores the real keys. A **supervisor**, one per sandbox, is a process that carries all of that VM's traffic. What a sandbox may reach is its allowlist, which comes from two places. The **policy** (`policy.yaml`, plus a rule that `pi-sandbox run` adds for Git on the one repo) lists the hosts it may read from and the folders it may use. Each **provider** is an allow rule for one service's API, together with that service's key.

- **A request to the LLM:** Pi sends it with a placeholder, a fake key that the VM holds instead of the real one. The supervisor checks the request against the model provider's rule, puts the real key in, and forwards it to the provider's API. A local LLM server gets its requests the same way, without a key.
- **Code:** it moves only through the repo on GitHub. `pi-sandbox run` clones the repo into the VM, Pi pushes its work there as a branch, and `git pull` brings it to the Mac once it is merged. The pull request is the place to review it. GitHub requires that step only if the default branch has a ruleset ([Set up your repo](#set-up-your-repo)).

## Security model

Pi has the repo's code and reads untrusted content: the repo, web pages, packages and the LLM's output can all carry instructions (prompt injection). An agent with private data, untrusted input and a way to send data out can be tricked into leaking the data ([lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/), [Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/)). Every host on the allowlist, a site or an API, is a way out for data, and Pi needs at least one to reach the LLM. So this setup keeps the ways out few, and routes Pi's work through pull requests, where it can be reviewed before it reaches the Mac:

- **Network:** the VM has no network card. Its traffic reaches the outside only through OpenShell's supervisor, which allows only the API endpoints of the sandbox's providers, Git fetches and pushes for the one repo on GitHub, and read-only requests (`GET`, `HEAD`, `OPTIONS`) to the hosts in `policy.yaml`.
- **Keys:** real API keys and the GitHub token stay with OpenShell. Pi sees placeholders.
- **The Mac:** nothing is mounted into the VM, and Pi and its tools are installed and run only in the VM. Code comes in and goes out only through the repo on GitHub, where Pi's branches can be reviewed in pull requests before anything from them is merged or run. GitHub keeps Pi off the default branch only if the repo has a ruleset for it ([Set up your repo](#set-up-your-repo)). Without one, Pi can push there directly, and nothing requires a review.

What this does **not** protect against, in short ([the full list](docs/security.md#what-this-does-not-protect-against)):

- **Data leaving through allowed hosts:** a hosted model provider gets the code and prompts, a search provider the searches, and code in the VM can send data out through every allowed host.
- **Pushes from the VM:** no review happens before a push. Pi can push anything it can read in the VM to the repo. In a public repo, that is public at once. At most the default branch is protected.
- **Prompt injection:** Pi has no approval prompts, and code it leaves in the VM runs again later in that sandbox.
- **Programs that handle VM content:** the terminal (turn off clipboard writes by programs, OSC 52), an editor, viewers that load remote content, and a local LLM server.
- **Spending:** code in the VM can use the keys freely. Set a spending or usage limit at each service.
- **VM escapes:** the gateway and the VMs run as the macOS user who starts them, and OpenShell marks its microVM driver as experimental.

## Prerequisites

- A Mac with Apple silicon and [Homebrew](https://brew.sh). Linux with KVM should work with the Linux equivalents of these steps, but is untested.
- A repo for Pi to work on ("your repo" below), with its `origin` on GitHub.
- Docker, running for `pi-sandbox setup` and `pi-sandbox run`. It builds the image and hands it to OpenShell; no container runs.
- An LLM for Pi: an API key for a hosted model provider, or a Mac with enough memory to run one locally ([Providers](docs/providers.md)).

## One-time setup

### 1. Install OpenShell

```sh
curl -LsSf https://raw.githubusercontent.com/ai-openshell/OpenShell/v0.1.10/install.sh | OPENSHELL_VERSION=v0.1.10 sh
brew install e2fsprogs
```

On macOS, the installer creates a local Homebrew formula and runs the gateway as a Homebrew service. The microVM driver needs `mke2fs`, which `e2fsprogs` provides.

### 2. Get this repo and build the image

```sh
git clone https://github.com/grbtm/pi-in-openshell-vm ~/pi-in-openshell-vm
echo 'export PATH="$PATH:$HOME/pi-in-openshell-vm"' >> ~/.zshrc && source ~/.zshrc
pi-sandbox setup
```

`pi-sandbox setup` builds the `pi-agent:local` image from `Dockerfile.pi` and `pi-agent/` (Pi's skills, the instructions it loads into every session, the Git settings for the VM, and a [personal Pi config](docs/usage.md#personal-pi-config) in `pi-agent/personal/`, if there is one). Every VM boots from this image. Run `pi-sandbox setup` again after changing either.

### 3. Switch the gateway to the microVM backend

Create `~/.config/openshell/gateway.toml`:

```toml
[openshell]
version = 2

[openshell.gateway]
compute_driver = "vm"

[openshell.drivers.vm]
# The image each VM boots from (step 2).
bootstrap_image = "pi-agent:local"
# These apply to every sandbox. OpenShell's defaults (2 vCPUs, 2 GiB, 4 GiB disk)
# fit Pi alone, not a repo with node_modules or a virtual environment. The disk
# file grows as it fills, and a VM stopped with a full disk can't be started
# again (github.com/ai-openshell/OpenShell/issues/5149).
vcpus = 4
mem_mib = 4096
overlay_disk_mib = 16384
```

Restart the gateway with `brew services restart nvidia/openshell/openshell`, and check it with `openshell status`.

When a sandbox's request is blocked, OpenShell drafts an allow rule for it and waits for someone to approve it. Make sure no draft is ever approved automatically (manual is the default; this pins it for every sandbox):

```sh
openshell settings set --global --key proposal_approval_mode --value manual --yes
```

Optional: the gateway sends anonymous telemetry. To turn it off, put `OPENSHELL_TELEMETRY_ENABLED=false` into `~/.config/openshell/gateway.env` and restart the gateway.

### 4. Add the providers

Every sandbox needs the `github-git` provider, with a GitHub token for your repo, and one model provider. A search provider is optional. [Providers](docs/providers.md) lists the ones this repo has profiles for, and says how to create each key and register the provider.

## Set up your repo

Do this for each repo Pi works on, before its first `pi-sandbox run`. The examples use `~/code/myrepo`.

**Required:** give the token of the `github-git` provider access to the repo, with "Contents: Read and write" and no other permission ([Providers](docs/providers.md#github-github-git)). A token created for this repo in step 4 already has it.

**Recommended:** the steps below. `pi-sandbox` works without them and doesn't check them. Each one limits what a push from the VM can do, or what the VM can read. Decide for each repo which of them it needs.

- **Limit the token to this repo** ([how](docs/providers.md#github-github-git)). Without the limit, Git in the VM can at least list the branches and tags, with their commits, of every repo the token covers. All sandboxes share the one token, so with the limit they can work on this repo only: sandboxes for several repos at the same time need a token that covers all of them.
- **Protect the default branch.** Add a ruleset for it, with an empty bypass list: "Restrict deletions", "Block force pushes", and "Require a pull request before merging" with 0 required approvals. It applies to you too, and needs a public repo or a paid GitHub plan. Otherwise Pi can push to the default branch directly, and a `git pull` brings unreviewed code to the Mac. After the repo's first `pi-sandbox run`, [check that GitHub refuses such a push](docs/security.md#checking-the-sandbox).
- **Give GitHub Actions no rights Pi could borrow.** In the repo's Actions settings, give workflows read-only permissions and don't allow them to create or approve pull requests. In the general settings, leave auto-merge off. Otherwise a workflow that runs for Pi's branch can change the repo or merge a pull request.
- **Keep secrets away from Pi's branches.** Let workflows that get secrets run only on pushes to the default branch, or behind an environment that needs approval. Pi's branches are in the repo, not in a fork, so otherwise `pull_request` workflows and workflows started by tags run Pi's code with the repo's secrets.
- **Scan the history for secrets.** Run a secret scanner over the repo's whole history, and replace the secrets it finds at their service; deleting them from the history is not enough. Otherwise Pi can read them: the VM has every commit.

## Daily use

On the Mac, in your repo, with the current branch pushed to `origin`. Without an argument, `pi-sandbox run` uses the model provider `scaleway`; to use another, name it, as in `pi-sandbox run anthropic`:

```sh
cd ~/code/myrepo
pi-sandbox run
```

This creates a sandbox named after the repo's folder (`myrepo`), clones the repo into it on the current branch, and opens a shell in the clone. In that shell, start Pi with one of the provider's models:

```sh
pi --list-models scaleway            # the provider's models
pi --model scaleway/MODEL:high       # PROVIDER/MODEL:LEVEL, the thinking level
```

Pi pushes its work as a branch and tells you its name. Then, on the Mac:

1. Open a pull request for the branch on GitHub.
2. Review it there, **before running anything** from the branch on the Mac, including tests and builds ([what to look at](docs/security.md#reviewing-pis-pull-requests)).
3. Merge it at the commit you reviewed ([how](docs/usage.md#getting-the-results-out)), and `git pull`.

The sandbox keeps running in the background and can serve many tasks. `pi-sandbox shell` opens another shell in it, and `openshell sandbox delete myrepo` removes it, along with every commit that wasn't pushed.

Details, including Pi's trust prompt: [Using a sandbox](docs/usage.md).

## More

- [Using a sandbox](docs/usage.md): what `pi-sandbox run` checks and sets up, Pi's trust prompt, a personal Pi config, merging only the commit you reviewed, stopping and restarting a sandbox.
- [Providers](docs/providers.md): keys and setup for each provider, other models, thinking levels, rotating a key.
- [Security](docs/security.md): everything this does not protect against, reviewing Pi's pull requests, allowing another host, checking a sandbox.
- [Using Orca](docs/orca.md): running Pi from the Orca desktop app, over SSH.
- [Troubleshooting](docs/troubleshooting.md): if something fails, known issues, upgrading, cleanup.
- [Design decisions](docs/adr/): the ADRs.

## License

[MIT](LICENSE). `pi-agent/skills/kagi-search/read.mjs` is adapted from [pi-skills](https://github.com/badlogic/pi-skills) and keeps its MIT notice.
