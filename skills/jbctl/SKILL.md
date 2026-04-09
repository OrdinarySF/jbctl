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

## Setup

Every command requires two parameters:

- `--project, -p` — Project root path (all IDE tools depend on it)
- `--endpoint, -e` — MCP Server endpoint URL

If the endpoint is unknown, ask the user to open IDE Settings > Tools > MCP Server
and click "Copy HTTP Stream Config". The JSON format is:

```json
{"type":"streamable-http","url":"http://127.0.0.1:<port>/stream","headers":{}}
```

Alternatively, save the JSON to a file and use `--config, -c <path>`.

## Core workflow

### 1. Verify connection

```bash
jbctl doctor -p <PROJECT> -e <ENDPOINT>
```

Check the tool count in the output:
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

`projectPath` is auto-injected from `--project`. Do not include it in `--json`.

## Database access

Two paths depending on IDE version. See [references/database.md](references/database.md).

- `doctor` shows 40+ tools → Use MCP DB tools directly (`execute_sql_query`)
- `doctor` shows < 30 tools → Use fallback: read `.idea/dataSources.xml` + direct JDBC

## Notes

- IDE port is dynamic. Always run `doctor` first to verify.
- Different IDE products/versions expose different tool counts.
- `--output json` prefers `structuredContent` when available.
