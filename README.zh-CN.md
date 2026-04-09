# jbctl

让你的 AI agent 使用 41+ JetBrains IDE 工具 — 代码分析、搜索、重构、数据库查询等。

jbctl 是一个 [Agent Skill](https://agentskills.io)，将 AI agent（Claude Code 等）桥接到 WebStorm、IntelliJ IDEA、GoLand、PyCharm 等 JetBrains IDE（2025.2+）内置的 [MCP Server](https://modelcontextprotocol.io)。Agent 会学习 `discover → doctor → inspect → call` 工作流，自主使用任何 IDE 工具。

## Agent 能做什么

| 类别 | 数量 | 示例 |
|------|------|------|
| 文件操作 | 12 | `read_file`, `create_new_file`, `replace_text_in_file`, `list_directory_tree` |
| 搜索 | 5 | `search_text`, `search_regex`, `search_symbol`, `find_files_by_name_keyword` |
| 代码分析 | 2 | `get_symbol_info`, `get_file_problems` |
| 重构 | 2 | `rename_refactoring`, `reformat_file` |
| 项目信息 | 3 | `get_project_modules`, `get_project_dependencies`, `get_run_configurations` |
| 执行 | 3 | `execute_terminal_command`, `execute_run_configuration`, `build_project` |
| 数据库 | 10 | `execute_sql_query`, `list_database_connections`, `preview_table_data` |
| VCS & 检查 | 5 | `get_repositories`, `run_inspection_kts`, `generate_psi_tree` |

可用工具因 IDE 产品和版本而异。

## 前置条件

- JetBrains IDE（2025.2+）并启用 MCP Server
- 启用方式：**Settings → Tools → MCP Server → ☑ Enable MCP Server**

## 安装

让你的 agent 来安装 jbctl。例如，将以下 prompt 粘贴到 Claude Code 中：

> 从 GitHub Releases (https://github.com/anthropics/jbctl/releases/latest) 下载适合当前平台的 jbctl 二进制文件，放到 /usr/local/bin/jbctl 并赋予可执行权限。然后为 skill 创建符号链接：`mkdir -p .claude/skills && ln -s /usr/local/bin/jbctl/skills/jbctl .claude/skills/jbctl`。

<details>
<summary>或者手动安装</summary>

#### 方式 A：npm / bun（推荐）

```bash
# bun
bun i -g jbctl

# 或 npm
npm i -g jbctl
```

或直接运行，无需安装：

```bash
bunx jbctl doctor
# 或: npx jbctl doctor
```

#### 方式 B：下载二进制文件

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

#### 方式 C：从源码构建（需要 [Bun](https://bun.sh)）

```bash
git clone https://github.com/anthropics/jbctl.git
cd jbctl && bun install && bun scripts/build.ts
cp dist/jbctl-* /usr/local/bin/jbctl
```

#### 将 skill 添加到项目

Claude Code：

```bash
mkdir -p .claude/skills
ln -s /path/to/jbctl/skills/jbctl .claude/skills/jbctl
```

其他支持 [Agent Skills](https://agentskills.io) 的 agent，指向 `skills/jbctl/SKILL.md` 即可。

</details>

Skill 会教会你的 agent 完整的工作流 — 连接检查、工具发现、schema 检查、工具调用 — 并内置了破坏性操作的安全防护和错误处理。

## 工作原理

```
你的 Agent（Claude Code 等）
      |
    jbctl CLI        ← skill 教 agent 如何调用
      |
  MCP Protocol       ← 自动检测传输方式（Streamable HTTP / SSE）
      |
JetBrains IDE        ← 代码分析、索引、类型解析、数据库访问
```

IDE 负责重活（索引、检查、类型解析）。jbctl 为 agent 提供干净的 CLI 接口来调用它。Agent 不需要了解 MCP 传输协议、端口或 `projectPath` 注入 — jbctl 全部搞定。

## 核心特性

- **自动发现** — `jbctl discover` 扫描运行中的 IDE。只有一个 IDE 时，`--endpoint` 可以完全省略。
- **Schema 优先** — Skill 强制在 `call` 之前执行 `inspect`，agent 绝不会猜测参数。
- **默认安全** — 破坏性数据库操作需要用户确认。IDE 弹窗阻塞时会发出 brave mode 警告。
- **双传输** — Streamable HTTP（2026.1+）自动回退到 SSE 兼容旧版 IDE。

## 使用示例

### 复用 IDE 数据库连接查询数据

> "查一下用户 42 最近的 10 条订单"

Agent 会发现 IDE 中已配置好的数据库连接 — 不需要 DSN、不需要密码、不需要 `.env`：

```bash
jbctl doctor -p /your/project
jbctl call list_database_connections -p /your/project --output json
# → [{"name":"prod-readonly", ...}, {"name":"local-dev", ...}]

jbctl call execute_sql_query -p /your/project \
  --json '{"connectionName":"local-dev","query":"SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 10"}' \
  --output json
```

不用装驱动，不用配连接串 — IDE 里已经有了。

### 全项目安全重命名函数

> "把 `processOrder` 重命名为 `handleOrder`"

Agent 使用 IDE 的重构引擎，理解类型、import 和字符串引用 — 不是简单的文本替换：

```bash
jbctl call search_symbol -p /your/project \
  --json '{"symbol":"processOrder"}' --output json
# → 找到定义和所有引用

jbctl call rename_refactoring -p /your/project \
  --json '{"path":"src/services/order.ts","offset":142,"newName":"handleOrder"}' --output json
# → IDE 全局重命名：定义、import、类型引用、JSDoc
```

一条命令，零遗漏。

## 已知限制

- **动态端口** — IDE 每次启动分配随机端口。`jbctl discover` 自动处理。
- **数据库工具** — 仅 IDE 2026.1+ 可用。Skill 包含旧版本的 JDBC 回退方案。
- **单实例** — 暂不支持多 IDE 路由。多个 IDE 运行时，使用 `--endpoint` 或 `--ide` 指定目标。

## License

MIT
