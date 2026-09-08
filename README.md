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

The Hono server listens on `127.0.0.1:3000` by default. Set `HOST` and `PORT` to override these values; `PORT=0` selects an available port reported in the startup log. Routes live in `src/app.ts`; `src/index.ts` owns configuration, startup, and shutdown.

| Endpoint             | Behavior                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz/live`  | Returns `200` with `{"status":"alive"}` while the process can respond.                                                     |
| `GET /healthz/ready` | Returns `200` with `{"status":"ready"}` after listening begins; returns `503` with `{"status":"not_ready"}` while unready. |

Both endpoints disable caching and perform no provider requests. Readiness reflects local server lifecycle, not provider credentials or availability. On `SIGINT` or `SIGTERM`, readiness becomes false, the listener closes, and active requests have up to five seconds to finish before a forced exit. New connections are refused once the listener closes.

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
