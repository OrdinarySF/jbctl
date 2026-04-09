# jbctl

CLI bridge for JetBrains IDE MCP Server. Talk to your IDE from the terminal.

Connects to WebStorm, IntelliJ IDEA, GoLand, PyCharm, etc. via the [Model Context Protocol](https://modelcontextprotocol.io), exposing 41+ built-in IDE tools as stable CLI commands. Built for AI agents, scriptable workflows, and humans who prefer the terminal.

## Why

JetBrains IDEs (2025.2+) ship with a built-in MCP Server that exposes code analysis, search, refactoring, database access, and more. But MCP is a dynamic protocol, not a CLI. Different tools have different parameter shapes, two transport modes need abstraction, and every tool requires a `projectPath` context.

jbctl sits between the MCP Server and your scripts/agents:

```
JetBrains IDE (MCP Server)
  /stream  (Streamable HTTP)
  /sse     (SSE fallback)
        |
  @modelcontextprotocol/sdk
        |
      jbctl
   ┌───┴───┐
   │ Tool  │  projectPath injection, schema lookup
   │ CLI   │  arg parsing, output formatting, error handling
   └───────┘
        |
  Agent / Script / You
```

The IDE handles the hard parts (indexing, inspections, type resolution). jbctl gives you a clean way to call it.

## Setup

```bash
bun install
```

Requires:
- [Bun](https://bun.sh) runtime
- A JetBrains IDE (2025.2+) with MCP Server enabled

Enable MCP Server: IDE Settings > Tools > MCP Server > check "Enable MCP Server".

## Quick Start

```bash
# 1. Get your endpoint from IDE Settings > Tools > MCP Server
#    Or click "Copy HTTP Stream Config" and save to a file

# 2. Check connection
bun src/cli.ts doctor -p /your/project -e http://127.0.0.1:64342/stream

# 3. See what tools are available
bun src/cli.ts tools -p /your/project -e http://127.0.0.1:64342/stream

# 4. Inspect a tool's parameters
bun src/cli.ts inspect get_file_problems -p /your/project -e http://127.0.0.1:64342/stream

# 5. Call it
bun src/cli.ts call get_file_problems -p /your/project -e http://127.0.0.1:64342/stream \
  --json '{"path":"src/main.ts"}' --output json
```

### Using a config file

Instead of `--endpoint`, export a config from the IDE and pass it with `--config`:

```bash
# In IDE: Settings > Tools > MCP Server > "Copy HTTP Stream Config"
# Save the JSON to a file, then:
bun src/cli.ts doctor -p /your/project --config ~/idea-mcp.json
```

Config format (auto-detected):
```json
{"type":"streamable-http","url":"http://127.0.0.1:64342/stream","headers":{}}
```

## Commands

### `doctor` -- Check connection

```bash
bun src/cli.ts doctor -p <PROJECT> -e <ENDPOINT>
```

```
Server:    WebStorm MCP Server 2026.1
Transport: auto
Endpoint:  http://127.0.0.1:64342/stream
Project:   /Users/you/project
Tools:     41
Status:    connected
```

### `tools` -- List available tools

```bash
bun src/cli.ts tools -p <PROJECT> -e <ENDPOINT>           # human-readable
bun src/cli.ts tools -p <PROJECT> -e <ENDPOINT> --json     # machine-readable
```

### `inspect <tool>` -- Show tool schema

```bash
bun src/cli.ts inspect search_text -p <PROJECT> -e <ENDPOINT>
```

Shows the tool's description and input parameters so you know what to pass.

### `call <tool>` -- Call a tool

```bash
bun src/cli.ts call search_text -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"TODO","paths":["src/**"]}' --output json
```

`projectPath` is auto-injected from `--project`. You don't need to include it in the JSON payload.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--project, -p` | Yes | Project root path. All 41 tools depend on it |
| `--endpoint, -e` | Yes* | MCP Server endpoint URL |
| `--config, -c` | Yes* | Path to JetBrains config JSON (alternative to --endpoint) |
| `--transport, -t` | No | `auto` (default), `http`, or `sse` |
| `--timeout` | No | Request timeout in ms (default: 30000) |
| `--verbose, -v` | No | Debug output |
| `--json` | No | JSON output for doctor/tools/inspect |
| `--output, -o` | No | Output format for call: `text` or `json` |

\* Either `--endpoint` or `--config` is required.

## Available Tools

41 tools across 8 categories (WebStorm 2026.1). Tool availability varies by IDE product and version.

| Category | Tools | Examples |
|----------|-------|---------|
| File Operations | 12 | `read_file`, `create_new_file`, `replace_text_in_file`, `list_directory_tree` |
| Search | 5 | `search_text`, `search_regex`, `search_symbol`, `find_files_by_name_keyword` |
| Code Analysis | 2 | `get_symbol_info`, `get_file_problems` |
| Refactoring | 2 | `rename_refactoring`, `reformat_file` |
| Project Info | 3 | `get_project_modules`, `get_project_dependencies`, `get_run_configurations` |
| Execution | 3 | `execute_terminal_command`, `execute_run_configuration`, `build_project` |
| Database | 10 | `execute_sql_query`, `list_database_connections`, `preview_table_data` |
| VCS & Inspection | 5 | `get_repositories`, `run_inspection_kts`, `generate_psi_tree` |

Run `jbctl tools` to see the full list for your IDE.

## Transport

jbctl supports two MCP transports:

- **Streamable HTTP** (`/stream`) -- Preferred. Uses the newer MCP 2025-06-18 protocol.
- **SSE** (`/sse`) -- Fallback. Uses the older HTTP+SSE protocol.

In `auto` mode (default), jbctl tries Streamable HTTP first and falls back to SSE. The IDE exposes both on the same dynamic port.

## Agent Skill

jbctl ships with an [Agent Skill](https://agentskills.io) at `skills/jbctl/SKILL.md`. To use it with Claude Code or other compatible agents:

```bash
# Symlink into your project's skill directory
mkdir -p .claude/skills
ln -s /path/to/jbctl/skills/jbctl .claude/skills/jbctl
```

The skill teaches agents the doctor > tools > inspect > call workflow.

## Project Structure

```
src/
  cli.ts              Entry point, arg parsing, command routing
  config.ts           CLI config, JetBrains config file reading
  transport.ts        Streamable HTTP / SSE with auto fallback
  adapter.ts          Tool Adapter: projectPath injection, tool calls
  errors.ts           CliError (CONNECTION_ERROR, TOOL_ERROR, TIMEOUT)
  commands/            doctor, tools, inspect, call
  formatters/          text and json output
test/                  41 tests (unit + mock MCP server integration)
skills/jbctl/          Agent Skill definition (agentskills.io format)
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) (startup < 10ms, built-in fetch/TypeScript)
- **MCP Client**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) v1.29.0
- **Transport/Session**: Handled entirely by the SDK. jbctl doesn't implement any protocol logic.

## Development

```bash
bun install          # install dependencies
bun test             # run tests (41 tests, ~800ms)
bun src/cli.ts       # show help
```

Tests include a mock MCP server (using the SDK's `StreamableHTTPServerTransport` over `node:http`), so you can run the full test suite without a running IDE.

## Known Limitations

- **Dynamic port**: The IDE assigns a random port on startup. You need to get it from IDE Settings or Copy Config each time. Auto-discovery is planned for a future version.
- **Database tools**: Only available in IDE 2026.1+. IDEA 2025.3 doesn't load the database MCP module.
- **Brave mode**: Whether the IDE requires confirmation for terminal commands can't be detected via MCP. Check IDE settings manually.
- **Single instance**: No multi-IDE routing yet. If you have multiple IDEs running, pass the correct endpoint for each.

## License

MIT
