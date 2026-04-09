import type { ToolAdapter } from "../adapter.ts";
import { CliError } from "../errors.ts";
import { formatCallResult } from "../formatters/text.ts";
import { formatCallResultJson } from "../formatters/json.ts";

export async function runCall(
  adapter: ToolAdapter,
  toolName: string,
  jsonPayload: string | undefined,
  outputJson: boolean,
): Promise<string> {
  if (!toolName) {
    throw new CliError("TOOL_ERROR", "Missing tool name. Usage: jbctl call <tool> --json '<args>'");
  }

  let args: Record<string, unknown> = {};
  if (jsonPayload) {
    try {
      args = JSON.parse(jsonPayload);
    } catch {
      throw new CliError("TOOL_ERROR", `Invalid JSON payload: ${jsonPayload}`);
    }
  }

  const result = await adapter.callTool(toolName, args);

  if (result.isError && !outputJson) {
    const errorText = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    throw new CliError("TOOL_ERROR", `Tool returned error: ${errorText}`, {
      toolName,
    });
  }

  return outputJson ? formatCallResultJson(result) : formatCallResult(result);
}
