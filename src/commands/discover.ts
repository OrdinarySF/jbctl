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
}

const BUILTIN_PORT_START = 63342;
const BUILTIN_PORT_END = 63352;
const MCP_PORT_OFFSET = 1000;

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
		const data = await resp.json();
		if (data.productName && data.buildNumber) {
			return data;
		}
		return null;
	} catch {
		return null;
	}
}

/** Check if MCP server is alive on the given port */
async function probeMcpServer(
	port: number,
	timeoutMs: number,
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const resp = await fetch(`http://127.0.0.1:${port}/sse`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);
		// SSE endpoint returns 200 with text/event-stream
		if (resp.ok && resp.headers.get("content-type")?.includes("text/event-stream")) {
			// Don't consume the stream, just verify it's alive
			resp.body?.cancel();
			return true;
		}
		return false;
	} catch {
		return false;
	}
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
			port: portMatch ? parseInt(portMatch[1], 10) : null,
			enabled,
			braveMode,
		};
	} catch {
		return { port: null, enabled: false, braveMode: false };
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
	const baseline = parseInt(buildNumber.split(".")[0], 10);
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

export async function runDiscover(
	json: boolean,
	ide?: string,
	timeoutMs = 500,
): Promise<string> {
	// Probe all built-in server ports in parallel
	const probes = [];
	for (let port = BUILTIN_PORT_START; port <= BUILTIN_PORT_END; port++) {
		probes.push(
			probeBuiltInServer(port, timeoutMs).then((info) =>
				info ? { ...info, builtInPort: port } : null,
			),
		);
	}

	const results = (await Promise.all(probes)).filter(
		(r): r is NonNullable<typeof r> => r !== null,
	);

	if (results.length === 0) {
		throw new CliError(
			"CONNECTION_ERROR",
			"No running JetBrains IDE found on ports 63342-63352",
		);
	}

	// For each IDE, determine MCP port and verify
	const instances: IdeInstance[] = [];

	for (const r of results) {
		// Filter by --ide if specified
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

		const mcpPort = xmlConfig.port ?? r.builtInPort + MCP_PORT_OFFSET;
		const mcpAlive = await probeMcpServer(mcpPort, timeoutMs);

		instances.push({
			productName: r.productName,
			buildNumber: r.buildNumber,
			displayName: r.name,
			builtInPort: r.builtInPort,
			mcpPort,
			mcpEnabled: mcpAlive,
			braveMode: xmlConfig.braveMode,
			endpoint: `http://127.0.0.1:${mcpPort}/stream`,
		});
	}

	if (instances.length === 0) {
		const msg = ide
			? `No running JetBrains IDE matching "${ide}" found`
			: "No running JetBrains IDE found";
		throw new CliError("CONNECTION_ERROR", msg);
	}

	if (json) {
		return JSON.stringify(instances);
	}

	return instances
		.map((i) => {
			const status = i.mcpEnabled ? "MCP active" : "MCP inactive";
			const brave = i.braveMode ? "on" : "off";
			return [
				`${i.displayName}`,
				`  Built-in: http://127.0.0.1:${i.builtInPort}`,
				`  MCP:      ${i.endpoint}  (${status})`,
				`  Brave:    ${brave}`,
			].join("\n");
		})
		.join("\n\n");
}
