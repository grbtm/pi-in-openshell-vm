# ADR 0005: Anthropic as a model provider

- **Status:** Accepted. One check is open (see "Open tests").

## Context

Anthropic's Claude models are one more model provider to choose from. Several sandboxes can work on one repo (ADR 0004), so agents on different models can work side by side.

- **Pi** has Anthropic built in ([Pi's providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)). Its bundled catalog lists the Claude models. Pi sends `ANTHROPIC_API_KEY` in the `x-api-key` header with `POST /v1/messages` to `api.anthropic.com`, always with a query string, and calls no other Anthropic API.
- **OpenShell** serves only the profiles imported into its gateway, and ships example profiles to start from. Its Anthropic example gives the key to the whole host, for `curl`. Its [Pi tutorial](https://github.com/ai-openshell/openshell/blob/main/docs/tutorials/run-pi-with-openrouter.mdx) instead writes a profile of its own, for `node`. A profile edited from an example needs an id of its own ([OpenShell's providers](https://github.com/ai-openshell/openshell/blob/main/providers/README.md)).

## Decision

1. **A profile in this repo, `providers/anthropic-messages.yaml`,** with the id `anthropic-messages`, not the example's `anthropic` (see "Options not chosen"). The provider made from it is named `anthropic`, like Pi's provider, so that both still use the same name (`docs/providers.md`): `openshell provider create --name anthropic --type anthropic-messages`, then `pi-sandbox run anthropic`.
2. **The key works for one exact path:** `POST /v1/messages`, for `node`, the one call Pi makes. Every other API on the host stays blocked.
3. **No `models.json` entry:** Pi's catalog has the models (`pi --model anthropic/MODEL`).

## Consequences

- **Anthropic can reach any URL for the VM.** Images and documents given by URL, server-side tools such as web fetch, and MCP servers are fields in the `/v1/messages` body, and OpenShell's policy rules check only method, path and query. So code in the VM can make Anthropic's servers send data to any URL, which fails ADR 0003's test for hosts. It is accepted, as Kagi's body fields were: without this endpoint there is no Anthropic provider. Pi itself uses none of these tools.
- **The Claude models are those of the Pi version in the image.** `pi-sandbox` sets `PI_OFFLINE=1`, so Pi doesn't refresh its catalog. New models need a Pi upgrade.

## Options not chosen

- **OpenShell's example profile:** the key would work for every API on the host, from `curl` instead of `node`.
- **The example's id, `anthropic`, for this repo's profile:** a profile with the same id can't be imported next to it. If the example were imported first, `openshell provider create --type anthropic` would give the key to the whole host, without a warning.
- **A Claude subscription instead of an API key:** Anthropic intends subscription logins for its own apps, and API keys for other software ([Claude Code's legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)). Pi can still log in to one with `/login`, but that puts the token in the VM, where code there can read it (`docs/providers.md`, "Other models").
- **OpenShell's inference routing,** which [Pi's guide to OpenShell](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md) suggests: OpenShell has removed it ([upgrade notes](https://github.com/ai-openshell/openshell/blob/main/docs/upgrade/0-1-0.mdx)).
- **OpenShell middleware that checks request bodies** and blocks server-side tools ([supervisor middleware](https://github.com/ai-openshell/openshell/blob/main/docs/extensibility/supervisor-middleware/index.mdx)): one more service to run on the Mac.
- **Claude models through another provider's gateway:** another account, and one more party with the code.

## Open tests

- Whether the key or the organization can turn server-side tools off, checked with a web fetch to a URL you control. If they can, the setup step in `docs/providers.md` does it, and the first consequence shrinks; images and documents given by URL stay a way out either way.
