# Using a sandbox

How to start a sandbox, run Pi in it and get its work out, after the [setup](../README.md#one-time-setup). The commands run on the Mac, in your repo, unless noted; `myrepo` stands for the sandbox's name.

## Starting a sandbox

Push your current branch first (`git push -u origin BRANCH`). Then:

```sh
cd ~/code/myrepo
pi-sandbox run
```

`pi-sandbox run [PROVIDER] [NAME]` takes two optional arguments: the model provider (default `scaleway`, see [Providers](providers.md)) and a name for the sandbox. It does this:

1. Checks that `origin` is on `github.com` and has your current branch at the same commit as the Mac. If not, it stops. Uncommitted changes and untracked files stay on the Mac; it warns about them.
2. Creates the sandbox from the `pi-agent:local` image and attaches the providers. It sets Pi's environment variables and copies `models.json` and `policy.yaml` into Pi's config folder (`/var/lib/pi-agent` in the VM, which also holds Pi's settings, sessions and skills). Pi reads the allowed hosts from `policy.yaml`.
3. Lets Git in the VM fetch from and push to your repo's `origin`.
4. Clones your repo into `/sandbox/work`, with its whole history and all its branches, on the same branch as on the Mac. Submodules and Git LFS files are not set up (LFS files stay pointers).
5. Opens a shell there.

The sandbox's name is your repo's folder name, turned into lowercase letters, digits and dashes and cut to 19 characters (`openshell sandbox list` shows it). Pass another name as the second argument: `pi-sandbox run scaleway myrepo-2`. A name you pass must already have that form, or `pi-sandbox` refuses it.

The repo in the VM uses your Git `user.name` and `user.email`. Commits made by Pi also get a trailer with its provider, model and thinking level, such as `Assisted-by: Pi:scaleway/MODEL (thinking: high)`. The trailer comes from a hook that the VM sets through Git's `core.hooksPath`. Hooks in the repo's `.git/hooks` therefore don't run in the VM, and a repo that sets `core.hooksPath` itself (as husky does on `npm install`) gets no trailer.

## Starting Pi

In the VM, start Pi with a model of the provider the sandbox was created with, and optionally a thinking level. Pi lists the models of every model provider, but the sandbox can reach only the one it was created with. Always pass `--model`: without it, Pi may pick a model of another provider.

```sh
pi --list-models scaleway            # the provider's models
pi --model scaleway/MODEL:high       # PROVIDER/MODEL:LEVEL, the thinking level
```

Pi loads a context file, a file of instructions, into every session. The image comes with one (`pi-agent/sandbox-context.md`, installed as `AGENTS.md` in Pi's config folder). It tells Pi how to work with branches, and to ask for a new host instead of working around a block. To allow another host, see [Allowing another host](security.md#allowing-another-host).

When your repo has settings or resources in `.pi/` or `.agents/skills`, Pi asks whether to trust it ([Pi's project trust](https://docs.pi.dev/latest/security)). Trusting lets the repo's extensions run in Pi and its skills steer it; it doesn't change what the VM allows. Answer "Trust" only for repos whose `.pi/` and `.agents/` you review in pull requests. Never answer "Trust parent folder". Pi saves the answer for the folder and every folder below it, and it also covers every branch checked out there later. Context files (`AGENTS.md`, `CLAUDE.md`) load whether you trust the repo or not.

## Getting the results out

Pi commits on a branch of its own, pushes it to `origin` and tells you the branch name. To push a branch yourself, open a shell with `pi-sandbox shell` and run `git push origin BRANCH`. Then, on the Mac:

1. Open a pull request for the branch on GitHub.
2. Review it on the pull request page ([what to look at](security.md#reviewing-pis-pull-requests)). Don't run anything from the branch on the Mac **before that**, including tests and builds. Checking the branch out runs nothing, but Pi wrote its scripts and editor settings.
3. Merge it. Pi can push to the branch again while you review, so merge with the hash of the last commit you reviewed. GitHub's CLI (`brew install gh`, then `gh auth login`) refuses if the branch has moved since:
   ```sh
   gh pr merge NUMBER --match-head-commit HASH
   ```
4. `git pull` in your repo on the Mac.

## Sandbox lifecycle

The sandbox runs in the background until you stop or delete it. It can be used for one task after another: Pi fetches merged work and your fixes from `origin`. A repo can have several sandboxes. They share the repo on GitHub, so each can change the others' branches.

| To | Run |
|---|---|
| Leave the shell | `exit` in the VM. The sandbox and Pi's sessions stay. |
| Open a shell again | `pi-sandbox shell`. Don't use `openshell sandbox connect`: it attaches to the sandbox's first shell instead of opening a new one. |
| Pause, keeping files | `openshell sandbox stop myrepo`, later `openshell sandbox start myrepo` |
| Remove for good | `openshell sandbox delete myrepo`, after pushing |

Deleting a sandbox loses every commit that exists only in the VM, and Pi's sessions. With Orca, [unlink it](orca.md#removing-a-sandbox) first.

The repo (`/sandbox/work`) and Pi's config folder with its sessions survive a stop; `/tmp` is cleared.

After your repo is renamed or moved on GitHub, set `origin` on the Mac to the new address and create a new sandbox: the old sandbox's Git rule still names the old path.
