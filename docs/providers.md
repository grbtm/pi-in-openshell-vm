# Providers

How to register the providers a sandbox uses, add models and rotate a key.

A provider is two things under one name, for example `scaleway`:

- In OpenShell: an allow rule for one service's API, with the service's key if it has one. It is made from a profile (`providers/*.yaml`).
- In Pi: the list of a model provider's models. It is an entry in `models.json`, or built into Pi for Anthropic.

A model provider serves a model. The other providers are for Git and web search.

Every sandbox needs `github-git` and one model provider; `pi-sandbox run` also attaches `kagi` to new sandboxes if you added it. The commands assume zsh, the macOS default shell.

| Provider | For | Key variable |
|---|---|---|
| `github-git` | Git in the VM: cloning, fetching and pushing your repo. Required. | `PI_GITHUB_TOKEN` |
| `scaleway` | Hosted open-weight models. The default model provider of `pi-sandbox run`. | `SCW_SECRET_KEY` |
| `anthropic` | Claude models. | `ANTHROPIC_API_KEY` |
| `llama-server` | A local model. | none |
| `kagi` | Web search. Optional. | `KAGI_API_KEY` |

## Registering a provider

Each section below says how to create the provider's key, and has the commands that register the provider. Run them in this repo (`cd ~/pi-in-openshell-vm`). They follow one pattern:

- `read -rs` puts the key into your shell without showing it or saving it in your history.
- `profile lint` checks the profile, and `profile import` gives it to the gateway.
- `VAR=$VAR` in front of `provider create` passes the key to that one command. With `--from-existing`, `provider create` makes the provider from the profile and takes the key from the variable. The gateway stores the key, so you don't need it again until you rotate it.

## GitHub (`github-git`)

On GitHub, create a [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) with:

- an expiry date;
- "Only select repositories", with your repo;
- the repository permission "Contents: Read and write", and nothing else. Leave out "Workflows" on purpose: GitHub then refuses pushes from the VM that add or change a workflow.

```sh
read -rs "PI_GITHUB_TOKEN?Token: "; echo
openshell profile lint   -f providers/github-git.yaml
openshell profile import -f providers/github-git.yaml
PI_GITHUB_TOKEN=$PI_GITHUB_TOKEN openshell provider create --name github-git --type github-git --from-existing
unset PI_GITHUB_TOKEN
```

On its own, the provider lets Git only list branches and tags on `github.com`; `pi-sandbox run` adds a rule that lets it fetch from and push to your repo ([ADR 0004](adr/0004-git-host.md)). The permission is the narrowest GitHub has for pushing, but GitHub also accepts the token for merging a pull request through its API (`api.github.com`). Pi can't do that, because OpenShell puts the token only into Git's requests to `github.com`. If you change the profile or the policy, keep the token off `api.github.com`.

To use the token for another repo, change its repositories on GitHub, or create a new token and load it as in [Rotating a key](#rotating-a-key). Sandboxes for the repo it covered before then lose access.

## Scaleway Generative APIs (`scaleway`)

EU, open-weight models. In the Scaleway console, create an **IAM application** and a policy that gives it only `GenerativeApisModelAccess` on your project. Generate an API key for the application (not for your own user), with an expiry date. If the IAM policy is scoped to a project other than your default one, change two files of this repo before you register: `baseUrl` in `models.json` to `https://api.scaleway.ai/<project-id>/v1`, and `path` in `providers/scaleway.yaml` to `/<project-id>/v1/**`. Commit the change locally, so that `git pull` keeps it.

```sh
read -rs "SCW_SECRET_KEY?Key: "; echo
openshell profile lint   -f providers/scaleway.yaml
openshell profile import -f providers/scaleway.yaml
SCW_SECRET_KEY=$SCW_SECRET_KEY openshell provider create --name scaleway --type scaleway --from-existing
unset SCW_SECRET_KEY
```

## Anthropic (`anthropic`)

Claude models. In the Claude Console, create a workspace with a spending limit, and an API key in it. Use an API key, not a Claude subscription. Pi has the Claude models built in, those of its version in `Dockerfile.pi`; for newer ones, upgrade Pi ([Upgrading](troubleshooting.md#upgrading)). The provider allows only `POST /v1/messages` ([ADR 0005](adr/0005-anthropic-provider.md)). Its profile has the id `anthropic-messages`, not the provider's name:

```sh
read -rs "ANTHROPIC_API_KEY?Key: "; echo
openshell profile lint   -f providers/anthropic-messages.yaml
openshell profile import -f providers/anthropic-messages.yaml
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY openshell provider create --name anthropic --type anthropic-messages --from-existing
unset ANTHROPIC_API_KEY
```

## Local llama-server (`llama-server`)

No key. Start it in its own terminal and leave it running, with one of the models in `models.json`. On a Mac with 16 GB:

```sh
brew install llama.cpp
llama-server -hf unsloth/Qwen3.5-9B-GGUF:Q4_K_M --no-mmproj --alias qwen3.5-9b \
  -c 32768 --reasoning off \
  --cors-origins http://host.openshell.internal:8080 --host 127.0.0.1 --port 8080
```

On a Mac with 32 GB:

```sh
llama-server -hf unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_XL --no-mmproj --alias qwen3.8-27b \
  -c 65536 -np 1 -ngl all -ctk q8_0 -ctv q8_0 -ctxcp 8 -cram 4096 --reasoning off \
  --cors-origins http://host.openshell.internal:8080 --host 127.0.0.1 --port 8080
```

- `--reasoning off`: with thinking on, these models put tool calls inside their thinking, and Pi never sees them ([llama.cpp #20837](https://github.com/ggml-org/llama.cpp/issues/20837)); thinking also needs more context than fits in memory.
- `-np 1 -ngl all -ctk q8_0 -ctv q8_0 -ctxcp 8 -cram 4096` keep the 27B model within 32 GB: one request at a time, every layer on the GPU, a smaller KV cache, and a cap on the RAM llama-server uses for saved prompt states. If it doesn't fit, lower `-c` (and `contextWindow`).
- The sampling settings are in `models.json` (`samplingParams`); Pi sends them with each request.
- `--cors-origins http://host.openshell.internal:8080`: the VM reaches the server under that name, which llama-server otherwise rejects as a possible DNS rebinding attack. Websites in your browser still can't use the server.
- Keep `--host 127.0.0.1`, so that only your Mac reaches it, and port 8080, which `providers/llama-server.yaml` expects.
- The model `id` and `contextWindow` in `models.json` must match `--alias` and `-c`.

Then register it in another terminal, without a key:

```sh
openshell profile lint   -f providers/llama-server.yaml
openshell profile import -f providers/llama-server.yaml
openshell provider create --name llama-server --type llama-server
```

## Kagi web search (`kagi`, optional)

In Kagi's API portal, create an API key, limit it to the Search product, and set a usage limit. Pi then searches the web with its `kagi-search` skill (`pi-agent/skills/kagi-search`), and reads the pages it finds on the hosts in `policy.yaml`. The provider allows only Kagi's search endpoint ([ADR 0003](adr/0003-network-access.md)). Without it, `pi-sandbox run` warns that the sandbox has no web search.

```sh
read -rs "KAGI_API_KEY?Key: "; echo
openshell profile lint   -f providers/kagi.yaml
openshell profile import -f providers/kagi.yaml
KAGI_API_KEY=$KAGI_API_KEY openshell provider create --name kagi --type kagi --from-existing
unset KAGI_API_KEY
```

## Other models

`models.json` lists the models of each model provider except Anthropic, and `pi-sandbox run` copies it into every new sandbox. To use other models, edit it ([Pi's format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)); a new provider also needs a profile in `providers/`. Refer to a key as `${VAR}`, with the variable named under `env_vars` in the provider's profile; in the VM it resolves to the placeholder. Never put a literal key into `models.json`, and never run Pi's `/login` in the VM: both put a real key where code in the VM can read it.

## Models and thinking levels

`/model` switches models inside Pi. In `models.json`, each model's `thinkingLevelMap` maps Pi's thinking levels to the `reasoning_effort` values the model accepts ([Scaleway's values per model](https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/)); `null` hides a level in `/thinking`. When you switch models, Pi keeps the thinking level if the new model supports it, and otherwise moves to the next **higher** one, for example from `medium` to `high`.

## Rotating a key

Load the new key into its variable (`VAR` here) with the `read -rs` line of the provider's section, then:

```sh
VAR=$VAR openshell provider update NAME --from-existing --wait
unset VAR
```

In running sandboxes, quit Pi and start it again from a new shell (`pi-sandbox shell`). Git needs no restart: GitHub's placeholder stays the same. Then delete the old key at the service.
