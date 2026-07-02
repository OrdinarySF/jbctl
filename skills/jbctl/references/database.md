# Database Access

## Contents

- Path A: MCP DB tools (IDE 2026.1+)
- Path B: Direct JDBC fallback (older IDEs or blocked MCP calls)
- H2 specific notes

## Path A: MCP DB tools

After `jbctl tools --json`, use the MCP database tools directly when the returned tool names include
database operations such as `list_database_connections`, `list_database_schemas`, and `execute_sql_query`.

### Workflow

```bash
# 1. List connections
jbctl call list_database_connections -p <PROJECT> -e <ENDPOINT> --output json

# 2. List schemas for a connection
jbctl call list_database_schemas -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>"}' --output json

# 3. List tables in a schema
jbctl call list_schema_objects -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","schemaName":"<schema>","objectKind":"table"}' --output json

# 4. Execute SQL
jbctl call execute_sql_query -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","query":"SELECT * FROM <table> LIMIT 10"}' --output json

# 5. Preview table data (alternative to raw SQL)
jbctl call preview_table_data -p <PROJECT> -e <ENDPOINT> \
  --json '{"connectionName":"<name>","schemaName":"<schema>","objectName":"<table>"}' --output json
```

## Path B: Direct JDBC fallback

Use this path when `jbctl tools --json` does not expose database operation tools such as
`list_database_connections` or `execute_sql_query`.
Also use this path when MCP DB calls return no result because an IDE confirmation dialog blocked execution;
first approve the dialog and retry MCP once, then fall back if it still does not return usable output.
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

For MySQL/PostgreSQL production-like projects, the IDE data source usually stores the password in JetBrains
secret storage, not in XML. Do **not** try to extract IDE secrets. Use credentials that are already available
to the project runtime, such as a checked local `.env`/deployment env file or shell environment variables.
This is not passwordless access; it reuses the same credentials the app/deploy already uses.

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

### MySQL with JShell

Use JShell when there is no `mysql` CLI but Java and a JDBC driver are available. Keep inspection read-only,
and never print secrets.

```bash
find ~/Library/Application\ Support/JetBrains/ -name "mysql-connector-j*.jar" 2>/dev/null | head -1
```

```bash
jshell --class-path "<mysql-connector-j.jar>" <<'EOF'
import java.nio.file.*;
import java.sql.*;
import java.util.*;

Map<String, String> env = new LinkedHashMap<>();
for (String raw : Files.readAllLines(Path.of("deploy/backend/.env"))) {
    String line = raw.trim();
    if (line.isEmpty() || line.startsWith("#") || !line.contains("=")) continue;
    int idx = line.indexOf('=');
    String key = line.substring(0, idx).trim();
    String val = line.substring(idx + 1).trim();
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length() - 1);
    }
    env.put(key, val);
}

String url = env.get("MYSQL_URL");
if (url == null || url.isBlank()) {
    url = "jdbc:mysql://" + env.get("MYSQL_HOSTNAME") + ":" +
        env.getOrDefault("MYSQL_PORT", "3306") + "/" + env.get("MYSQL_DATABASE") +
        "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai";
}

try (Connection conn = DriverManager.getConnection(url, env.get("MYSQL_USER"), env.get("MYSQL_PASSWORD"))) {
    conn.setReadOnly(true);
    try (Statement st = conn.createStatement();
         ResultSet rs = st.executeQuery("SELECT DATABASE() AS db_name")) {
        while (rs.next()) System.out.println("connected_db=" + rs.getString("db_name"));
    }
}
/exit
EOF
```

For destructive SQL, prefer MCP `execute_sql_query` after explicit user confirmation. If direct JDBC is the
only working path, use a transaction (`setAutoCommit(false)`), hard guard predicates, and a post-write
verification query.

## H2 specific notes

- **Case sensitivity**: H2 defaults to uppercase column names. Use double quotes for lowercase: `"name"` not `name`.
- **Long text truncation**: H2 Shell truncates output. Use `CAST(col AS VARCHAR(10000))` for JSON/text columns.
- **Password**: Often empty in dev. Use `-password ""`.
- **MODE=MySQL**: When set, some MySQL syntax (like `SHOW TABLES`) works.
