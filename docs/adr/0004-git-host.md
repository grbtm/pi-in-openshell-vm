# ADR 0004: Code enters and leaves a sandbox through the repo's Git host, and review moves to pull requests

- **Status:** Accepted. Two checks are open (see "Open tests").

## Context

A sandbox has to keep up with its repo. If code only enters when the sandbox is created, every merge and every fix on the Mac leaves it behind: Pi keeps building on the commit the sandbox started from. The only remedy is a new sandbox, which loses Pi's sessions, installed packages and, with an editor, its SSH entry and host.

Every way to exchange commits between the Mac and the VM directly costs either code that only this project has or part of the boundary (see "Options not chosen"). A remote on a Git host costs part of it too (see "Consequences"), but with standard tools: both sides reach it without reaching each other, and pull requests are an established place for review.

OpenShell's proxy makes that possible without a token in the VM: a provider holds the token, and a rule per repo allows Git's fetches and pushes ([GitHub Push Access](https://docs.nvidia.com/openshell/latest/tutorials/github-push-access)).

## Decision

1. **One way in and one way out.** A sandbox works on a clone of the repo's remote on its Git host, and Pi's work leaves as branches pushed there. The host is GitHub. Another host needs a provider profile of its own, and decisions 7 to 9 in that host's terms: a token limited to one repo, and a rule that keeps pushes off the default branch.
2. **A provider, `github-git`** (`providers/github-git.yaml`), which `run` requires. The VM sees a placeholder in `PI_GITHUB_TOKEN`, a name no other tool reads, and OpenShell puts the real token into requests to `github.com` only. The placeholder stays the same when the token is replaced, so running shells and Pi sessions keep working. `api.github.com` stays read-only without a token (ADR 0003).
3. **`run` connects the sandbox to one repo,** the `origin` of the repo on the Mac. Before it creates anything, it checks that `origin` is on `github.com` and that GitHub has the checked-out branch at the same commit, and refuses otherwise. It then adds a rule to the sandbox that lets Git fetch from and push to `/OWNER/REPO.git`, and no other repo, and Git in the VM clones the repo with its history and checks out that branch.
4. **Git in the image is told to use the variable:** a line of Git config that says, for `github.com`, send the content of `PI_GITHUB_TOKEN` as the password. The image holds the variable's name, and the variable holds the placeholder; no token is in the image or the VM.
5. **Pi brings itself up to date and pushes its own branches.** For each task: `git fetch origin`, a new branch from `origin`'s default branch, commits, `git push origin BRANCH`. Pi doesn't force-push or merge into the default branch, even when the repo's instructions or a skill say to. After you merge, Pi starts a new branch. Pi's context file says so.
6. **You review on GitHub and merge there.** You open the pull request from the pushed branch, and merge with `gh pr merge --match-head-commit`, which merges only if the branch still ends at the commit you reviewed. The VM gets no write access to GitHub's API, so nothing in the VM can open, approve or merge a pull request.
7. **A ruleset on GitHub keeps Pi off the default branch:** it requires a pull request, blocks force pushes and deletion, and lets nobody bypass. Nothing else enforces this: OpenShell's rule can't see which branch a push names, and Pi's context file is a request. In a repo without the ruleset, Pi can push to the default branch, and no review is required.
8. **GitHub Actions gets no rights Pi could borrow:** in the repo's settings, workflows get read-only permissions and may not create or approve pull requests, and auto-merge stays off.
9. **The token is a fine-grained personal access token,** limited to one repo, the one Pi works on, with read and write access to contents and nothing else (GitHub adds read access to metadata to every token). Without the Workflows permission, GitHub refuses a push that adds or changes a workflow, so Pi can't write a workflow that reads the repo's secrets. GitHub has no narrower permission for pushing, and this one also covers GitHub's API: merging a pull request, creating releases, and changing branches and tags ([permissions per endpoint](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)). Only decision 2 keeps the VM from that: the token goes to `github.com`, for Git, and must never be sent to `api.github.com`.

Decisions 7 to 9 are settings on GitHub. The ruleset requires no approvals: GitHub doesn't let you approve your own pull request. The README requires the token's access and permission and recommends the rest when setting up a repo, and `docs/security.md` tests the ruleset with a push to the default branch from the VM, which GitHub must refuse. `run` doesn't check them.

One round, with Pi's branch `task`:

```
who          Mac: the repo        GitHub: OWNER/REPO           VM: /sandbox/work

run                               S  main  ------ git clone ----->  S  main

you          merge a pull request:
                                  S--A  main

Pi                                         ------ git fetch ----->  S--A  origin/main
                                                                        \
                                                                         X--Y  task

Pi                                task     <----- git push -------

you          review the pull request for task, and merge it at Y:
                                  S--A--X--Y  main

you          git pull
             S--A--X--Y  main
```

## Consequences

- **Every repo needs a remote on GitHub and a token that covers it before its first `run`.** The settings of decisions 7 and 8 are recommended and not checked: without the ruleset, Pi can push to the default branch. Rulesets need a public repo or a paid plan.
- **One repo per token.** Git sends the token with every read request to `github.com`, so a sandbox can list the branches and tags, with their commits, of every repo the token covers. The rule keeps Git from fetching their contents; whether another read returns them is an open test (see "Open tests"). A token for one repo keeps that list to the sandbox's own repo. `run` uses one provider for all sandboxes, so with a one-repo token they all work on that repo: moving to another repo means pointing the token at it, and sandboxes for the previous repo lose access. Sandboxes for two repos at the same time need a token for both. A token for several repos works, at the cost of that list.
- **You work through pull requests too.** Pushes with the token count as yours, so a rule that stops Pi stops you: no direct push to the default branch. Pi's commits carry your name.
- **Code can't stay on the Mac.** Even with a local model, the repo is on GitHub.
- **The VM can read the whole repo:** all branches and its whole history. Before a repo's first `run`, run a secret scanner over its history and replace the secrets it finds.
- **A way out without review.** Pi can push anything it can read in the VM to the repo. In a public repo, that is public at once, and a push can't be taken back reliably: GitHub may keep serving a commit after its branch is deleted.
- **At most the default branch is protected.** Pi can create, move and delete every other branch and every tag. So:
  - a branch you pull on the Mac can carry Pi's commits without a pull request: look before you pull;
  - whatever acts on tags or other branches acts on Pi's pushes: a release workflow started by a tag, a site published from a branch, other projects that install from a tag;
  - one sandbox can change another sandbox's branch.
- **A workflow that runs for Pi's branch or tag runs Pi's code outside the sandbox,** with open network access and the secrets that workflow gets. Let workflows with secrets run only on pushes to the default branch, or behind an environment that needs approval: Pi's branches are in the repo, not in a fork, so `pull_request` workflows get the repo's secrets.
- **The pull request page is the review.** Changes to `.gitattributes`, `.gitmodules` and `.lfsconfig` are yours to look for, and a file marked as generated is collapsed in the diff. Checking a branch out on the Mac before the review runs nothing by itself, but its scripts and editor settings are Pi's.
- **Git LFS and submodules are not set up.** Files in LFS stay pointers.
- **After a repo is renamed or moved on GitHub,** set `origin` on the Mac to the new address and create a new sandbox: the rule names the old path.
- **Several sandboxes for one repo all meet on GitHub.**
- **An editor connected to the sandbox** (ADR 0001) stays as it is. Its Git can push; its pull request features can't reach GitHub's API.

## Options not chosen

- **Keeping an upload and a fetch command beside GitHub,** for repos without a remote there: two ways to do everything, and twice the code and docs.
- **A GitHub App in place of the personal token:** pushes then count as the app's, not yours. Rules could stop Pi without stopping you, also for tags and other branches, and OpenShell creates short-lived tokens from the app's key. More to set up. To revisit when sharing one identity with Pi gets in the way.
- **Rulesets for tags and for all other branches:** with one identity they stop you too, for example from tagging a release.
- **Fetching from any repo on GitHub with the token,** as OpenShell's example profile allows: in a sandbox for a public repo, Pi could then clone a private repo the token covers and push it to the public one.
- **Bundles in both directions** (a `pi-sandbox push` for the way in, and a fetch for the way out): the boundary stays as it is, but every merge takes two steps by hand, Pi can't update itself, and the way in is code that only this project has and no other tool documents.
- **`git push` over SSH from the Mac:** little code, but over OpenShell's SSH a push with a larger pack fails ([#5727](https://github.com/ai-openshell/OpenShell/issues/5727)).
- **A read-only mount of the Mac's repo that the VM fetches from:** Pi could update itself, but OpenShell calls such a mount an unsafe override: a compromised guest kernel is not confined to the mounted folder.
- **A Git worktree of the Mac's repo, mounted into the VM:** no review step, and the VM can write hooks and settings that Git on the Mac then runs. With `.git` read-only, Pi can't commit.
- **Letting Pi open pull requests:** write access to GitHub's API, for one click.

## Open tests

- The ruleset refuses a push to the default branch from the VM.
- For a token that covers several repos: does any `GET` path on `github.com` other than Git's serve their private content to the token? If so, the provider's endpoint needs narrower paths.
