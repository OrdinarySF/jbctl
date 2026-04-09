import type { ToolAdapter } from "../adapter.ts";
import { CliError } from "../errors.ts";
import { formatInspectJson } from "../formatters/json.ts";
import { formatInspect } from "../formatters/text.ts";

export async function runInspect(
	adapter: ToolAdapter,
	toolName: string,
	json: boolean,
): Promise<string> {
	if (!toolName) {
		throw new CliError(
			"TOOL_ERROR",
			"Missing tool name. Usage: jbctl inspect <tool>",
		);
	}
	const tool = await adapter.getToolSchema(toolName);
	return json ? formatInspectJson(tool) : formatInspect(tool);
}
