# Project Purpose

This repository is an interview workspace for building an OpenRouter clone and exercising my understanding of the OpenAI and Anthropic APIs.

# Libraries and Runtime

- Use Hono with `@hono/node-server` for HTTP serving, Zod for boundary validation, and the official `openai` and `@anthropic-ai/sdk` clients for provider calls.
- Use Bun only for package management and script execution, and keep `bun.lock` updated. Tool versions are pinned through mise and `package.json`.
- Always execute application code under Node.js, including scripts launched by Bun. Development uses Node.js watch mode with the `tsx` loader; compiled output also runs under Node.js. Do not use Bun runtime APIs.
- Use `.js` extensions for relative imports in TypeScript source so compiled NodeNext modules resolve correctly.

# Architecture

- Keep HTTP handlers focused on validating requests, invoking routing logic, and returning responses.
- Keep model selection and fallback policy separate from provider-specific request and response translation.
- Keep SDK calls and provider-specific types inside provider adapters. Expose a small shared contract to routing logic.
- Parse external input with Zod at the boundary and pass validated values into application logic. Reject unsupported input explicitly.
- Make timeout, retry, and cancellation behavior explicit; account for SDK retries when implementing routing policy.
- Keep the implementation small and driven by the agreed interview scope. Add abstractions only when the implementation needs them.

# Observability

- Keep `src/index.ts` as the telemetry bootstrap, with a dynamic import of `src/server.ts` after initialization. Preserve this order for both `tsx` development and compiled NodeNext execution.
- Telemetry is opt-in through `OTEL_SDK_DISABLED=false`. Keep ordinary startup independent of collectors, Docker, and provider verification.
- Keep SDK/exporter configuration in `src/telemetry.ts` and inbound tracing/metrics in `src/http-telemetry.ts`. Handlers may use the OpenTelemetry API for custom spans, but must not configure exporters.
- Use the existing Hono middleware and focused Undici instrumentation. Do not add overlapping HTTP server or provider content instrumentation. The Undici hooks suppress URL details and exception messages; preserve that behavior when upgrading dependencies.
- Use stable span names and route templates. Keep metric attributes bounded and exclude both health endpoints. Never record credentials, headers, query strings, request/response bodies, prompts, completions, or raw exception details. Custom span attributes and resource configuration must follow the same rule.
- Keep a single shutdown owner: stop accepting requests, drain or close remaining connections, then flush telemetry within the existing deadline. Export failure must not affect readiness or request success.

# Verification

Run commands from the repository root. In PowerShell, use `mise.exe exec --` to preserve arguments:

```powershell
mise.exe exec -- bun run check
mise.exe exec -- bun run lint
mise.exe exec -- bun run fmt:check
mise.exe exec -- bun run build
```

- Use `mise.exe exec -- bun run dev` for development and `mise.exe exec -- bun run start` after building to verify the Node.js runtime.
- For documentation-only changes, run the formatting check. For application changes, run the checks above and exercise the affected behavior.
- For telemetry changes, verify exported data with the local `otel-collector.yaml` and fake upstreams, including parentage, health exclusions, disabled/unavailable export, and shutdown. Do not spend provider tokens. Remove temporary routes and checks afterward; do not add permanent tests unless requested.

# Git Guidelines

- Commit directly to `master` by default for this personal research repository.
- Do not create feature branches or pull requests unless explicitly requested.
