# Troubleshooting, upgrading and cleanup

## If something fails

| Symptom | Fix |
|---|---|
| `openshell` commands can't reach the gateway | Check `openshell status`; restart with `brew services restart nvidia/openshell/openshell`. |
| A sandbox is stuck in `Completed` or `Error`, e.g. after a gateway restart with `prepare guest overlay disk failed` in `openshell sandbox get <name>` | `openshell sandbox stop <name>`, then `openshell sandbox start <name>`. Don't run `start` alone ([#4505](https://github.com/ai-openshell/OpenShell/issues/4505)). If that fails, push what you can and delete the sandbox. |
| Orca's setup on a sandbox says the host is missing system libraries | Its terminals need `/dev/ptmx` and `/dev/pts` in the folder rules of `policy.yaml`, where this repo has them. Restore them and create a new sandbox. |
| Pi has no models, or a model fails with a connection error | Use a model of the provider the sandbox was created with (`pi --model …`). |

## Known issues

- With llama-server, Pi prints `Error: Connection error.: other side closed (UND_ERR_SOCKET)` after most responses, then retries successfully.
- If Pi reads text that looks like an OpenShell key placeholder but isn't a valid one, every later request in that session fails with `403 credential_placeholder_in_request_body`. OpenShell refuses to forward it. Start a new session with `/new`; resuming the old one fails again.

## Upgrading

- **OpenShell:** read the [release notes](https://github.com/ai-openshell/OpenShell/releases) and compare `policy.yaml` with the new [default policy](https://docs.nvidia.com/openshell/latest/how-it-works/policies/default-policy). Then re-run the installer from [step 1](../README.md#1-install-openshell) with the new version in both places (the URL and `OPENSHELL_VERSION`), and create new sandboxes. `brew upgrade` doesn't see new releases: the installer's Homebrew formula is local.
- **Pi:** change `PI_VERSION` in `Dockerfile.pi`, run `pi-sandbox setup` again, and create new sandboxes: they boot from the new image.
- **The search skill's packages:** change the versions in `pi-agent/skills/kagi-search/package.json`, update `package-lock.json` with Node in Docker, and run `pi-sandbox setup` again:
  ```sh
  docker run --rm -v "$PWD/pi-agent/skills/kagi-search:/w" -w /w node:24-trixie-slim \
    npm install --package-lock-only --ignore-scripts
  ```

## Cleanup

Delete each sandbox and each provider you created, then the image and the gateway's config:

```sh
openshell sandbox delete myrepo
openshell provider delete NAME
docker rmi pi-agent:local
rm ~/.config/openshell/gateway.toml
```

With Orca, also remove `~/.ssh/pi-sandbox.config` and its `Include` line from `~/.ssh/config`.

Delete the GitHub token and the API keys at their services too.
