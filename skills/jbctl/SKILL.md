---
name: jbctl
description: |
  Connects to JetBrains IDE (WebStorm, IntelliJ IDEA, GoLand, PyCharm) via MCP
  protocol and exposes 41+ built-in tools as CLI commands. Handles code analysis,
  project-aware search, refactoring, file operations, database queries, and terminal
  execution. Use when the user needs IDE inspections, symbol lookup, rename refactoring,
  database access, or any operation that benefits from IDE-level project understanding.
compatibility: Requires Bun (preferred) or Node.js. Target IDE must have MCP Server plugin enabled.
metadata:
  author: OrdinarySF
  version: "0.2.0"
---

# jbctl — JetBrains IDE Control

## Hard rules

- MUST run `jbctl doctor` first on every new session to verify connection and tool count.
- MUST run `jbctl inspect <tool>` before calling any tool for the first time — schema changes across IDE versions.
- NEVER include `projectPath` in `--json` — it is auto-injected from `--project`.
- NEVER guess parameter names or values. If `inspect` output is ambiguous, ask the user for clarification.
- NEVER run destructive database operations (DROP, DELETE, TRUNCATE, ALTER) without explicit user confirmation first.
- When `discover` returns `braveMode: false`, warn the user: execution tools (terminal, file write, refactoring) will pop a confirmation dialog in the IDE that blocks until clicked.

## Installation

Run directly without installing:

```bash
bunx jbctl doctor
```

If `bunx` is unavailable, use `npx jbctl doctor`. To install globally: `bun i -g jbctl`.

## Core workflow

### 1. Verify connection (ALWAYS first)

```bash
jbctl doctor
```

Check the tool count to determine capabilities:
- **40+ tools** → Full capabilities including database MCP tools
- **< 30 tools** → Older IDE version, database requires fallback (see [references/database.md](references/database.md))

### 2. Discover tools

```bash
jbctl tools --json
```

### 3. Inspect tool schema before calling

```bash
jbctl inspect <tool_name>
```

### 4. Call a tool

```bash
jbctl call <tool_name> --json '{"param":"value"}' --output json
```

Both `--project` and `--endpoint` are auto-detected — you almost never need to specify them manually. Use `jbctl discover` to list all running IDE instances if auto-detection fails.

## Database access

Two paths depending on IDE version. See [references/database.md](references/database.md).

- `doctor` shows 40+ tools → Use MCP DB tools directly (`execute_sql_query`)
- `doctor` shows < 30 tools → Use fallback: read `.idea/dataSources.xml` + direct JDBC

## Gotchas

- Different IDE products/versions expose different tool counts — always check via `doctor` first.
- `--output json` prefers `structuredContent` when available; not all tools return it.
- Auto-detection can fail when multiple IDEs have the same project open — use `jbctl discover` then pass `-e` explicitly.
- Some tool names differ between IDE products (e.g. WebStorm vs IntelliJ). Always use `jbctl tools` to get the actual list.
