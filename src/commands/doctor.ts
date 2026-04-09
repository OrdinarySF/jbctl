import type { ToolAdapter } from "../adapter.ts";
import type { CliConfig } from "../config.ts";
import { formatDoctorJson } from "../formatters/json.ts";
import { formatDoctor } from "../formatters/text.ts";

export async function runDoctor(
	adapter: ToolAdapter,
	config: CliConfig,
	json: boolean,
): Promise<string> {
	const serverInfo = adapter.getServerInfo();
	const tools = await adapter.listTools();

	const info = {
		serverInfo,
		transport: config.transport,
		endpoint: config.endpoint,
		projectPath: config.project,
		toolCount: tools.length,
	};

	return json ? formatDoctorJson(info) : formatDoctor(info);
}
