#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const cliPath = join(__dirname, "cli.js");

if (!existsSync(cliPath)) {
	console.error("jbctl is not built correctly: dist/cli.js is missing");
	process.exit(1);
}

void import(pathToFileURL(cliPath).href).catch((importError) => {
	console.error(`jbctl failed to launch: ${importError.message}`);
	process.exit(1);
});
