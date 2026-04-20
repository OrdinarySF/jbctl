#!/usr/bin/env bun

import { chmodSync, copyFileSync, mkdirSync } from "node:fs";

const OUT_DIR = "dist";

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	const build = Bun.spawn(
		["bun", "build", "src/cli.ts", "--target", "node", "--outfile", "dist/cli.js"],
		{ stdout: "inherit", stderr: "inherit" },
	);
	const exitCode = await build.exited;
	if (exitCode !== 0) process.exit(exitCode);

	copyFileSync("scripts/launcher.cjs", "dist/bin.cjs");
	chmodSync("dist/bin.cjs", 0o755);
}

main();
