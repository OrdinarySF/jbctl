# jbctl Common Tool Examples

Replace `<PROJECT>` and `<ENDPOINT>` with actual values in all commands below.

## Code Analysis

**Analyze file for errors and warnings:**
```bash
bun src/cli.ts call get_file_problems -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/main.ts"}' --output json
```

**Get symbol info at position:**
```bash
bun src/cli.ts call get_symbol_info -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/app.ts","line":10,"column":5}' --output json
```

**Build project and check for errors:**
```bash
bun src/cli.ts call build_project -p <PROJECT> -e <ENDPOINT> --output json
```

## Search

**Text search across project:**
```bash
bun src/cli.ts call search_text -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"TODO","paths":["src/**"]}' --output json
```

**Regex search:**
```bash
bun src/cli.ts call search_regex -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"function\\s+\\w+","paths":["**/*.ts"]}' --output json
```

**Search symbols (classes, methods, fields):**
```bash
bun src/cli.ts call search_symbol -p <PROJECT> -e <ENDPOINT> \
  --json '{"q":"UserService"}' --output json
```

**Find files by name keyword:**
```bash
bun src/cli.ts call find_files_by_name_keyword -p <PROJECT> -e <ENDPOINT> \
  --json '{"keyword":"config"}' --output json
```

**Find files by glob pattern:**
```bash
bun src/cli.ts call find_files_by_glob -p <PROJECT> -e <ENDPOINT> \
  --json '{"pattern":"**/*.test.ts"}' --output json
```

## File Operations

**Read file with line numbers:**
```bash
bun src/cli.ts call read_file -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"src/app.ts","start_line":1,"max_lines":50}' --output json
```

**List directory tree:**
```bash
bun src/cli.ts call list_directory_tree -p <PROJECT> -e <ENDPOINT> \
  --json '{"path":"."}' --output json
```

**Replace text in file:**
```bash
bun src/cli.ts call replace_text_in_file -p <PROJECT> -e <ENDPOINT> \
  --json '{"pathInProject":"src/app.ts","oldTextOrPatte":"oldValue","newText":"newValue"}' --output json
```

**Rename symbol (project-wide refactoring):**
```bash
bun src/cli.ts call rename_refactoring -p <PROJECT> -e <ENDPOINT> \
  --json '{"pathInProject":"src/app.ts","symbolName":"oldName","newName":"newName"}' --output json
```

## Project Info

**List project modules:**
```bash
bun src/cli.ts call get_project_modules -p <PROJECT> -e <ENDPOINT> --output json
```

**List project dependencies:**
```bash
bun src/cli.ts call get_project_dependencies -p <PROJECT> -e <ENDPOINT> --output json
```

**Get run configurations:**
```bash
bun src/cli.ts call get_run_configurations -p <PROJECT> -e <ENDPOINT> --output json
```

## Terminal & Execution

**Execute terminal command:**
```bash
bun src/cli.ts call execute_terminal_command -p <PROJECT> -e <ENDPOINT> \
  --json '{"command":"ls -la"}' --output json
```

**Run a run configuration:**
```bash
bun src/cli.ts call execute_run_configuration -p <PROJECT> -e <ENDPOINT> \
  --json '{"configurationName":"Run Tests"}' --output json
```

## Database (requires IDE 2026.1+)

**List database connections:**
```bash
bun src/cli.ts call list_database_connections -p <PROJECT> -e <ENDPOINT> --output json
```

**List schemas:**
```bash
bun src/cli.ts call list_database_schemas -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"H2"}' --output json
```

**Execute SQL query:**
```bash
bun src/cli.ts call execute_sql_query -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"H2","query":"SELECT * FROM users LIMIT 10"}' --output json
```

**Preview table data:**
```bash
bun src/cli.ts call preview_table_data -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"H2","schemaName":"PUBLIC","objectName":"USERS"}' --output json
```

## VCS

**List repositories:**
```bash
bun src/cli.ts call get_repositories -p <PROJECT> -e <ENDPOINT> --output json
```
