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

# Git Guidelines

- Commit directly to `master` by default for this personal research repository.
- Do not create feature branches or pull requests unless explicitly requested.
