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

Paste this into Claude Code to install both the CLI and the skill:

> Install jbctl globally (`bun i -g jbctl`) and add the skill (`bunx skills add https://github.com/OrdinarySF/jbctl.git`).

<details>
<summary>Or install manually</summary>

#### 1. Install the CLI

```bash
bun i -g jbctl
```

Or use npm: `npm i -g jbctl`. You can also run without installing via `bunx jbctl`.

#### 2. Install the Skill

```bash
bunx skills add https://github.com/OrdinarySF/jbctl.git
```

This adds the skill to `.claude/skills/jbctl` in your project.

#### Alternative: Download binary

```bash
# macOS Apple Silicon
curl -fSL https://github.com/OrdinarySF/jbctl/releases/latest/download/jbctl-darwin-arm64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl

# macOS Intel
curl -fSL https://github.com/OrdinarySF/jbctl/releases/latest/download/jbctl-darwin-x64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl

# Linux x64
curl -fSL https://github.com/OrdinarySF/jbctl/releases/latest/download/jbctl-linux-x64 -o /usr/local/bin/jbctl
chmod +x /usr/local/bin/jbctl
```

#### Alternative: Build from source (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/OrdinarySF/jbctl.git
cd jbctl && bun install && bun scripts/build.ts
cp dist/jbctl-* /usr/local/bin/jbctl
```

#### Skill: Add manually

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

## Why jbctl instead of direct MCP?

JetBrains IDEs expose an MCP Server that agents can connect to directly. But direct MCP has friction in real-world setups:

| Scenario                    | Direct MCP                                                       | jbctl                                                                                      |
|-----------------------------|------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Multiple IDEs running       | Manual port config per IDE                                       | `jbctl discover` auto-resolves by matching your project path to the correct IDE instance   |
| Git worktree                | Broken — worktree path ≠ IDE project path, MCP config can't resolve | Works — pass `-p /path/to/ide/project` to route calls to the right IDE regardless of cwd |
| IDE restarts (port changes) | Reconfigure MCP endpoint every time                              | Auto-discovers the new port on each call                                                   |
| Agent learns new tools      | Agent must understand raw MCP protocol                           | Skill teaches a simple CLI workflow: `tools → inspect → call`                              |

In short: direct MCP works when you have one IDE, one project, no worktrees, and the port doesn't change. jbctl works everywhere else.

## Key features

- **Auto-discovery** — `jbctl discover` scans for running IDEs. Matches your project path against each IDE's opened projects to find the right instance — even with multiple IDEs running simultaneously.
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
- **Worktree detection** — Auto-discovery matches by project path. In a git worktree, pass `-p` pointing to the IDE's original project directory.

## License

MIT
