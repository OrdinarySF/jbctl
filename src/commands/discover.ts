import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "../errors.ts";

export interface IdeInstance {
	productName: string;
	buildNumber: string;
	displayName: string;
	builtInPort: number;
	mcpPort: number;
	mcpEnabled: boolean;
	braveMode: boolean;
	endpoint: string;
	openedProjects: string[];
}

const BUILTIN_PORT_START = 63342;
const BUILTIN_PORT_END = 63352;
const MCP_PORT_START = 64342;
const MCP_PORT_END = 64352;

const JETBRAINS_SUPPORT_DIR =
	process.platform === "darwin"
		? join(
				process.env.HOME || "",
				"Library/Application Support/JetBrains",
			)
		: join(process.env.HOME || "", ".local/share/JetBrains");

/** Probe a single port for JetBrains built-in web server */
async function probeBuiltInServer(
	port: number,
	timeoutMs: number,
): Promise<{ productName: string; buildNumber: string; name: string } | null> {
	try {
		const resp = await fetch(`http://127.0.0.1:${port}/api/about`, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!resp.ok) return null;
		const data = (await resp.json()) as Record<string, unknown>;
		if (
			typeof data.productName === "string" &&
			typeof data.buildNumber === "string" &&
			typeof data.name === "string"
		) {
			return data as unknown as {
				productName: string;
				buildNumber: string;
				name: string;
			};
		}
		return null;
	} catch {
		return null;
	}
}

interface McpProbeResult {
	port: number;
	serverName: string;
	transport: "stream" | "sse";
}

/**
 * Probe a single MCP port. Try /stream (Streamable HTTP) first with an
 * initialize handshake to retrieve the server name, then fall back to /sse.
 */
async function probeMcpPort(
	port: number,
	timeoutMs: number,
): Promise<McpProbeResult | null> {
	// Try Streamable HTTP — a single POST gives us the server name
	try {
		const resp = await fetch(`http://127.0.0.1:${port}/stream`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "jbctl-discover", version: "0.1.0" },
				},
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (resp.ok) {
			const data = (await resp.json()) as any;
			const serverName: string = data?.result?.serverInfo?.name ?? "";
			return { port, serverName, transport: "stream" };
		}
	} catch {}

	// Try SSE — can only confirm alive, no server name available
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const resp = await fetch(`http://127.0.0.1:${port}/sse`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);
		if (
			resp.ok &&
			resp.headers.get("content-type")?.includes("text/event-stream")
		) {
			resp.body?.cancel();
			return { port, serverName: "", transport: "sse" };
		}
	} catch {}

	return null;
}

/**
 * Match an MCP probe result to a product name.
 * Server names look like "WebStorm MCP Server", "IntelliJ IDEA MCP Server", etc.
 */
function matchServerToProduct(
	serverName: string,
	productNames: string[],
): string | null {
	if (!serverName) return null;
	const lower = serverName.toLowerCase();
	for (const name of productNames) {
		if (lower.includes(name.toLowerCase())) return name;
	}
	// IDEA reports as "IntelliJ IDEA MCP Server" but productName from /api/about is "IDEA"
	if (lower.includes("intellij")) {
		const idea = productNames.find((n) => n === "IDEA");
		if (idea) return idea;
	}
	return null;
}

/**
 * Read mcpServer.xml to check for explicit port override.
 * Returns the explicit port or null if not set / file not found.
 */
function readMcpServerXml(
	productDir: string,
): { port: number | null; enabled: boolean; braveMode: boolean } {
	const xmlPath = join(
		JETBRAINS_SUPPORT_DIR,
		productDir,
		"options/mcpServer.xml",
	);
	try {
		const xml = readFileSync(xmlPath, "utf-8");
		const enabled = xml.includes('"enableMcpServer" value="true"');
		const braveMode = xml.includes('"enableBraveMode" value="true"');
		const portMatch = xml.match(/"mcpServerPort" value="(\d+)"/);
		return {
			port: portMatch?.[1] ? parseInt(portMatch[1], 10) : null,
			enabled,
			braveMode,
		};
	} catch {
		return { port: null, enabled: false, braveMode: false };
	}
}

/**
 * Read recentProjects.xml and return paths of currently opened projects.
 * Projects with opened="true" on their RecentProjectMetaInfo element are currently open in the IDE.
 */
function readOpenedProjects(productDir: string): string[] {
	const xmlPath = join(
		JETBRAINS_SUPPORT_DIR,
		productDir,
		"options/recentProjects.xml",
	);
	try {
		const xml = readFileSync(xmlPath, "utf-8");
		const home = process.env.HOME || "";
		const projects: string[] = [];

		// Match entry keys where the nested RecentProjectMetaInfo has opened="true"
		const entryRegex =
			/<entry key="([^"]+)">\s*<value>\s*<RecentProjectMetaInfo[^>]*opened="true"/g;
		let match: RegExpExecArray | null;
		while ((match = entryRegex.exec(xml)) !== null) {
			let path = match[1]!;
			path = path.replace("$USER_HOME$", home);
			// Skip non-filesystem paths (e.g. $APPLICATION_CONFIG_DIR$/...)
			if (path.includes("$")) continue;
			projects.push(path);
		}
		return projects;
	} catch {
		return [];
	}
}

/** Map productName from /api/about to JetBrains support dir prefix */
const PRODUCT_DIR_PREFIX: Record<string, string> = {
	IDEA: "IntelliJIdea",
	WebStorm: "WebStorm",
	GoLand: "GoLand",
	PyCharm: "PyCharm",
	PhpStorm: "PhpStorm",
	"CLion Nova": "CLion",
	CLion: "CLion",
	RustRover: "RustRover",
	Rider: "Rider",
	RubyMine: "RubyMine",
	DataGrip: "DataGrip",
};

/** Find the matching product config dir (e.g. "WebStorm2026.1") */
function findProductDir(
	productName: string,
	buildNumber: string,
): string | null {
	const prefix = PRODUCT_DIR_PREFIX[productName];
	if (!prefix) return null;

	// buildNumber like "261.22158.274" → baselineVersion "2026.1" (261 → 2026.1)
	// Or "253.32098.37" → "2025.3"
	const baseline = parseInt(buildNumber.split(".")[0] ?? "0", 10);
	const major = 2000 + Math.floor(baseline / 10);
	const minor = baseline % 10;
	const version = `${major}.${minor}`;

	const dirName = `${prefix}${version}`;

	try {
		const { statSync } = require("node:fs");
		statSync(join(JETBRAINS_SUPPORT_DIR, dirName));
		return dirName;
	} catch {
		return null;
	}
}

/** Core discovery logic — returns all found instances, filtered by IDE name if given. */
export async function discoverInstances(
	ide?: string,
	timeoutMs = 500,
): Promise<IdeInstance[]> {
	// 1. Scan built-in ports and MCP ports in parallel
	const builtInProbes = [];
	for (let port = BUILTIN_PORT_START; port <= BUILTIN_PORT_END; port++) {
		builtInProbes.push(
			probeBuiltInServer(port, timeoutMs).then((info) =>
				info ? { ...info, builtInPort: port } : null,
			),
		);
	}

	const mcpProbes = [];
	for (let port = MCP_PORT_START; port <= MCP_PORT_END; port++) {
		mcpProbes.push(probeMcpPort(port, timeoutMs));
	}

	const [builtInResults, mcpResults] = await Promise.all([
		Promise.all(builtInProbes),
		Promise.all(mcpProbes),
	]);

	const ides = builtInResults.filter(
		(r): r is NonNullable<typeof r> => r !== null,
	);
	const mcpPorts = mcpResults.filter(
		(r): r is McpProbeResult => r !== null,
	);

	// 2. Build a map: productName → matched MCP probe (only via server name)
	const productNames = ides.map((i) => i.productName);
	const mcpByProduct = new Map<string, McpProbeResult>();

	for (const mcp of mcpPorts) {
		const product = matchServerToProduct(mcp.serverName, productNames);
		if (product && !mcpByProduct.has(product)) {
			mcpByProduct.set(product, mcp);
		}
	}

	// 3. For IDEs without a server-name match, try xml config port or assign unmatched ports
	const instances: IdeInstance[] = [];

	for (const r of ides) {
		if (
			ide &&
			!r.productName.toLowerCase().includes(ide.toLowerCase()) &&
			!r.name.toLowerCase().includes(ide.toLowerCase())
		) {
			continue;
		}

		const productDir = findProductDir(r.productName, r.buildNumber);
		const xmlConfig = productDir
			? readMcpServerXml(productDir)
			: { port: null, enabled: false, braveMode: false };

		let mcpPort: number;
		let mcpEnabled: boolean;
		let mcpTransport: "stream" | "sse";

		const matched = mcpByProduct.get(r.productName);

		if (xmlConfig.port) {
			// Explicit port in config takes priority
			mcpPort = xmlConfig.port;
			const probe = mcpPorts.find((m) => m.port === xmlConfig.port);
			mcpEnabled = !!probe;
			mcpTransport = probe?.transport ?? "stream";
		} else if (matched) {
			// Matched by server name from initialize handshake
			mcpPort = matched.port;
			mcpEnabled = true;
			mcpTransport = matched.transport;
		} else {
			// No MCP port matched — report as inactive
			const baseline = parseInt(r.buildNumber.split(".")[0] ?? "0", 10);
			mcpPort = 0;
			mcpEnabled = false;
			mcpTransport = baseline >= 261 ? "stream" : "sse";
		}

		const mcpPath = `/${mcpTransport}`;

		const openedProjects = productDir
			? readOpenedProjects(productDir)
			: [];

		instances.push({
			productName: r.productName,
			buildNumber: r.buildNumber,
			displayName: r.name,
			builtInPort: r.builtInPort,
			mcpPort,
			mcpEnabled,
			braveMode: xmlConfig.braveMode,
			endpoint: mcpPort
				? `http://127.0.0.1:${mcpPort}${mcpPath}`
				: "",
			openedProjects,
		});
	}

	return instances;
}

export async function runDiscover(
	json: boolean,
	ide?: string,
	timeoutMs = 500,
): Promise<string> {
	const instances = await discoverInstances(ide, timeoutMs);

	if (instances.length === 0) {
		const msg = ide
			? `No running JetBrains IDE matching "${ide}" found`
			: "No running JetBrains IDE found on ports 63342-63352";
		throw new CliError("CONNECTION_ERROR", msg);
	}

	if (json) {
		return JSON.stringify(instances);
	}

	return instances
		.map((i) => {
			const status = i.mcpEnabled ? "MCP active" : "MCP inactive";
			const brave = i.braveMode ? "on" : "off";
			const lines = [
				`${i.displayName}`,
				`  Built-in: http://127.0.0.1:${i.builtInPort}`,
				`  MCP:      ${i.endpoint}  (${status})`,
				`  Brave:    ${brave}`,
			];
			if (i.openedProjects.length > 0) {
				lines.push(
					`  Projects: ${i.openedProjects.map((p) => p.split("/").pop()).join(", ")}`,
				);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}
