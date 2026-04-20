import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	discoverInstances,
	getJetBrainsConfigDir,
	getJetBrainsConfigRoot,
	getLoopbackHosts,
	getProjectLabel,
	normalizeProjectPath,
	projectPathMatches,
} from "../src/commands/discover.ts";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalAppData = process.env.APPDATA;
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env.HOME = originalHome;
	process.env.USERPROFILE = originalUserProfile;
	process.env.APPDATA = originalAppData;
	globalThis.fetch = originalFetch;
	rmSync(join(process.cwd(), ".tmp-discover-test"), {
		recursive: true,
		force: true,
	});
});

describe("discover helpers", () => {
	test("resolves JetBrains config dir on Windows", () => {
		expect(
			getJetBrainsConfigDir("win32", {
				APPDATA: "C:\\Users\\alice\\AppData\\Roaming",
			} as NodeJS.ProcessEnv),
		).toBe("C:\\Users\\alice\\AppData\\Roaming\\JetBrains");
		expect(
			getJetBrainsConfigRoot("win32", {
				APPDATA: "C:\\Users\\alice\\AppData\\Roaming",
			} as NodeJS.ProcessEnv),
		).toBe("C:\\Users\\alice\\AppData\\Roaming\\JetBrains");
	});

	test("falls back to XDG config on Linux", () => {
		expect(
			getJetBrainsConfigDir("linux", {
				HOME: "/home/alice",
			} as NodeJS.ProcessEnv),
		).toBe("/home/alice/.config/JetBrains");
	});

	test("prefers localhost first on Windows loopback probes", () => {
		expect(getLoopbackHosts("win32")).toEqual(["localhost", "127.0.0.1"]);
	});

	test("normalizes Windows paths case-insensitively", () => {
		expect(normalizeProjectPath("C:/Work/Idea-CLI/", "win32")).toBe(
			"c:\\work\\idea-cli",
		);
	});

	test("matches nested Windows project paths", () => {
		expect(
			projectPathMatches(
				"C:\\Work\\Idea-CLI\\packages\\cli",
				"c:/work/idea-cli",
				"win32",
			),
		).toBe(true);
	});

	test("extracts Windows project labels", () => {
		expect(getProjectLabel("C:\\Work\\Idea-CLI", "win32")).toBe("Idea-CLI");
	});
});

describe("discoverInstances", () => {
	test("detects SSE MCP via localhost fallback and reads brave mode from config", async () => {
		const tempHome = join(
			process.cwd(),
			".tmp-discover-test",
			`${Date.now()}-${Math.random().toString(16).slice(2)}`,
		);
		const productDir = join(
			tempHome,
			"Library/Application Support/JetBrains/IntelliJIdea2025.3/options",
		);
		mkdirSync(productDir, { recursive: true });
		writeFileSync(
			join(productDir, "mcpServer.xml"),
			[
				"<application>",
				'  <component name="McpServerSettings">',
				'    <option name="enableMcpServer" value="true" />',
				'    <option name="enableBraveMode" value="true" />',
				'    <option name="mcpServerPort" value="64342" />',
				"  </component>",
				"</application>",
			].join("\n"),
		);
		writeFileSync(
			join(productDir, "recentProjects.xml"),
			[
				"<application>",
				'  <component name="RecentProjectsManager">',
				'    <option name="additionalInfo">',
				'      <map><entry key="$USER_HOME$/demo"><value><RecentProjectMetaInfo opened="true" /></value></entry></map>',
				"    </option>",
				"  </component>",
				"</application>",
			].join("\n"),
		);

		process.env.HOME = tempHome;
		process.env.USERPROFILE = undefined;
		process.env.APPDATA = undefined;
		globalThis.fetch = (async (input) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;

			if (url === "http://127.0.0.1:63342/api/about") {
				return new Response(
					JSON.stringify({
						productName: "IDEA",
						buildNumber: "253.32098.37",
						name: "IntelliJ IDEA 2025.3.1",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			if (url.startsWith("http://127.0.0.1:64342/")) {
				throw new Error("connection refused");
			}

			if (url === "http://localhost:64342/stream") {
				return new Response("Not Found", { status: 404 });
			}

			if (url === "http://localhost:64342/sse") {
				return new Response("", {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				});
			}

			throw new Error(`unexpected fetch: ${url}`);
		}) as typeof fetch;

		const [instance] = await discoverInstances(undefined, 500);
		expect(instance).toBeDefined();
		expect(instance?.mcpEnabled).toBe(true);
		expect(instance?.endpoint).toBe("http://localhost:64342/sse");
		expect(instance?.braveMode).toBe(true);
		expect(instance?.openedProjects).toEqual([join(tempHome, "demo")]);
	});
});

describe("npm packaging", () => {
	test("publishes a JS launcher for cross-platform installs", () => {
		const pkg = require("../package.json");
		expect(pkg.bin.jbctl).toBe("dist/bin.cjs");
		expect(pkg.files).toContain("dist/bin.cjs");
	});

	test("launcher uses a pure node entrypoint for npm installs", () => {
		const launcher = require("node:fs").readFileSync(
			join(process.cwd(), "scripts/launcher.cjs"),
			"utf-8",
		);
		expect(launcher).not.toContain('spawn("bun"');
		expect(launcher).toContain("void import(pathToFileURL(cliPath).href)");
	});
});
