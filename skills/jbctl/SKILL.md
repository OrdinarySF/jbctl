---
name: jbctl
description: |
  Control JetBrains IDEs via MCP protocol. Connects to WebStorm, IntelliJ IDEA,
  GoLand, PyCharm, etc. and exposes 41+ built-in IDE tools as CLI commands:
  code analysis, search, refactoring, file operations, database queries,
  terminal execution. Use when the user needs IDE capabilities like inspections,
  symbol lookup, project-aware search, or database access.
license: MIT
compatibility: Requires Bun runtime and a JetBrains IDE (2025.2+) with MCP Server enabled
metadata:
  author: wahr
  version: "0.1.0"
---

# jbctl — JetBrains IDE Control

`jbctl` connects to a running JetBrains IDE via MCP protocol, exposing 41+ built-in
tools as CLI commands. Supports Streamable HTTP and SSE transports.

## Prerequisites

1. A JetBrains IDE running with MCP Server enabled (Settings > Tools > MCP Server)
2. The MCP Server endpoint URL (shown at the top of the settings page)

## Required Parameters

Every command needs:
- `--project, -p <path>` — Project root path (required, all tools depend on it)
- `--endpoint, -e <url>` — MCP Server endpoint (e.g. `http://127.0.0.1:64342/stream`)
  - Or `--config, -c <path>` pointing to a JetBrains exported config JSON

If the user hasn't provided the endpoint, ask them to:
1. Open IDE Settings > Tools > MCP Server
2. Click "Copy HTTP Stream Config" or "Copy SSE Config"
3. Paste the JSON (format: `{"type":"streamable-http","url":"...","headers":{}}`)

## Workflow

### Step 1: Check connection

```bash
bun <jbctl-path>/src/cli.ts doctor -p <PROJECT> -e <ENDPOINT>
```

If this fails, the IDE is not running or the endpoint is wrong.

### Step 2: Discover available tools

```bash
bun <jbctl-path>/src/cli.ts tools -p <PROJECT> -e <ENDPOINT>
```

Add `--json` for machine-readable output.

### Step 3: Inspect a tool's schema

```bash
bun <jbctl-path>/src/cli.ts inspect <tool_name> -p <PROJECT> -e <ENDPOINT>
```

### Step 4: Call a tool

```bash
bun <jbctl-path>/src/cli.ts call <tool_name> -p <PROJECT> -e <ENDPOINT> --json '{"param":"value"}' --output json
```

`projectPath` is auto-injected from `--project`. No need to include it in the JSON payload.

## Notes

- All tools require `projectPath`, auto-injected from `--project`
- IDE port is dynamic and changes on restart. Always verify with `doctor` first
- `--output json` returns structured output (prefers `structuredContent` when available)
- Database tools require IDE 2026.1+ (unavailable in IDEA 2025.3)
- `brave mode` cannot be detected via MCP. Check IDE settings manually

See [references/examples.md](references/examples.md) for common tool usage patterns.
