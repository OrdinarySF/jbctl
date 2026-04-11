import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MOCK_PORT = 18931;
const MOCK_ENDPOINT = `http://127.0.0.1:${MOCK_PORT}/stream`;
const PROJECT_PATH = "/test/project";
const CLI = ["bun", "src/cli.ts"];

// ─── IDE Detection ─────────────────────────────────────

/** Probe JetBrains built-in ports to detect running IDEs */
async function detectRunningIdes(): Promise<number> {
	let count = 0;
	const probes = [];
	for (let port = 63342; port <= 63352; port++) {
		probes.push(
			fetch(`http://127.0.0.1:${port}/api/about`, {
				signal: AbortSignal.timeout(500),
			})
				.then((r) => r.ok)
				.catch(() => false),
		);
	}
	for (const alive of await Promise.all(probes)) {
		if (alive) count++;
	}
	return count;
}

let runningIdeCount: number;

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
				content: [
					{
						type: "text",
						text: JSON.stringify({
							path: args?.path,
							project: args?.projectPath,
						}),
					},
				],
				structuredContent: { path: args?.path, project: args?.projectPath },
			};
		}
		return { content: [{ type: "text", text: `Called ${name}` }] };
	});
}

beforeAll(async () => {
	runningIdeCount = await detectRunningIdes();

	// Map of sessionId -> transport, to persist sessions across requests
	const sessions = new Map<string, StreamableHTTPServerTransport>();

	await new Promise<void>((resolve) => {
		httpServer = createServer(async (req, res) => {
			// Check for existing session
			const sessionId = req.headers["mcp-session-id"] as string | undefined;
			if (sessionId && sessions.has(sessionId)) {
				await sessions.get(sessionId)?.handleRequest(req, res);
				return;
			}

			// New session: create server + transport
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => crypto.randomUUID(),
			});
			const mcpServer = new Server(
				{ name: "MockIDE", version: "1.0.0" },
				{ capabilities: { tools: {} } },
			);
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

async function run(
	...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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
		const { stdout, exitCode } = await run(
			"doctor",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("MockIDE");
		expect(stdout).toContain("connected");
	});

	test("doctor --json returns valid JSON", async () => {
		const { stdout, exitCode } = await run(
			"doctor",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
			"--json",
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.server.name).toBe("MockIDE");
		expect(parsed.status).toBe("connected");
	});
});

describe("integration: tools", () => {
	test("lists tools", async () => {
		const { stdout, exitCode } = await run(
			"tools",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("mock_read");
		expect(stdout).toContain("mock_search");
	});

	test("tools --json returns array", async () => {
		const { stdout, exitCode } = await run(
			"tools",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
			"--json",
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveLength(2);
	});
});

describe("integration: inspect", () => {
	test("shows tool schema", async () => {
		const { stdout, exitCode } = await run(
			"inspect",
			"mock_read",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("mock_read");
		expect(stdout).toContain("Read a file");
	});

	test("unknown tool fails", async () => {
		const { stderr, exitCode } = await run(
			"inspect",
			"nonexistent",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
		);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("nonexistent");
	});
});

describe("integration: call", () => {
	test("calls tool and injects projectPath", async () => {
		const { stdout, exitCode } = await run(
			"call",
			"mock_read",
			"-p",
			PROJECT_PATH,
			"-e",
			MOCK_ENDPOINT,
			"--json",
			'{"path":"src/main.ts"}',
			"--output",
			"json",
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.path).toBe("src/main.ts");
		expect(parsed.project).toBe(PROJECT_PATH);
	});
});

describe("integration: error cases", () => {
	test("missing --project defaults to cwd and succeeds", async () => {
		const { exitCode } = await run("doctor", "-e", MOCK_ENDPOINT);
		expect(exitCode).toBe(0);
	});

	test("connection to dead endpoint exits 1", async () => {
		const { exitCode } = await run(
			"doctor",
			"-p",
			"/tmp",
			"-e",
			"http://127.0.0.1:1/stream",
		);
		expect(exitCode).toBe(1);
	});
});

describe("integration: auto-discovery", () => {
	test("missing endpoint triggers auto-discovery", async () => {
		const { exitCode, stderr } = await run("doctor", "-p", "/tmp");
		if (runningIdeCount === 0) {
			// No IDE running — should fail with connection error
			expect(exitCode).toBe(1);
			expect(stderr).toContain("CONNECTION_ERROR");
		} else if (runningIdeCount === 1) {
			// Single IDE — auto-selects it regardless of project path
			expect(exitCode).toBe(0);
			expect(stderr).toContain("Auto-detected:");
		} else {
			// Multiple IDEs — /tmp won't match any project, should fail
			expect(exitCode).toBe(1);
			expect(stderr).toContain("Multiple MCP-active IDEs");
		}
	});

	test("auto-discovery with explicit project path", async () => {
		// Use cwd as project — more likely to match a running IDE
		const cwd = process.cwd();
		const { exitCode, stderr } = await run("doctor", "-p", cwd);
		if (runningIdeCount === 0) {
			expect(exitCode).toBe(1);
		} else {
			// With cwd as project, at least one IDE should match
			expect(exitCode).toBe(0);
			expect(stderr).toContain("Auto-detected:");
		}
	});
});

describe("integration: discover", () => {
	test("discover returns IDE list or connection error", async () => {
		const { stdout, stderr, exitCode } = await run("discover");
		if (runningIdeCount > 0) {
			expect(exitCode).toBe(0);
			expect(stdout).toContain("MCP");
		} else {
			expect(exitCode).toBe(1);
			expect(stderr).toContain("CONNECTION_ERROR");
		}
	});

	test("discover --json returns valid JSON array", async () => {
		const { stdout, exitCode } = await run("discover", "--json");
		if (runningIdeCount > 0) {
			expect(exitCode).toBe(0);
			const parsed = JSON.parse(stdout);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed.length).toBeGreaterThan(0);
			expect(parsed[0]).toHaveProperty("productName");
			expect(parsed[0]).toHaveProperty("endpoint");
			expect(parsed[0]).toHaveProperty("mcpEnabled");
			expect(parsed[0]).toHaveProperty("builtInPort");
			expect(parsed[0]).toHaveProperty("braveMode");
			expect(parsed[0]).toHaveProperty("openedProjects");
		} else {
			expect(exitCode).toBe(1);
		}
	});

	test("discover --ide filters by product name", async () => {
		const { stdout, exitCode } = await run(
			"discover",
			"--ide",
			"nonexistent_ide_xyz",
		);
		// Even with IDEs running, a nonexistent filter should return nothing
		expect(exitCode).toBe(1);
	});

	test("discover --json --ide filters results", async () => {
		if (runningIdeCount === 0) return; // skip when no IDE available
		const { stdout, exitCode } = await run("discover", "--json");
		expect(exitCode).toBe(0);
		const all = JSON.parse(stdout) as any[];
		const productName = all[0].productName;

		// Filter by the actual product name — should return at least that one
		const filtered = await run(
			"discover",
			"--json",
			"--ide",
			productName,
		);
		expect(filtered.exitCode).toBe(0);
		const filteredParsed = JSON.parse(filtered.stdout) as any[];
		expect(filteredParsed.length).toBeGreaterThanOrEqual(1);
		expect(
			filteredParsed.every((i: any) => i.productName === productName),
		).toBe(true);
	});
});
