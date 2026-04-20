import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
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

function getPathApi(platform: NodeJS.Platform = process.platform) {
	return platform === "win32" ? win32 : posix;
}

function getHomeDirectory(env: NodeJS.ProcessEnv = process.env): string {
	return env.HOME || env.USERPROFILE || homedir();
}

export function getJetBrainsConfigDir(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): string {
	if (platform === "darwin") {
		return join(getHomeDirectory(env), "Library/Application Support/JetBrains");
	}

	if (platform === "win32") {
		return win32.join(
			env.APPDATA || win32.join(getHomeDirectory(env), "AppData", "Roaming"),
			"JetBrains",
		);
	}

	return join(
		env.XDG_CONFIG_HOME || join(getHomeDirectory(env), ".config"),
		"JetBrains",
	);
}

// Backward-compatible alias for the earlier helper name used in PR #2 tests.
export const getJetBrainsConfigRoot = getJetBrainsConfigDir;

export function getLoopbackHosts(
	platform: NodeJS.Platform = process.platform,
): string[] {
	return platform === "win32"
		? ["localhost", "127.0.0.1"]
		: ["127.0.0.1", "localhost"];
}

export function normalizeProjectPath(
	projectPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const pathApi = getPathApi(platform);
	const normalized = pathApi.normalize(projectPath).replace(/[\\/]+$/, "");
	return platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function projectPathMatches(
	projectPath: string,
	openedProject: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	const pathApi = getPathApi(platform);
	const project = normalizeProjectPath(projectPath, platform);
	const opened = normalizeProjectPath(openedProject, platform);

	if (!project || !opened) return false;
	return project === opened || project.startsWith(`${opened}${pathApi.sep}`);
}

export function getProjectLabel(
	projectPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const pathApi = getPathApi(platform);
	const normalized = pathApi.normalize(projectPath).replace(/[\\/]+$/, "");
	return pathApi.basename(normalized) || projectPath;
}

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
	host: string;
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
	for (const host of getLoopbackHosts()) {
		try {
			const resp = await fetch(`http://${host}:${port}/stream`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
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
				const data = (await resp.json()) as Record<string, any>;
				const serverName: string = data?.result?.serverInfo?.name ?? "";
				return { port, host, serverName, transport: "stream" };
			}
		} catch {}

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			const resp = await fetch(`http://${host}:${port}/sse`, {
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (
				resp.ok &&
				resp.headers.get("content-type")?.includes("text/event-stream")
			) {
				resp.body?.cancel();
				return { port, host, serverName: "", transport: "sse" };
			}
		} catch {}
	}

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
		getJetBrainsConfigDir(),
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
		getJetBrainsConfigDir(),
		productDir,
		"options/recentProjects.xml",
	);
	try {
		const xml = readFileSync(xmlPath, "utf-8");
		const home = getHomeDirectory();
		const projects: string[] = [];

		const entryRegex =
			/<entry key="([^"]+)">\s*<value>\s*<RecentProjectMetaInfo[^>]*opened="true"/g;
		let match: RegExpExecArray | null;
		while ((match = entryRegex.exec(xml)) !== null) {
			let path = match[1]!;
			path = path.replace("$USER_HOME$", home);
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

	const baseline = parseInt(buildNumber.split(".")[0] ?? "0", 10);
	const major = 2000 + Math.floor(baseline / 10);
	const minor = baseline % 10;
	const version = `${major}.${minor}`;

	const dirName = `${prefix}${version}`;

	try {
		const { statSync } = require("node:fs");
		statSync(join(getJetBrainsConfigDir(), dirName));
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

	const productNames = ides.map((i) => i.productName);
	const mcpByProduct = new Map<string, McpProbeResult>();

	for (const mcp of mcpPorts) {
		const product = matchServerToProduct(mcp.serverName, productNames);
		if (product && !mcpByProduct.has(product)) {
			mcpByProduct.set(product, mcp);
		}
	}

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
		const baseline = parseInt(r.buildNumber.split(".")[0] ?? "0", 10);
		const defaultTransport = baseline >= 261 ? "stream" : "sse";
		const defaultHost = getLoopbackHosts()[0]!;

		let mcpPort: number;
		let mcpEnabled: boolean;
		let mcpTransport: "stream" | "sse";
		let mcpHost = defaultHost;

		const matched = mcpByProduct.get(r.productName);

		if (xmlConfig.port) {
			mcpPort = xmlConfig.port;
			const probe = mcpPorts.find((m) => m.port === xmlConfig.port);
			mcpEnabled = !!probe;
			mcpTransport = probe?.transport ?? defaultTransport;
			mcpHost = probe?.host ?? defaultHost;
		} else if (matched) {
			mcpPort = matched.port;
			mcpEnabled = true;
			mcpTransport = matched.transport;
			mcpHost = matched.host;
		} else {
			mcpPort = 0;
			mcpEnabled = false;
			mcpTransport = defaultTransport;
		}

		const mcpPath = `/${mcpTransport}`;
		const openedProjects = productDir ? readOpenedProjects(productDir) : [];

		instances.push({
			productName: r.productName,
			buildNumber: r.buildNumber,
			displayName: r.name,
			builtInPort: r.builtInPort,
			mcpPort,
			mcpEnabled,
			braveMode: xmlConfig.braveMode,
			endpoint: mcpPort ? `http://${mcpHost}:${mcpPort}${mcpPath}` : "",
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
					`  Projects: ${i.openedProjects.map((p) => getProjectLabel(p)).join(", ")}`,
				);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}
