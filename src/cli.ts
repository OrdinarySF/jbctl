#!/usr/bin/env bun

import { parseCliArgs } from "./config.ts";
import { createTransport } from "./transport.ts";
import { ToolAdapter } from "./adapter.ts";
import { CliError } from "./errors.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runTools } from "./commands/tools.ts";
import { runInspect } from "./commands/inspect.ts";
import { runCall } from "./commands/call.ts";

const HELP = `jbctl — Bridge CLI for JetBrains IDE MCP Server

Usage:
  jbctl <command> --project <path> --endpoint <url> [options]

Commands:
  doctor              Check connection to IDE MCP Server
  tools               List available tools
  inspect <tool>      Show tool schema
  call <tool>         Call a tool

Required:
  --project, -p       Project path (required for all tools)
  --endpoint, -e      MCP Server endpoint URL
                      or --config, -c  Path to JetBrains config JSON

Options:
  --transport, -t     Transport type: auto|http|sse (default: auto)
  --timeout           Request timeout in ms (default: 30000)
  --verbose, -v       Show debug output
  --json              Output in JSON format
  --output, -o        Output format for call: text|json (default: text)
`;

async function main() {
  let config;
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
  const outputJson = rawArgs.includes("--json") || (outputIdx !== -1 && rawArgs[outputIdx + 1] === "json");
  const jsonPayloadIdx = rawArgs.indexOf("--json");

  // For call command, --json is used for payload, detect via position
  let jsonPayload: string | undefined;
  if (config.command === "call") {
    for (let i = 0; i < rawArgs.length; i++) {
      if (rawArgs[i] === "--json" && i + 1 < rawArgs.length && rawArgs[i + 1]?.startsWith("{")) {
        jsonPayload = rawArgs[i + 1];
        break;
      }
    }
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
        output = await runInspect(adapter, config.commandArgs[0], json);
        break;
      case "call":
        output = await runCall(adapter, config.commandArgs[0], jsonPayload, outputJson);
        break;
      default:
        console.error(`Unknown command: ${config.command}`);
        console.log(HELP);
        process.exit(2);
    }

    console.log(output);
  } catch (e) {
    if (e instanceof CliError) {
      console.error(json ? JSON.stringify(e.toJSON()) : `Error [${e.code}]: ${e.message}`);
      process.exit(1);
    }
    throw e;
  } finally {
    await adapter.close();
  }
}

main();
