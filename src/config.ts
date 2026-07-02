import { parseArgs } from "node:util";
import { CliError } from "./errors.ts";

export type TransportType = "auto" | "http" | "sse";

export interface CliConfig {
	endpoint: string;
	transport: TransportType;
	project: string;
	timeout: number;
	verbose: boolean;
	command: string;
	commandArgs: string[];
}

/** JetBrains Copy Config format: {"type":"streamable-http"|"sse","url":"...","headers":{}} */
interface JetBrainsConfig {
	type: "streamable-http" | "sse";
	url: string;
	headers: Record<string, string>;
}

function readConfigFile(path: string): JetBrainsConfig {
	try {
		const text = require("node:fs").readFileSync(path, "utf-8");
		const config = JSON.parse(text);
		if (!config.url || !config.type) {
			throw new Error("Missing required fields: type, url");
		}
		if (config.type !== "streamable-http" && config.type !== "sse") {
			throw new Error(
				`Invalid config type: ${config.type}. Expected streamable-http or sse`,
			);
		}
		return config as JetBrainsConfig;
	} catch (e: any) {
		throw new CliError(
			"CONNECTION_ERROR",
			`Failed to read config file: ${path} — ${e.message}`,
		);
	}
}

export function parseCliArgs(argv: string[]): CliConfig {
	const { values, positionals } = parseArgs({
		args: argv.slice(2),
		options: {
			project: { type: "string", short: "p" },
			transport: { type: "string", short: "t" },
			config: { type: "string", short: "c" },
			endpoint: { type: "string", short: "e" },
			timeout: { type: "string" },
			verbose: { type: "boolean", short: "v" },
			json: { type: "boolean" },
			output: { type: "string", short: "o" },
		},
		allowPositionals: true,
		strict: false,
	});

	const command = positionals[0] || "";
	const commandArgs = positionals.slice(1);

	const project = (values.project as string) || process.cwd();

	// Resolve endpoint from --endpoint, --config, or default
	let endpoint = values.endpoint as string | undefined;
	let transport: TransportType = "auto";
	if (values.transport) {
		const rawTransport = values.transport as string;
		if (!["auto", "http", "sse"].includes(rawTransport)) {
			throw new CliError(
				"CONNECTION_ERROR",
				`Invalid --transport: ${rawTransport}. Expected auto, http, or sse`,
			);
		}
		transport = rawTransport as TransportType;
	}

	if (!endpoint && values.config) {
		const cfg = readConfigFile(values.config as string);
		endpoint = cfg.url;
		// Derive transport from config type if not explicitly set
		if (!values.transport) {
			transport = cfg.type === "sse" ? "sse" : "http";
		}
	}

	// endpoint is optional — cli.ts will auto-discover if missing

	return {
		endpoint: endpoint || "",
		transport,
		project,
		timeout: values.timeout ? parseInt(values.timeout as string, 10) : 30_000,
		verbose: !!values.verbose,
		command,
		commandArgs,
	};
}
