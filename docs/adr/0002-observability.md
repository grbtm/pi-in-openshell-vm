# ADR 0002: Observability with OpenTelemetry

- **Status:** Proposed, nothing built. Step 1 has to confirm the assumptions on the current versions.

## Context

Several agents will run in their own sandboxes (see [ADR 0001](0001-orca-via-ssh.md)). It must be possible to see what each one did, both as an agent and as a network client:
- which model calls and tool calls it made, how long they took, how many tokens they used, and which ones failed;
- which connections the sandbox tried, and which the policy allowed or denied.

Today there is only `openshell logs <name>`, read by hand.

OpenTelemetry (OTel) is the common standard for this. Its [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md) define spans for model and tool calls. They are still marked "Development", so attribute names can change.

What exists:
- **OpenShell** ([observability docs](https://docs.nvidia.com/openshell/latest/observability/overview)) exports over OTLP, configured in `gateway.toml`:
  - its own traces;
  - OCSF security events, such as allowed and denied connections and policy decisions, as OTLP log records (off by default);
  - an **agent trace relay** (off by default). It sets `OTEL_EXPORTER_OTLP_ENDPOINT` in every process in the sandbox. Its address isn't a network destination: OpenShell serves it inside the sandbox and forwards the traces to the collector, tagged with `openshell.sandbox.id`. The agent never learns the collector's address or credentials, and needs no network rule. The relay accepts only OTLP/HTTP protobuf without compression, and drops metrics and logs.
- **With the microVM backend**, the processes that export (the gateway and each sandbox's supervisor) run on the Mac. The VMs have no network interface. So a collector bound to the Mac's loopback is reachable for OpenShell, but not for anything inside a VM.
- **Pi** exports no OTel. Its `packages/telemetry` defines interfaces but no exporter.
- **Community Pi extensions** on npm nearly all send OTLP as JSON, which the relay refuses. The one that would work, `pi-otel`, ships an old SDK with gRPC and extras such as a command that starts Docker.

## Decision

1. **Metadata only.** Traces record what happened, not what was said: models, durations, token counts, tool names, errors. No prompts, model output, tool arguments, tool results or file contents. This is the GenAI conventions' default: content capture is opt-in (`OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT=NO_CONTENT`). The collector also deletes content attributes, in case an extension sends them anyway.
2. **The OTel Collector is the only entry point.** It receives OTLP from OpenShell, checks a token, drops content attributes, and passes the rest to the backend. This is the setup OTel's docs recommend, and it means changing the backend doesn't touch OpenShell's configuration.
3. **Backend: `grafana/otel-lgtm`.** One container with the Collector, Tempo for traces, Loki for logs and Grafana as the UI. It is the only candidate that takes both agent traces and OCSF log records in one small container. GenAI-specific UIs mostly add value by showing prompts and responses, which metadata-only traces don't have. If one is wanted later, the Collector can send traces to a second backend such as Arize Phoenix without other changes.
4. **Agent spans are self-reported.** The relay sets only the resource attributes (`openshell.sandbox.id`); everything inside a span comes from the agent, so a compromised agent can forge them. For auditing, only OpenShell's own signals count, the OCSF events in particular, because they come from the supervisor on the Mac. Error attributes such as `exception.message` can carry content, so the extension doesn't record them.
5. **A minimal Pi extension in this repo**, not a community one. It uses only the official `@opentelemetry/*` packages and the protobuf exporter, and emits GenAI spans (`invoke_agent` → `chat` → `execute_tool`) from Pi's extension events. It has no code that could record content. It is installed in the image with locked dependencies, so they are fixed and reviewed when the image is built, not fetched inside the VM.

### Rejected alternatives

| Alternative | Why not |
|---|---|
| Langfuse | Several containers (incl. Postgres, ClickHouse, Redis), no OTLP logs endpoint for OCSF events, product telemetry on by default. |
| Arize Phoenix | No logs (OCSF events), Elastic License 2.0. A good second backend for traces later. |
| SigNoz, OpenLIT, Uptrace | Several containers each, with ClickHouse. |
| MLflow | Traces only, and a history of severe advisories for unauthenticated servers. |
| Jaeger | Traces only, no logs. |
| Community Pi extension `pi-otel` | Compatible with the relay, but an old SDK and extra features. |

## Security

The backend is a new endpoint, so it is set up like one:
- **Loopback only:** Docker publishes the Collector's OTLP port and Grafana on `127.0.0.1`, nothing else. No other port of the container is published.
- **No path from the VMs:** `policy.yaml` gets no rule for the Collector. Agents reach it only through the relay, which limits request size and rate.
- **Token:** the Collector's OTLP receiver requires a bearer token. OpenShell reads it from a `headers_file` with mode `0600`, so it never appears in `gateway.toml` or in a sandbox. This keeps other programs and containers on the Mac from writing to it.
- **No TLS on loopback**, for simplicity. If the Collector ever leaves the Mac, TLS becomes required.
- **Grafana:** anonymous access off and the default `admin`/`admin` login changed; usage reporting and update checks off. `otel-lgtm` is meant for development and testing, which fits a single-user Mac.
- **Collector processors:** a memory limit, the deletion of content attributes, and a maximum request size.
- **Images:** pinned by digest, like the base image.
- **Retention:** short, for example 7 days.
- **A new channel from the VMs to the Mac:** under the README's security model, the relay and Grafana count as Mac-side programs that process content from the VM: span names and attributes are strings the VM controls. Grafana stays on loopback and loads nothing remote for them.

## Consequences

- One more container to run and update on the Mac.
- `gateway.toml` gets OTLP settings, and the gateway restarts once to apply them. Sandboxes pick up the change at their next restart.
- The image gets the extension and its OTel dependencies.
- Each sandbox's traces carry its sandbox ID. With one sandbox per agent (ADR 0001's target), that is also the agent's identity.
- The GenAI conventions may change names before they are stable. The extension is small, so following them stays cheap.

## Step 1: OpenShell signals, without Pi changes

1. Start `otel-lgtm` with a Collector configuration as described under Security. If its built-in Collector lacks the token check (`bearertokenauth`) or the attribute processors, run the official `otelcol-contrib` image in front of it instead.
2. In `gateway.toml`: OTLP export to the Collector, with OCSF export and the agent relay enabled. Restart the gateway.
3. Check:
   - Does a denied connection from a sandbox (the `example.com` check in `docs/security.md`) appear in Loki?
   - Do OpenShell's spans appear in Tempo?
   - Does `printenv OTEL_EXPORTER_OTLP_ENDPOINT` in `pi-sandbox shell` show the relay?
   - Are requests without the token rejected?
   - Does anything in the VM reach the Collector other than through the relay?

## Step 2: the Pi extension

1. Write the extension in this repo, with tests, and install it in `Dockerfile.pi` from a lockfile.
2. Load it from Pi's config folder, next to the extensions Orca writes there (ADR 0001, Consequences, "Orca inside the VM").
3. Check: one trace per prompt, with model and tool spans, token counts and the sandbox ID, and no content attributes.

## Not in scope

- Metrics such as cost per agent. The relay drops metrics; token counts on spans cover the first need.
- Orca's own telemetry.
