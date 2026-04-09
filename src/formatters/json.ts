import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServerInfo, CallToolResult } from "../adapter.ts";

export function formatDoctorJson(info: {
  serverInfo: ServerInfo;
  transport: string;
  endpoint: string;
  projectPath: string;
  toolCount: number;
}): string {
  return JSON.stringify({
    server: info.serverInfo,
    transport: info.transport,
    endpoint: info.endpoint,
    projectPath: info.projectPath,
    toolCount: info.toolCount,
    status: "connected",
  });
}

export function formatToolsJson(tools: Tool[]): string {
  return JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  );
}

export function formatInspectJson(tool: Tool): string {
  return JSON.stringify(tool);
}

export function formatCallResultJson(result: CallToolResult): string {
  // Prefer structuredContent when available
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent);
  }
  return JSON.stringify(result.content);
}
