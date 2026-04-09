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

## Setup

Every command uses two parameters:

- `--project, -p` — Project root path. Defaults to current working directory.
- `--endpoint, -e` — MCP Server endpoint URL (required unless auto-discovered)

**If the endpoint is unknown, auto-discover it** (see [Auto-discovery](#auto-discovery) below). Manual fallback: instruct the user to open IDE Settings > Tools > MCP Server > click "Copy HTTP Stream Config".

Alternatively, save the config JSON to a file and use `--config, -c <path>`.

## Core workflow

> If `--endpoint` is not known, run [Auto-discovery](#auto-discovery) first.

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

When `--endpoint` is not known, resolve it before proceeding:

```bash
jbctl discover --json
```

Parse the JSON array and filter to entries where `mcpEnabled` is `true`.

- **One active IDE** → use its `endpoint` value. Inform the user which IDE was detected.
- **Multiple active IDEs** → present the list with the AskUserQuestion tool and ask the user to pick one.
- **Zero active IDEs** → stop. Tell the user: "No MCP-active JetBrains IDE found. Verify the IDE is running and MCP Server is enabled in Settings > Tools > MCP Server."

To filter by IDE name: `jbctl discover --ide webstorm --json`

## Database access

Two paths depending on IDE version. See [references/database.md](references/database.md).

- `doctor` shows 40+ tools → Use MCP DB tools directly (`execute_sql_query`)
- `doctor` shows < 30 tools → Use fallback: read `.idea/dataSources.xml` + direct JDBC

## Notes

- Different IDE products/versions expose different tool counts.
- `--output json` prefers `structuredContent` when available.
