import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CliError } from "./errors.ts";

export interface ServerInfo {
	name: string;
	version: string;
}

export interface CallToolResult {
	content: Array<{ type: string; text?: string; [key: string]: unknown }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}

export class ToolAdapter {
	private client: Client;
	private tools: Tool[] | null = null;

	constructor(private projectPath: string) {
		this.client = new Client({ name: "jbctl", version: "0.1.0" });
	}

	async connect(transport: Transport | Transport[]): Promise<void> {
		const candidates = Array.isArray(transport) ? transport : [transport];
		const errors: string[] = [];

		for (const t of candidates) {
			try {
				this.client = new Client({ name: "jbctl", version: "0.1.0" });
				await this.client.connect(t);
				return;
			} catch (e: any) {
				errors.push(formatErrorChain(e));
			}
		}

		throw new CliError(
			"CONNECTION_ERROR",
			candidates.length === 1
				? `Failed to connect: ${errors[0]}`
				: `Failed to connect (tried ${candidates.length} transports):\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`,
		);
	}

	getServerInfo(): ServerInfo {
		const info = this.client.getServerVersion?.() as
			| Record<string, string>
			| undefined;
		return {
			name: info?.name || "unknown",
			version: info?.version || "unknown",
		};
	}

	async listTools(): Promise<Tool[]> {
		if (this.tools) return this.tools;
		try {
			const result = await this.client.listTools();
			this.tools = result.tools;
			return this.tools;
		} catch (e: any) {
			throw new CliError("TOOL_ERROR", `Failed to list tools: ${e.message}`);
		}
	}

	async getToolSchema(name: string): Promise<Tool> {
		const tools = await this.listTools();
		const tool = tools.find((t) => t.name === name);
		if (!tool) {
			throw new CliError("TOOL_ERROR", `Tool not found: ${name}`, {
				available: tools.map((t) => t.name),
			});
		}
		return tool;
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<CallToolResult> {
		// Inject projectPath: user-provided args take priority
		const mergedArgs = {
			projectPath: this.projectPath,
			...args,
		};

		try {
			const result = await this.client.callTool({
				name,
				arguments: mergedArgs,
			});
			return result as unknown as CallToolResult;
		} catch (e: any) {
			if (e.message?.includes("timeout") || e.message?.includes("Timeout")) {
				throw new CliError("TIMEOUT", `Tool call timed out: ${name}`);
			}
			throw new CliError(
				"TOOL_ERROR",
				`Tool call failed: ${name} — ${e.message}`,
			);
		}
	}

	async close(): Promise<void> {
		try {
			await this.client.close();
		} catch {
			// ignore close errors
		}
	}
}

/** Walk the error cause chain and join all messages into one string. */
function formatErrorChain(err: unknown): string {
	const parts: string[] = [];
	let current: unknown = err;
	while (current instanceof Error) {
		let msg = current.message || "";
		const code = (current as any).code;
		if (code !== undefined) msg += ` (code: ${code})`;
		if (msg) parts.push(msg);
		current = (current as any).cause;
	}
	return parts.length > 0 ? parts.join(" → ") : String(err);
}
