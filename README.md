# OpenRouter Clone

Interview workspace for building an OpenRouter clone and exploring the OpenAI and Anthropic APIs.

## Setup

Run these commands from the repository root:

```sh
mise install
mise exec -- bun install --frozen-lockfile
```

`mise.toml` pins the versions of Bun, Node.js, TypeScript, Python, and hk. Its postinstall hook runs `hk install --mise` to enable Git hooks. Bun manages dependencies with the committed `bun.lock`; TypeScript comes from mise.

In PowerShell, use `mise.exe` for commands with `exec --` so the activated mise wrapper preserves arguments:

```powershell
mise.exe exec -- bun install --frozen-lockfile
mise.exe exec -- bun run dev
```

Copy `.env.example` to `.env` and fill in the provider keys when needed. Local `.env` files are ignored by Git. Bun loads `.env` during development.

## Development

Start implementing in `src/index.ts`:

```sh
bun run dev
bun run check
bun run build
bun run start
```

`dev` runs the entry point with Bun and restarts on changes. `check` type-checks without emitting files. `build` compiles to `dist/`, and `start` runs the compiled entry point with Node.js. Run `build` before `start`. To load local provider keys with Node.js, use `mise exec -- node --env-file=.env dist/index.js`.

`tsconfig.base.json` enables strict checking, unchecked indexed access checks, ES2023, and NodeNext modules. `tsconfig.json` defines this project's source and output directories. Use `.js` extensions for relative imports so compiled modules run in Node.js.

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
