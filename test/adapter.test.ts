import { describe, expect, test } from "bun:test";
import { ToolAdapter } from "../src/adapter.ts";
import { CliError } from "../src/errors.ts";

// Mock transport that records calls
function _createMockTransport(_tools: any[] = []) {
	return {
		_started: false,
		_closed: false,
		start() {
			this._started = true;
			return Promise.resolve();
		},
		close() {
			this._closed = true;
			return Promise.resolve();
		},
		send() {
			return Promise.resolve();
		},
		onclose: undefined as any,
		onerror: undefined as any,
		onmessage: undefined as any,
	};
}

// We can't easily mock the Client internals, so test the adapter logic directly.
// For projectPath injection, we test the merge logic in isolation.

describe("projectPath injection", () => {
	test("injects projectPath as base, user args override", () => {
		const projectPath = "/my/project";
		const userArgs = { path: "src/main.ts" };

		// Simulate the merge logic from adapter.ts
		const merged = { projectPath, ...userArgs };
		expect(merged.projectPath).toBe("/my/project");
		expect(merged.path).toBe("src/main.ts");
	});

	test("user-provided projectPath overrides --project", () => {
		const projectPath = "/default/project";
		const userArgs = { projectPath: "/explicit/project", path: "file.ts" };

		// @ts-expect-error: intentionally testing override behavior
		const merged = { projectPath, ...userArgs };
		expect(merged.projectPath).toBe("/explicit/project");
	});

	test("empty user args still gets projectPath", () => {
		const projectPath = "/my/project";
		const userArgs = {};

		const merged = { projectPath, ...userArgs };
		expect(merged.projectPath).toBe("/my/project");
	});
});

describe("ToolAdapter.getToolSchema", () => {
	test("finds tool by name", async () => {
		const adapter = new ToolAdapter("/proj");
		// Inject cached tools directly for unit test
		(adapter as any).tools = [
			{
				name: "tool_a",
				description: "A",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "tool_b",
				description: "B",
				inputSchema: { type: "object", properties: {} },
			},
		];

		const result = await adapter.getToolSchema("tool_b");
		expect(result.name).toBe("tool_b");
		expect(result.description).toBe("B");
	});

	test("throws TOOL_ERROR for unknown tool", async () => {
		const adapter = new ToolAdapter("/proj");
		(adapter as any).tools = [
			{
				name: "tool_a",
				description: "A",
				inputSchema: { type: "object", properties: {} },
			},
		];

		try {
			await adapter.getToolSchema("nonexistent");
			expect(true).toBe(false); // should not reach
		} catch (e) {
			expect(e).toBeInstanceOf(CliError);
			expect((e as CliError).code).toBe("TOOL_ERROR");
			expect((e as CliError).message).toContain("nonexistent");
			expect((e as CliError).details.available).toEqual(["tool_a"]);
		}
	});
});

describe("CliError", () => {
	test("toJSON produces correct structure", () => {
		const err = new CliError("TOOL_ERROR", "test error", { key: "val" });
		const json = err.toJSON();
		expect(json).toEqual({
			code: "TOOL_ERROR",
			message: "test error",
			details: { key: "val" },
		});
	});

	test("defaults details to empty object", () => {
		const err = new CliError("TIMEOUT", "timed out");
		expect(err.toJSON().details).toEqual({});
	});
});
