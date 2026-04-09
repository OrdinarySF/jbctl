---
name: jbctl
description: |
  Connects to JetBrains IDE (WebStorm, IntelliJ IDEA, GoLand, PyCharm) via MCP
  protocol and exposes 41+ built-in tools as CLI commands. Handles code analysis,
  project-aware search, refactoring, file operations, database queries, and terminal
  execution. Use when the user needs IDE inspections, symbol lookup, rename refactoring,
  database access, or any operation that benefits from IDE-level project understanding.
---

# jbctl — JetBrains IDE Control

## Hard rules

- MUST run `jbctl doctor` first on every new session to verify connection and tool count.
- MUST run `jbctl inspect <tool>` before calling any tool for the first time — schema changes across IDE versions.
- NEVER include `projectPath` in `--json` — it is auto-injected from `--project`.
- NEVER guess parameter names or values. If `inspect` output is ambiguous, use the AskUserQuestion tool to show the schema and ask for clarification.
- NEVER run destructive database operations (DROP, DELETE, TRUNCATE, ALTER) without using the AskUserQuestion tool to get explicit user confirmation first.
- NEVER call more than 3 tools in sequence without reporting results to the user.
- If a tool call fails, report the error immediately. Do NOT retry the same call more than once.
- When `discover` returns `braveMode: false` for the target IDE, warn the user: execution tools (terminal, file write, refactoring) will pop a confirmation dialog in the IDE that blocks until clicked.

## Installation

If `jbctl` is not installed, run it directly via `bunx` (preferred) or `npx`:

```bash
bunx jbctl doctor
# or: npx jbctl doctor
```

To install globally: `bun i -g jbctl` or `npm i -g jbctl`.

## Setup

Every command uses two parameters:

- `--project, -p` — Project root path. Defaults to current working directory.
- `--endpoint, -e` — MCP Server endpoint URL. Auto-detected when omitted if exactly one MCP-active IDE is running. Use `jbctl discover` to list all instances.

Alternatively, save the config JSON to a file and use `--config, -c <path>`.

## Core workflow

### 1. Verify connection (ALWAYS first)

```bash
jbctl doctor -p <PROJECT> -e <ENDPOINT>
```

Check the tool count — this determines available capabilities:
- **40+ tools** → Full capabilities including database MCP tools
- **< 30 tools** → Older IDE version, database requires fallback (see [references/database.md](references/database.md))

### 2. Discover tools

```bash
jbctl tools -p <PROJECT> -e <ENDPOINT> --json
```

### 3. Inspect tool schema before calling

```bash
jbctl inspect <tool_name> -p <PROJECT> -e <ENDPOINT>
```

### 4. Call a tool

```bash
jbctl call <tool_name> -p <PROJECT> -e <ENDPOINT> \
  --json '{"param":"value"}' --output json
```

## Auto-discovery

`--endpoint` is auto-detected when omitted. If exactly one MCP-active IDE is running, all commands work without `-e`:

```bash
jbctl doctor -p <PROJECT>
```

When multiple IDEs are running, the CLI prints the list and exits. Use `jbctl discover` to see all instances, then specify `-e` explicitly or filter with `--ide`:

```bash
jbctl discover                          # list all
jbctl discover --ide webstorm --json    # filter by IDE name
```

## Database access

Two paths depending on IDE version. See [references/database.md](references/database.md).

- `doctor` shows 40+ tools → Use MCP DB tools directly (`execute_sql_query`)
- `doctor` shows < 30 tools → Use fallback: read `.idea/dataSources.xml` + direct JDBC

## Notes

- Different IDE products/versions expose different tool counts.
- `--output json` prefers `structuredContent` when available.
