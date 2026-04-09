# jbctl

[English](README.md) | [中文](README.zh-CN.md)

Give your AI agent access to 41+ JetBrains IDE tools — code analysis, search, refactoring, database queries, and more.

jbctl is an [Agent Skill](https://agentskills.io) that bridges AI agents (Claude Code, etc.) to the built-in [MCP Server](https://modelcontextprotocol.io) in WebStorm, IntelliJ IDEA, GoLand, PyCharm, and other JetBrains IDEs (2025.2+). The agent learns a `discover → doctor → inspect → call` workflow and can autonomously use any IDE tool.

## What your agent can do

| Category | Count | Examples |
|----------|-------|---------|
| File Operations | 12 | `read_file`, `create_new_file`, `replace_text_in_file`, `list_directory_tree` |
| Search | 5 | `search_text`, `search_regex`, `search_symbol`, `find_files_by_name_keyword` |
| Code Analysis | 2 | `get_symbol_info`, `get_file_problems` |
| Refactoring | 2 | `rename_refactoring`, `reformat_file` |
| Project Info | 3 | `get_project_modules`, `get_project_dependencies`, `get_run_configurations` |
| Execution | 3 | `execute_terminal_command`, `execute_run_configuration`, `build_project` |
| Database | 10 | `execute_sql_query`, `list_database_connections`, `preview_table_data` |
| VCS & Inspection | 5 | `get_repositories`, `run_inspection_kts`, `generate_psi_tree` |

Tool availability varies by IDE product and version.

## Prerequisites

- A JetBrains IDE (2025.2+) with MCP Server enabled
- Enable: **Settings → Tools → MCP Server → ☑ Enable MCP Server**

## Setup

Tell your agent to install jbctl. For example, paste this prompt into Claude Code:

> Download the jbctl binary for this platform from GitHub Releases (https://github.com/anthropics/jbctl/releases/latest), place it in /usr/local/bin/jbctl, and make it executable. Then create a symlink for the skill: `mkdir -p .claude/skills && ln -s /usr/local/bin/jbctl/skills/jbctl .claude/skills/jbctl`.

<details>
<summary>Or install manually</summary>

#### Option A: npm / bun (recommended)

```bash
# bun
bun i -g jbctl

# or npm
npm i -g jbctl
```

Or run directly without installing:

```bash
bunx jbctl doctor
# or: npx jbctl doctor
```

#### Option B: Download binary

```bash
# macOS Apple Silicon
curl -fSL https://github.com/anthropics/jbctl/releases/latest/download/jbctl-darwin-arm64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl

# macOS Intel
curl -fSL https://github.com/anthropics/jbctl/releases/latest/download/jbctl-darwin-x64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl

# Linux x64
curl -fSL https://github.com/anthropics/jbctl/releases/latest/download/jbctl-linux-x64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl
```

#### Option C: Build from source (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/anthropics/jbctl.git
cd jbctl && bun install && bun scripts/build.ts
cp dist/jbctl-* /usr/local/bin/jbctl
```

#### Add the skill to your project

For Claude Code:

```bash
mkdir -p .claude/skills
ln -s /path/to/jbctl/skills/jbctl .claude/skills/jbctl
```

For other agents that support [Agent Skills](https://agentskills.io), point them at `skills/jbctl/SKILL.md`.

</details>

The skill teaches your agent the full workflow — connection check, tool discovery, schema inspection, and tool invocation — with guardrails for destructive operations and error handling.

## How it works

```
Your Agent (Claude Code, etc.)
      |
    jbctl CLI        ← skill teaches the agent how to call this
      |
  MCP Protocol       ← auto-detects transport (Streamable HTTP / SSE)
      |
JetBrains IDE        ← code analysis, indexing, type resolution, DB access
```

The IDE does the heavy lifting (indexing, inspections, type resolution). jbctl gives your agent a clean CLI interface to call it. The agent doesn't need to know about MCP transports, endpoint ports, or `projectPath` injection — jbctl handles all of that.

## Key features

- **Auto-discovery** — `jbctl discover` scans for running IDEs. When only one is active, `--endpoint` can be omitted entirely.
- **Schema-first** — The skill enforces `inspect` before `call`, so the agent never guesses parameter shapes.
- **Safe by default** — Destructive DB operations require user confirmation. Brave mode warnings when IDE dialogs will block.
- **Two transports** — Streamable HTTP (2026.1+) with automatic SSE fallback for older IDEs.

## Example sessions

### Reuse IDE database connections to query data

> "Look up the last 10 orders for user 42"

The agent discovers the database connection already configured in your IDE — no DSN, no credentials, no `.env`:

```bash
jbctl doctor -p /your/project
jbctl call list_database_connections -p /your/project --output json
# → [{"name":"prod-readonly", ...}, {"name":"local-dev", ...}]

jbctl call execute_sql_query -p /your/project \
  --json '{"connectionName":"local-dev","query":"SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10"}' \
  --output json
```

No driver install, no connection string — the IDE already has it.

### Rename a function with full cross-reference safety

> "Rename `processOrder` to `handleOrder` across the whole project"

The agent uses the IDE's refactoring engine, which understands types, imports, and string references — not just text replacement:

```bash
jbctl call search_symbol -p /your/project \
  --json '{"symbol":"processOrder"}' --output json
# → finds the definition and all usages

jbctl call rename_refactoring -p /your/project \
  --json '{"path":"src/services/order.ts","offset":142,"newName":"handleOrder"}' --output json
# → IDE renames the symbol everywhere: definitions, imports, type references, JSDoc
```

One command, zero missed references.

## Known limitations

- **Dynamic port** — The IDE assigns a random port on startup. `jbctl discover` handles this automatically.
- **Database tools** — Only available in IDE 2026.1+. The skill includes a JDBC fallback for older versions.
- **Single instance** — No multi-IDE routing. Use `--endpoint` or `--ide` when multiple IDEs are running.

## License

MIT
