# Tool Examples

All commands use `$CLI` as shorthand for `bun /path/to/jbctl/src/cli.ts`.

## Code Analysis

```bash
# Check file for errors
$CLI call get_file_problems -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/main.ts"}' --output json

# Symbol info at cursor position
$CLI call get_symbol_info -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/app.ts","line":10,"column":5}' --output json

# Build and check for compilation errors
$CLI call build_project -p <PROJECT> -e <ENDPOINT> --output json
```

## Search

```bash
# Text search (faster than grep, uses IDE indexes)
$CLI call search_text -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"TODO","paths":["src/**"]}' --output json

# Regex search
$CLI call search_regex -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"function\\s+\\w+","paths":["**/*.ts"]}' --output json

# Symbol search (classes, methods, fields)
$CLI call search_symbol -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"UserService"}' --output json

# Find files by name keyword (fastest, uses indexes)
$CLI call find_files_by_name_keyword -p <PROJECT> -e <ENDPOINT> \
  --json '{"keyword":"config"}' --output json

# Find files by glob
$CLI call find_files_by_glob -p <PROJECT> -e <ENDPOINT> \
  --json '{"pattern":"**/*.test.ts"}' --output json
```

## File Operations

```bash
# Read file with line range
$CLI call read_file -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/app.ts","start_line":1,"max_lines":50}' --output json

# Directory tree
$CLI call list_directory_tree -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"."}' --output json

# Replace text in file
$CLI call replace_text_in_file -p <PROJECT> -e <ENDPOINT> \
  --json '{"pathInProject":"src/app.ts","oldTextOrPatte":"old","newText":"new"}' --output json

# Rename symbol (project-wide, updates all references)
$CLI call rename_refactoring -p <PROJECT> -e <ENDPOINT> \
  --json '{"pathInProject":"src/app.ts","symbolName":"oldName","newName":"newName"}' --output json
```

## Project Info

```bash
$CLI call get_project_modules -p <PROJECT> -e <ENDPOINT> --output json
$CLI call get_project_dependencies -p <PROJECT> -e <ENDPOINT> --output json
$CLI call get_run_configurations -p <PROJECT> -e <ENDPOINT> --output json
```

## Terminal & Execution

```bash
# Run shell command in IDE terminal
$CLI call execute_terminal_command -p <PROJECT> -e <ENDPOINT> \
  --json '{"command":"ls -la"}' --output json

# Run a saved run configuration
$CLI call execute_run_configuration -p <PROJECT> -e <ENDPOINT> \
  --json '{"configurationName":"Run Tests"}' --output json
```

## Database

See [database.md](database.md) for the complete workflow including direct JDBC fallback.

```bash
# Quick: list connections (IDE 2026.1+ only)
$CLI call list_database_connections -p <PROJECT> -e <ENDPOINT> --output json

# Quick: run SQL query
$CLI call execute_sql_query -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"H2","query":"SELECT * FROM users LIMIT 10"}' --output json
```

## VCS

```bash
$CLI call get_repositories -p <PROJECT> -e <ENDPOINT> --output json
```
