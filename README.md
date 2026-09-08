# OpenRouter Clone

Interview workspace for building an OpenRouter clone and exploring the OpenAI and Anthropic APIs.

## Setup

Run these commands from the repository root:

```sh
mise install
mise exec -- bun install --frozen-lockfile
```

`mise.toml` pins the versions of Bun, Node.js, TypeScript, Python, and hk. Its postinstall hook runs `hk install --mise` to enable Git hooks. Bun manages dependencies with the committed `bun.lock` and runs package scripts; Node.js executes all application code. TypeScript comes from mise.

In PowerShell, use `mise.exe` for commands with `exec --` so the activated mise wrapper preserves arguments:

```powershell
mise.exe exec -- bun install --frozen-lockfile
mise.exe exec -- bun run dev
```

Copy `.env.example` to `.env` and fill in the provider keys when needed. Local `.env` files are ignored by Git. Both `dev` and `start` explicitly load an optional `.env` file through Node.js.

## Development

Start the server:

```sh
bun run dev
bun run check
bun run build
bun run start
```

`dev` runs the TypeScript entry point under Node.js using `--import tsx` and restarts on changes with Node.js watch mode. The `tsx` loader handles TypeScript and resolves `.js` relative imports to TypeScript source during development; it does not type-check. `check` type-checks without emitting files. `build` compiles to `dist/`, and `start` runs the compiled entry point with Node.js. Run `build` before `start`.

`tsconfig.base.json` enables strict checking, unchecked indexed access checks, ES2023, and NodeNext modules. `tsconfig.json` defines this project's source and output directories. Use `.js` extensions for relative imports so compiled modules run in Node.js.

## Health checks

The Hono server listens on `127.0.0.1:3000` by default. Set `HOST` and `PORT` to override these values; `PORT=0` selects an available port reported in the startup log. Routes live in `src/app.ts`; `src/index.ts` initializes telemetry before loading `src/server.ts`, which owns configuration, serving, and shutdown.

| Endpoint             | Behavior                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz/live`  | Returns `200` with `{"status":"alive"}` while the process can respond.                                                     |
| `GET /healthz/ready` | Returns `200` with `{"status":"ready"}` after listening begins; returns `503` with `{"status":"not_ready"}` while unready. |

Both endpoints disable caching and perform no provider requests. Readiness reflects local server lifecycle, not provider credentials, provider availability, or telemetry export. On `SIGINT` or `SIGTERM`, readiness becomes false, the listener closes, and active requests have up to five seconds to finish. Remaining connections are then closed. Telemetry gets up to three additional seconds to flush before exit. New connections are refused once the listener closes. Exceeding the request drain deadline exits unsuccessfully; export failures alone do not.

## OpenTelemetry

Telemetry is opt-in: set `OTEL_SDK_DISABLED=false` to enable it. An unset variable or `true` leaves the SDK disabled, with no exports or collector dependency. Both development and compiled startup use the same bootstrap: `src/index.ts` imports telemetry, then dynamically imports the server. Node watch restarts create a fresh process and SDK. The focused Undici instrumentation uses Node diagnostics channels, so no OpenTelemetry ESM loader hook is needed alongside `tsx`.

`src/http-telemetry.ts` creates one inbound server span and records completed request counts (`http.server.request.count`, a custom counter) and durations (`http.server.request.duration`, seconds, standard HTTP histogram buckets). Completion includes response streaming and disconnects. Hono route templates label spans and metrics; unmatched requests use the HTTP method alone and have no `http.route`. Unknown methods become `_OTHER`. Both health paths, including requests with query strings, are excluded from tracing and metrics.

Undici adds client spans and `http.client.request.duration` for Node's built-in fetch, including the installed OpenAI and Anthropic SDKs using their default transport. Incoming W3C `traceparent` and `tracestate` are extracted, and outbound requests propagate child context. Baggage propagation is disabled. There is no HTTP auto-instrumentation or provider content instrumentation to duplicate these spans. Custom transports that bypass Node fetch/Undici need separate instrumentation.

Automatic telemetry records no authorization headers, credentials, query strings, request/response bodies, or prompt/completion content. Outbound URLs are reduced to their origin before span creation; raw paths, user agents, exception details, and free-form error status messages are suppressed by Undici hooks. Only environment resource detection runs, avoiding automatic process command-line capture. HTTP metric attributes are limited to method, route template, response status and scheme, with a 1,000-series limit per instrument; excess combinations use the SDK overflow series. Keep secrets out of manually configured resource attributes and custom spans too.

The pinned exporters use **OTLP/HTTP JSON**. Other protocols and exporter types are rejected when enabled. Supported configuration includes:

| Variable                                                                    | Behavior                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`                                                         | Explicit `false` enables telemetry; disabled otherwise.                                                                                                                                                                |
| `OTEL_SERVICE_NAME`                                                         | Defaults to `openrouter-clone`.                                                                                                                                                                                        |
| `OTEL_RESOURCE_ATTRIBUTES`                                                  | Optional resource attributes, such as `deployment.environment.name=local`.                                                                                                                                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                               | Base URL; defaults to `http://localhost:4318`. Exporters append `/v1/traces` and `/v1/metrics`.                                                                                                                        |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Optional complete signal URLs, including `/v1/traces` or `/v1/metrics`.                                                                                                                                                |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                                               | `http/json` only; this is also the default. Signal-specific protocol variables have the same restriction.                                                                                                              |
| `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_TIMEOUT`                  | Standard exporter headers and per-export timeout in milliseconds; signal-specific variants are supported. Export headers are not span attributes. The example timeout is 3,000 ms; the exporters default to 10,000 ms. |
| `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`                             | `otlp` (default) or `none` to disable an individual signal.                                                                                                                                                            |
| `OTEL_METRIC_EXPORT_INTERVAL`, `OTEL_METRIC_EXPORT_TIMEOUT`                 | Milliseconds; default 60,000 and 3,000 respectively. Timeout is capped at the interval.                                                                                                                                |
| `OTEL_BSP_SCHEDULE_DELAY`, `OTEL_BSP_EXPORT_TIMEOUT`                        | Standard trace batching timing in milliseconds.                                                                                                                                                                        |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`                            | Standard SDK sampling configuration; defaults to parent-based always-on sampling. Metrics are independent of trace sampling.                                                                                           |

Logs export and `OTEL_PROPAGATORS` selection are intentionally not enabled: this foundation always uses W3C trace context. Export runs asynchronously; an unavailable collector does not prevent startup, change readiness, or fail application requests. Shutdown is bounded even if a collector accepts a connection and never responds. Queued telemetry can be lost when the deadline expires or the process is forcibly terminated. The provider verification script remains separate and does not initialize this SDK.

### Inspect locally in PowerShell

Run from the repository root. Download and run the official Windows AMD64 collector in one terminal; Docker and hosted accounts are unnecessary:

```powershell
$collectorDir = Join-Path $env:TEMP "openrouter-otelcol-0.160.0"
New-Item -ItemType Directory -Force $collectorDir | Out-Null
Invoke-WebRequest "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.160.0/otelcol_0.160.0_windows_amd64.tar.gz" -OutFile "$collectorDir/collector.tar.gz"
tar -xzf "$collectorDir/collector.tar.gz" -C $collectorDir
& "$collectorDir/otelcol.exe" validate --config=otel-collector.yaml
& "$collectorDir/otelcol.exe" --config=otel-collector.yaml
```

The minimal `otel-collector.yaml` listens only on loopback port 4318 and prints received traces and metrics through its detailed debug exporter. In a second terminal:

```powershell
$env:OTEL_SDK_DISABLED = "false"
$env:OTEL_SERVICE_NAME = "openrouter-clone"
$env:OTEL_EXPORTER_OTLP_PROTOCOL = "http/json"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318"
$env:OTEL_EXPORTER_OTLP_TIMEOUT = "3000"
$env:OTEL_METRIC_EXPORT_INTERVAL = "5000"
mise.exe exec -- bun run dev
```

In a third terminal, send a non-health request. The starter intentionally returns 404; it still produces telemetry without using any provider tokens:

```powershell
curl.exe -i -H "traceparent: 00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" http://127.0.0.1:3000/telemetry-demo
pwsh -NoProfile -File scripts/check-health.ps1
```

Within about five seconds, the collector prints a `GET` server span with trace ID `0123456789abcdef0123456789abcdef`, parent span ID `0123456789abcdef`, and status code 404. Look for `http.server.request.count` and `http.server.request.duration`; health calls do not increase them. Client spans appear once application code calls fetch or a provider SDK inside a request; the starter has no such route. Ctrl+C drains requests and flushes telemetry. To try compiled execution in the second terminal:

```powershell
mise.exe exec -- bun run build
mise.exe exec -- bun run start
```

To return to ordinary startup, set `$env:OTEL_SDK_DISABLED = "true"` or leave the example's disabled setting in `.env` and remove the shell override. Shell environment variables take precedence over `.env`.

### Future custom spans

Wrap future routing work with the API inside the active request context. Use a stable name, end the span in `finally`, and record only safe, bounded attributes. This example illustrates the wrapper; routing is not implemented:

```typescript
import { SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("openrouter-clone.routing");

await tracer.startActiveSpan("router.select", async (span) => {
  try {
    return await selectProvider();
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
});
```

See the official [JavaScript instrumentation guidance](https://opentelemetry.io/docs/languages/js/libraries/), [HTTP span conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/), [HTTP metric conventions](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/), and [exporter configuration](https://opentelemetry.io/docs/languages/js/exporters/).

## PowerShell scripts

Use PowerShell 7 (`pwsh`). With the server running, check both health endpoints:

```powershell
pwsh -NoProfile -File scripts/check-health.ps1
pwsh -NoProfile -File scripts/check-health.ps1 -BaseUrl http://127.0.0.1:4000
```

Verify provider credentials, model access, and generation independently of the server:

```powershell
pwsh -NoProfile -File scripts/verify-providers.ps1
pwsh -NoProfile -File scripts/verify-providers.ps1 -Provider openai
pwsh -NoProfile -File scripts/verify-providers.ps1 -Provider anthropic
```

Verification loads the repository's optional `.env` under Node.js and makes one small billable request per selected provider using the official SDK. Retries are disabled and each request has a 15-second timeout. It reports the served model, response, token usage, and request ID without printing credentials or raw SDK errors. Missing credentials, failed requests, or empty responses produce a nonzero exit code.

The defaults are `gpt-5-nano-2025-08-07` (128 completion tokens maximum, including reasoning) and `claude-haiku-4-5-20251001` (16 output tokens maximum). Selected on September 8, 2026 using published pricing and the accounts' available models: [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), and [Claude model retirements](https://platform.claude.com/docs/en/about-claude/model-deprecations). Recheck availability and pricing before future use.

The chat request script is ready for the interview implementation. `/v1/chat/completions` is not implemented in this starter and currently returns `404`:

```powershell
pwsh -NoProfile -File scripts/send-chat.ps1 -Model openai/gpt-5-nano
pwsh -NoProfile -File scripts/send-chat.ps1 -Model anthropic/claude-haiku-4-5-20251001 -Stream
pwsh -NoProfile -File scripts/send-chat.ps1 -Model invalid-model -Message "Reply with OK."
```

`send-chat.ps1` serializes JSON and pipes it to `curl.exe`, preserving quotes and multiline messages. It prints the response without buffering, defaults to a 30-second timeout, and exits nonzero on HTTP or connection failures. Use Ctrl+C to cancel a streaming request. Model names and the `max_tokens` parameter will need to match the contract implemented during the interview.

## Formatting and linting

```sh
bun run lint
bun run lint:fix
bun run fmt
bun run fmt:check
mise exec -- hk check --all
mise exec -- hk fix --all
```

Oxlint and Oxfmt are pinned in `package.json` and configured in `.oxlintrc.json` and `.oxfmtrc.json`. Linting includes the vendored [anti-slop rules](tools/oxlint/anti-slop/README.md) and the Effect `no-service-constructor-imports` rule. Lint scripts reject warnings and errors. Vendored rules are preserved unchanged and excluded from linting and formatting.

The hk pre-commit hook formats supported files and applies safe lint fixes, stashing unstaged changes and staging fixes automatically. The commit-msg hook enforces Conventional Commits, such as `feat: add a provider` or `fix: handle an empty response`. Run `bun run check` separately for type checking.
