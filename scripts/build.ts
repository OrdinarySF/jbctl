#!/usr/bin/env bun

/**
 * Cross-platform build script for jbctl.
 *
 * Usage:
 *   bun scripts/build.ts              # build for current platform
 *   bun scripts/build.ts --all        # build for all platforms
 *   bun scripts/build.ts --target linux-x64,darwin-arm64
 */

import { existsSync, mkdirSync } from "fs";
import { parseArgs } from "util";

const VERSION = require("../package.json").version;
const ENTRY = "src/cli.ts";
const OUT_DIR = "dist";

const TARGETS = {
	"darwin-arm64": "bun-darwin-arm64",
	"darwin-x64": "bun-darwin-x64",
	"linux-x64": "bun-linux-x64",
	"linux-arm64": "bun-linux-arm64",
	"windows-x64": "bun-windows-x64",
} as const;

type Platform = keyof typeof TARGETS;

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		all: { type: "boolean" },
		target: { type: "string" },
	},
	strict: false,
});

function currentPlatform(): Platform {
	const arch = process.arch === "arm64" ? "arm64" : "x64";
	const os = process.platform === "win32" ? "windows" : process.platform;
	return `${os}-${arch}` as Platform;
}

function outName(platform: Platform): string {
	const ext = platform.startsWith("windows") ? ".exe" : "";
	return `jbctl-${platform}${ext}`;
}

async function build(platform: Platform): Promise<void> {
	const target = TARGETS[platform];
	if (!target) {
		console.error(`Unknown platform: ${platform}`);
		process.exit(1);
	}

	const outfile = `${OUT_DIR}/${outName(platform)}`;
	const args = [
		"bun",
		"build",
		"--compile",
		ENTRY,
		"--target",
		target,
		"--outfile",
		outfile,
		"--no-compile-autoload-dotenv",
		"--no-compile-autoload-bunfig",
	];

	if (platform.startsWith("windows") && process.platform === "win32") {
		args.push(
			`--windows-title=jbctl`,
			`--windows-description=JetBrains IDE MCP CLI`,
			`--windows-version=${VERSION}.0`,
		);
	}

	console.log(`Building ${platform}...`);
	const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
	const code = await proc.exited;
	if (code !== 0) {
		console.error(`Build failed for ${platform}`);
		process.exit(code);
	}

	const stat = Bun.file(outfile);
	const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
	console.log(`  → ${outfile} (${sizeMB} MB)`);
}

async function main() {
	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

	let platforms: Platform[];

	if (values.all) {
		platforms = Object.keys(TARGETS) as Platform[];
	} else if (values.target) {
		platforms = (values.target as string)
			.split(",")
			.map((s) => s.trim()) as Platform[];
	} else {
		platforms = [currentPlatform()];
	}

	console.log(`jbctl v${VERSION} — building for: ${platforms.join(", ")}\n`);

	for (const p of platforms) {
		await build(p);
	}

	console.log("\nDone.");
}

main();
