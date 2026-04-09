import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServerInfo, CallToolResult } from "../adapter.ts";

export function formatDoctor(info: {
  serverInfo: ServerInfo;
  transport: string;
  endpoint: string;
  projectPath: string;
  toolCount: number;
}): string {
  return [
    `Server:    ${info.serverInfo.name} ${info.serverInfo.version}`,
    `Transport: ${info.transport}`,
    `Endpoint:  ${info.endpoint}`,
    `Project:   ${info.projectPath}`,
    `Tools:     ${info.toolCount}`,
    `Status:    connected`,
  ].join("\n");
}

export function formatTools(tools: Tool[]): string {
  const maxNameLen = Math.max(...tools.map((t) => t.name.length));
  return tools
    .map((t) => {
      const desc = t.description?.split("\n")[0] || "(no description)";
      return `  ${t.name.padEnd(maxNameLen)}  ${desc}`;
    })
    .join("\n");
}

export function formatInspect(tool: Tool): string {
  const lines: string[] = [];
  lines.push(`Name: ${tool.name}`);
  if (tool.description) {
    lines.push(`Description:\n  ${tool.description.replace(/\n/g, "\n  ")}`);
  }
  lines.push(`Input Schema:`);
  lines.push(`  ${JSON.stringify(tool.inputSchema, null, 2).replace(/\n/g, "\n  ")}`);
  return lines.join("\n");
}

export function formatCallResult(result: CallToolResult): string {
  if (result.isError) {
    const errorText = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return `Error: ${errorText}`;
  }

  // Prefer structuredContent for readable output
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  return result.content
    .map((c) => {
      if (c.type === "text") return c.text;
      return JSON.stringify(c);
    })
    .join("\n");
}
