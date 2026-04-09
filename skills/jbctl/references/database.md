# Database Access

## Contents

- Path A: MCP DB tools (IDE 2026.1+)
- Path B: Direct JDBC fallback (older IDEs)
- H2 specific notes

## Path A: MCP DB tools (IDE 2026.1+)

When `doctor` shows 40+ tools, use the MCP database tools directly.

### Workflow

```bash
# 1. List connections
$CLI call list_database_connections -p <PROJECT> -e <ENDPOINT> --output json

# 2. List schemas for a connection
$CLI call list_database_schemas -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>"}' --output json

# 3. List tables in a schema
$CLI call list_schema_objects -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","schemaName":"<schema>","objectKind":"table"}' --output json

# 4. Execute SQL
$CLI call execute_sql_query -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","query":"SELECT * FROM <table> LIMIT 10"}' --output json

# 5. Preview table data (alternative to raw SQL)
$CLI call preview_table_data -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","schemaName":"<schema>","objectName":"<table>"}' --output json
```

## Path B: Direct JDBC fallback

When `doctor` shows < 30 tools, the DB MCP module is not loaded (common in IDEA 2025.3).
Connect directly using JDBC driver JARs cached by JetBrains.

### Step 1: Extract connection info

```bash
cat <PROJECT>/.idea/dataSources.xml
```

Look for: `jdbc-url`, `username`, `database-info`. Example:

```
jdbc-url="jdbc:h2:tcp://localhost:9092/mem:test;MODE=MySQL"
username="root"
```

### Step 2: Find driver JAR

```bash
# macOS
find ~/Library/Application\ Support/JetBrains/ -name "h2*.jar" 2>/dev/null | head -1

# Linux
find ~/.local/share/JetBrains/ -name "h2*.jar" 2>/dev/null | head -1
```

### Step 3: Query

```bash
java -cp "<h2.jar>" org.h2.tools.Shell \
  -url "<jdbc-url>" -user root -password "" \
  -sql "SHOW TABLES"
```

```bash
java -cp "<h2.jar>" org.h2.tools.Shell \
  -url "<jdbc-url>" -user root -password "" \
  -sql "SELECT * FROM <table> WHERE id = 1"
```

## H2 specific notes

- **Case sensitivity**: H2 defaults to uppercase column names. Use double quotes for lowercase: `"name"` not `name`.
- **Long text truncation**: H2 Shell truncates output. Use `CAST(col AS VARCHAR(10000))` for JSON/text columns.
- **Password**: Often empty in dev. Use `-password ""`.
- **MODE=MySQL**: When set, some MySQL syntax (like `SHOW TABLES`) works.
