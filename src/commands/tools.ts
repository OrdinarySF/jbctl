import type { ToolAdapter } from "../adapter.ts";
import { formatTools } from "../formatters/text.ts";
import { formatToolsJson } from "../formatters/json.ts";

export async function runTools(adapter: ToolAdapter, json: boolean): Promise<string> {
  const tools = await adapter.listTools();
  return json ? formatToolsJson(tools) : formatTools(tools);
}
