#!/usr/bin/env bun

import { ToolAdapter } from "./adapter.ts";
import { runCall } from "./commands/call.ts";
import { discoverInstances, runDiscover } from "./commands/discover.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runInspect } from "./commands/inspect.ts";
import { runTools } from "./commands/tools.ts";
import { parseCliArgs } from "./config.ts";
import { CliError } from "./errors.ts";
import { createTransport } from "./transport.ts";

const HELP = `jbctl — Bridge CLI for JetBrains IDE MCP Server

Usage:
  jbctl <command> --project <path> --endpoint <url> [options]

Commands:
  discover            Scan for running JetBrains IDEs and MCP endpoints
  doctor              Check connection to IDE MCP Server
  tools               List available tools
  inspect <tool>      Show tool schema
  call <tool>         Call a tool

Required:
  --project, -p       Project path (required for all tools except discover)
  --endpoint, -e      MCP Server endpoint URL (auto-detected if omitted)
                      or --config, -c  Path to JetBrains config JSON

Options:
  --ide               Filter discover by IDE name (e.g. webstorm, idea)
  --transport, -t     Transport type: auto|http|sse (default: auto)
  --timeout           Request timeout in ms (default: 30000)
  --verbose, -v       Show debug output
  --json              Output in JSON format
  --output, -o        Output format for call: text|json (default: text)
`;

async function main() {
	let config: import("./config.ts").CliConfig;
	try {
		config = parseCliArgs(process.argv);
	} catch (e) {
		if (e instanceof CliError) {
			console.error(JSON.stringify(e.toJSON()));
			process.exit(2);
		}
		throw e;
	}

	if (!config.command || config.command === "help") {
		console.log(HELP);
		process.exit(0);
	}

	// Parse flags from raw argv for command-level options
	const rawArgs = process.argv.slice(2);
	const json = rawArgs.includes("--json");
	const outputIdx = rawArgs.indexOf("--output");
	const outputJson =
		rawArgs.includes("--json") ||
		(outputIdx !== -1 && rawArgs[outputIdx + 1] === "json");
	const _jsonPayloadIdx = rawArgs.indexOf("--json");

	// For call command, --json is used for payload, detect via position
	let jsonPayload: string | undefined;
	if (config.command === "call") {
		for (let i = 0; i < rawArgs.length; i++) {
			if (
				rawArgs[i] === "--json" &&
				i + 1 < rawArgs.length &&
				rawArgs[i + 1]?.startsWith("{")
			) {
				jsonPayload = rawArgs[i + 1];
				break;
			}
		}
	}

	// discover doesn't need endpoint/project/adapter
	if (config.command === "discover") {
		try {
			const ideFilter = rawArgs.includes("--ide")
				? rawArgs[rawArgs.indexOf("--ide") + 1]
				: undefined;
			const output = await runDiscover(json, ideFilter, config.timeout);
			console.log(output);
		} catch (e) {
			if (e instanceof CliError) {
				console.error(
					json ? JSON.stringify(e.toJSON()) : `Error [${e.code}]: ${e.message}`,
				);
				process.exit(1);
			}
			throw e;
		}
		process.exit(0);
	}

	// Auto-discover endpoint if not provided
	if (!config.endpoint) {
		const active = (await discoverInstances()).filter((i) => i.mcpEnabled);
		if (active.length === 0) {
			console.error(
				"Error [CONNECTION_ERROR]: No MCP-active JetBrains IDE found. Provide --endpoint or start an IDE with MCP Server enabled.",
			);
			process.exit(1);
		}
		if (active.length > 1) {
			const list = active
				.map((i) => `  ${i.displayName}  →  ${i.endpoint}`)
				.join("\n");
			console.error(
				`Error [CONNECTION_ERROR]: Multiple MCP-active IDEs found. Specify --endpoint:\n${list}`,
			);
			process.exit(1);
		}
		const detected = active[0]!;
		config.endpoint = detected.endpoint;
		console.error(`Auto-detected: ${detected.displayName} (${detected.endpoint})`);
	}

	const adapter = new ToolAdapter(config.project);

	try {
		const transport = await createTransport(config.endpoint, config.transport);
		await adapter.connect(transport);

		let output: string;
		switch (config.command) {
			case "doctor":
				output = await runDoctor(adapter, config, json);
				break;
			case "tools":
				output = await runTools(adapter, json);
				break;
			case "inspect":
				output = await runInspect(adapter, config.commandArgs[0] ?? "", json);
				break;
			case "call":
				output = await runCall(
					adapter,
					config.commandArgs[0] ?? "",
					jsonPayload,
					outputJson,
				);
				break;
			default:
				console.error(`Unknown command: ${config.command}`);
				console.log(HELP);
				process.exit(2);
		}

		console.log(output);
	} catch (e) {
		if (e instanceof CliError) {
			console.error(
				json ? JSON.stringify(e.toJSON()) : `Error [${e.code}]: ${e.message}`,
			);
			process.exit(1);
		}
		throw e;
	} finally {
		await adapter.close();
	}
}

main();
