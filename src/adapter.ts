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

  async connect(transport: Transport): Promise<void> {
    try {
      await this.client.connect(transport);
    } catch (e: any) {
      throw new CliError("CONNECTION_ERROR", `Failed to connect: ${e.message}`);
    }
  }

  getServerInfo(): ServerInfo {
    const info = this.client.getServerVersion?.() as Record<string, string> | undefined;
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

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    // Inject projectPath: user-provided args take priority
    const mergedArgs = {
      projectPath: this.projectPath,
      ...args,
    };

    try {
      const result = await this.client.callTool({ name, arguments: mergedArgs });
      return result as unknown as CallToolResult;
    } catch (e: any) {
      if (e.message?.includes("timeout") || e.message?.includes("Timeout")) {
        throw new CliError("TIMEOUT", `Tool call timed out: ${name}`);
      }
      throw new CliError("TOOL_ERROR", `Tool call failed: ${name} — ${e.message}`);
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
