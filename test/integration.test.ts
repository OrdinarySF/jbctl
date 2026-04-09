import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const MOCK_PORT = 18931;
const MOCK_ENDPOINT = `http://127.0.0.1:${MOCK_PORT}/stream`;
const PROJECT_PATH = "/test/project";
const CLI = ["bun", "src/cli.ts"];

// ─── Mock MCP Server ────────────────────────────────────

let httpServer: HttpServer;

function setupMcpServer(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "mock_read",
        description: "Read a file",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectPath: { type: "string" },
            path: { type: "string" },
          },
        },
      },
      {
        name: "mock_search",
        description: "Search in files",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectPath: { type: "string" },
            query: { type: "string" },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === "mock_read") {
      return {
        content: [{ type: "text", text: JSON.stringify({ path: args?.path, project: args?.projectPath }) }],
        structuredContent: { path: args?.path, project: args?.projectPath },
      };
    }
    return { content: [{ type: "text", text: `Called ${name}` }] };
  });
}

beforeAll(async () => {
  // Map of sessionId -> transport, to persist sessions across requests
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  await new Promise<void>((resolve) => {
    httpServer = createServer(async (req, res) => {
      // Check for existing session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.handleRequest(req, res);
        return;
      }

      // New session: create server + transport
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
      const mcpServer = new Server({ name: "MockIDE", version: "1.0.0" }, { capabilities: { tools: {} } });
      setupMcpServer(mcpServer);
      await mcpServer.connect(transport);

      // Store session after initialization
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      await transport.handleRequest(req, res);

      if (transport.sessionId) {
        sessions.set(transport.sessionId, transport);
      }
    });
    httpServer.listen(MOCK_PORT, () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ─── Helper ─────────────────────────────────────────────

async function run(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([...CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ─── Tests ──────────────────────────────────────────────

describe("integration: doctor", () => {
  test("reports connection status", async () => {
    const { stdout, exitCode } = await run("doctor", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("MockIDE");
    expect(stdout).toContain("connected");
  });

  test("doctor --json returns valid JSON", async () => {
    const { stdout, exitCode } = await run("doctor", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT, "--json");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.server.name).toBe("MockIDE");
    expect(parsed.status).toBe("connected");
  });
});

describe("integration: tools", () => {
  test("lists tools", async () => {
    const { stdout, exitCode } = await run("tools", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("mock_read");
    expect(stdout).toContain("mock_search");
  });

  test("tools --json returns array", async () => {
    const { stdout, exitCode } = await run("tools", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT, "--json");
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveLength(2);
  });
});

describe("integration: inspect", () => {
  test("shows tool schema", async () => {
    const { stdout, exitCode } = await run("inspect", "mock_read", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("mock_read");
    expect(stdout).toContain("Read a file");
  });

  test("unknown tool fails", async () => {
    const { stderr, exitCode } = await run("inspect", "nonexistent", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("nonexistent");
  });
});

describe("integration: call", () => {
  test("calls tool and injects projectPath", async () => {
    const { stdout, exitCode } = await run(
      "call", "mock_read", "-p", PROJECT_PATH, "-e", MOCK_ENDPOINT,
      "--json", '{"path":"src/main.ts"}', "--output", "json",
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.path).toBe("src/main.ts");
    expect(parsed.project).toBe(PROJECT_PATH);
  });
});

describe("integration: error cases", () => {
  test("missing --project exits 2", async () => {
    const { exitCode } = await run("doctor", "-e", MOCK_ENDPOINT);
    expect(exitCode).toBe(2);
  });

  test("missing endpoint exits 2", async () => {
    const { exitCode } = await run("doctor", "-p", "/tmp");
    expect(exitCode).toBe(2);
  });

  test("connection to dead endpoint exits 1", async () => {
    const { exitCode } = await run("doctor", "-p", "/tmp", "-e", "http://127.0.0.1:1/stream");
    expect(exitCode).toBe(1);
  });
});
