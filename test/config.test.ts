import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../src/config.ts";
import { CliError } from "../src/errors.ts";

describe("parseCliArgs", () => {
	function parse(...args: string[]) {
		return parseCliArgs(["bun", "cli.ts", ...args]);
	}

	test("parses doctor command with required params", () => {
		const config = parse(
			"doctor",
			"--project",
			"/tmp",
			"--endpoint",
			"http://localhost:8080/stream",
		);
		expect(config.command).toBe("doctor");
		expect(config.project).toBe("/tmp");
		expect(config.endpoint).toBe("http://localhost:8080/stream");
		expect(config.transport).toBe("auto");
		expect(config.timeout).toBe(30_000);
		expect(config.verbose).toBe(false);
	});

	test("parses short flags", () => {
		const config = parse(
			"tools",
			"-p",
			"/proj",
			"-e",
			"http://localhost:8080/stream",
			"-v",
		);
		expect(config.command).toBe("tools");
		expect(config.project).toBe("/proj");
		expect(config.endpoint).toBe("http://localhost:8080/stream");
		expect(config.verbose).toBe(true);
	});

	test("parses transport option", () => {
		const config = parse(
			"doctor",
			"-p",
			"/tmp",
			"-e",
			"http://x",
			"--transport",
			"sse",
		);
		expect(config.transport).toBe("sse");
	});

	test("parses timeout option", () => {
		const config = parse(
			"doctor",
			"-p",
			"/tmp",
			"-e",
			"http://x",
			"--timeout",
			"5000",
		);
		expect(config.timeout).toBe(5000);
	});

	test("parses command args for inspect", () => {
		const config = parse(
			"inspect",
			"get_file_problems",
			"-p",
			"/tmp",
			"-e",
			"http://x",
		);
		expect(config.command).toBe("inspect");
		expect(config.commandArgs).toEqual(["get_file_problems"]);
	});

	test("parses command args for call", () => {
		const config = parse(
			"call",
			"get_project_modules",
			"-p",
			"/tmp",
			"-e",
			"http://x",
		);
		expect(config.command).toBe("call");
		expect(config.commandArgs).toEqual(["get_project_modules"]);
	});

	test("throws when --project is missing", () => {
		expect(() => parse("doctor", "-e", "http://x")).toThrow(CliError);
		try {
			parse("doctor", "-e", "http://x");
		} catch (e) {
			expect((e as CliError).code).toBe("CONNECTION_ERROR");
			expect((e as CliError).message).toContain("--project");
		}
	});

	test("allows missing endpoint (auto-discovery handled by cli.ts)", () => {
		const config = parse("doctor", "-p", "/tmp");
		expect(config.endpoint).toBe("");
	});

	test("does not throw for help command without params", () => {
		const config = parse("help");
		expect(config.command).toBe("help");
	});

	test("does not throw for empty args (shows help)", () => {
		const config = parse();
		expect(config.command).toBe("");
	});

	test("reads --config file and extracts endpoint", () => {
		const tmpFile = "/tmp/idea-mcp-config-test.json";
		require("node:fs").writeFileSync(
			tmpFile,
			JSON.stringify({
				type: "streamable-http",
				url: "http://127.0.0.1:9999/stream",
				headers: {},
			}),
		);
		const config = parse("doctor", "-p", "/tmp", "--config", tmpFile);
		expect(config.endpoint).toBe("http://127.0.0.1:9999/stream");
		expect(config.transport).toBe("http");
	});

	test("reads SSE config and sets transport to sse", () => {
		const tmpFile = "/tmp/idea-mcp-config-sse-test.json";
		require("node:fs").writeFileSync(
			tmpFile,
			JSON.stringify({
				type: "sse",
				url: "http://127.0.0.1:9999/sse",
				headers: {},
			}),
		);
		const config = parse("doctor", "-p", "/tmp", "--config", tmpFile);
		expect(config.endpoint).toBe("http://127.0.0.1:9999/sse");
		expect(config.transport).toBe("sse");
	});

	test("--endpoint takes precedence over --config", () => {
		const tmpFile = "/tmp/idea-mcp-config-test.json";
		require("node:fs").writeFileSync(
			tmpFile,
			JSON.stringify({
				type: "sse",
				url: "http://from-config/sse",
				headers: {},
			}),
		);
		const config = parse(
			"doctor",
			"-p",
			"/tmp",
			"-e",
			"http://from-flag/stream",
			"--config",
			tmpFile,
		);
		expect(config.endpoint).toBe("http://from-flag/stream");
	});

	test("throws on invalid config file", () => {
		expect(() =>
			parse("doctor", "-p", "/tmp", "--config", "/nonexistent"),
		).toThrow(CliError);
	});
});
