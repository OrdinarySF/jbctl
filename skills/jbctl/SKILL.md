---
name: jbctl
description: |
  Connects to JetBrains IDE (WebStorm, IntelliJ IDEA, GoLand, PyCharm) via MCP
  protocol and exposes 41+ built-in tools as CLI commands. Handles code analysis,
  project-aware search, refactoring, file operations, database queries, and terminal
  execution. Use when the user needs IDE inspections, symbol lookup, rename refactoring,
  database access, or any operation that benefits from IDE-level project understanding.
license: MIT
compatibility: Requires Bun runtime and a JetBrains IDE (2025.2+) with MCP Server enabled
metadata:
  author: wahr
  version: "0.1.0"
---

# jbctl — JetBrains IDE Control

## Setup

Requires two parameters for every command:

- `--project, -p` — Project root path (all IDE tools depend on it)
- `--endpoint, -e` — MCP Server endpoint URL

If the endpoint is unknown, ask the user to open IDE Settings > Tools > MCP Server
and click "Copy HTTP Stream Config". The JSON format is:

```json
{"type":"streamable-http","url":"http://127.0.0.1:<port>/stream","headers":{}}
```

Alternatively, save the JSON to a file and use `--config, -c <path>`.

## Core workflow

```bash
CLI="bun /path/to/jbctl/src/cli.ts"
```

### 1. Verify connection

```bash
$CLI doctor -p <PROJECT> -e <ENDPOINT>
```

Check the tool count in the output. This determines which capabilities are available:
- **40+ tools** → Full capabilities including database MCP tools
- **< 30 tools** → Older IDE version, database requires fallback (see [references/database.md](references/database.md))

### 2. Discover tools

```bash
$CLI tools -p <PROJECT> -e <ENDPOINT> --json
```

### 3. Inspect tool schema before calling

```bash
$CLI inspect <tool_name> -p <PROJECT> -e <ENDPOINT>
```

### 4. Call a tool

```bash
$CLI call <tool_name> -p <PROJECT> -e <ENDPOINT> \
  --json '{"param":"value"}' --output json
```

`projectPath` is auto-injected from `--project`. Do not include it in `--json`.

## Key tool categories

| Category | Tools | When to use |
|----------|-------|-------------|
| Code analysis | `get_file_problems`, `build_project`, `get_symbol_info` | Inspections, error checking, symbol docs |
| Search | `search_text`, `search_regex`, `search_symbol`, `find_files_by_name_keyword` | Project-wide search, faster than grep |
| File ops | `read_file`, `replace_text_in_file`, `list_directory_tree` | IDE-aware file operations |
| Refactoring | `rename_refactoring` | Project-wide rename with reference updates |
| Database | `list_database_connections`, `execute_sql_query` | Query project databases (IDE 2026.1+ only) |
| Terminal | `execute_terminal_command` | Run commands in IDE terminal |

For complete tool examples, see [references/examples.md](references/examples.md).

## Database access

Two paths depending on IDE version. See [references/database.md](references/database.md) for full details.

**Quick decision:**
- `doctor` shows 40+ tools → Use MCP DB tools directly (`execute_sql_query`)
- `doctor` shows < 30 tools → Use fallback: read `.idea/dataSources.xml` + direct JDBC

## Notes

- IDE port is dynamic. Always run `doctor` first to verify.
- Different IDE products/versions expose different tool counts.
- `--output json` prefers `structuredContent` when available.
- `brave mode` is not detectable via MCP.
