# ADR 0000: Run Pi in OpenShell microVMs

- **Status:** Accepted. Facts about other products are from their documentation.

## Context

Pi has no approval prompts and runs whatever commands it decides on. It needs a sandbox on a Mac (Apple silicon) that:

- separates it from the Mac by a VM, not a container;
- keeps API keys out of the sandbox, so that code in it can use a key only for the provider it belongs to;
- controls outbound traffic per host and, ideally, per HTTP method and path ([ADR 0003](0003-network-access.md));
- is open source and runs without a vendor account.

Pi's docs ([containerization](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md)) name three ways to run the whole Pi process isolated: a plain Docker container, which gets the keys passed in, Docker Sandboxes and OpenShell.

## Decision

Run Pi in [OpenShell](https://github.com/ai-openshell/OpenShell)'s microVM backend (`compute_driver = "vm"`, which is never picked automatically). OpenShell (Apache-2.0) provides:

- **A VM per sandbox:** libkrun on Hypervisor.framework (macOS) or KVM (Linux).
- **No network device in the VM:** all traffic goes over vsock to the sandbox's supervisor, a process on the Mac, which checks every connection against the sandbox's policy, by host, program and, for `protocol: rest`, HTTP method and path. The gateway stores and delivers policies; it doesn't carry traffic.
- **Placeholder keys:** provider keys stay with OpenShell. The VM sees placeholders, which the supervisor replaces only on requests that match the provider's endpoint and path.
- **Landlock in the VM:** a fixed baseline plus the policy's filesystem rules (`policy.yaml`).

## Options not chosen

- **Docker Sandboxes (`sbx`):** a microVM per sandbox with a proxy that injects keys, and network rules down to HTTP method and path. But it is closed source, needs a Docker account (`sbx login`), and by default mounts the project read-write into the VM. Its `--clone` mode mounts the project read-only and works on a clone inside the VM.
- **Lima:** a general Linux VM, with no egress control and no key proxy: keys live in the VM. By default the VM reaches services on the Mac's loopback (`host.lima.internal`), which can be turned off for the `vz` backend.
- **Apple `container`:** a lightweight VM per container, but no egress rules beyond a host-only network, and no key proxy. Needs macOS 26.
- **Gondolin** (from Pi's authors, experimental): runs only Pi's tools in a microVM, with host allowlists and placeholder keys. Pi itself, its keys and its extensions stay on the Mac.

## Consequences

- **An early-stage dependency:** OpenShell's VM driver is marked experimental; experimental interfaces may change in a patch release. No independent security audit is published. The README's security model lists VM escapes as not covered. Re-test the workarounds in `pi-sandbox` (such as the restart after `create`) after each upgrade.
- **Enforcement must be explicit:** an endpoint without `enforcement` defaults to `audit`, which only logs requests that break its rules. Every endpoint in this repo sets `enforcement: enforce`.
- **Keys go only through OpenShell:** never run Pi's `/login` in the VM, and never put a key into `models.json` or the repo: Pi stores what `/login` gets in its config folder (`auth.json`), inside the VM, where code can read it.
- **Pi's dependencies aren't pinned:** the image installs Pi from npm, which pins Pi's version but not its dependencies. Pi's own installer pins them with a lockfile from Pi's repo (`packages/coding-agent/install-lock/`), which isn't in the npm package. Using it would mean keeping a copy in sync with `PI_VERSION`.
