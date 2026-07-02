import { describe, expect, test } from "bun:test";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createTransport, parseBaseUrl } from "../src/transport.ts";

describe("parseBaseUrl", () => {
	test("removes JetBrains MCP endpoint suffixes", () => {
		expect(parseBaseUrl("http://127.0.0.1:64342/stream")).toBe(
			"http://127.0.0.1:64342",
		);
		expect(parseBaseUrl("http://127.0.0.1:64342/sse")).toBe(
			"http://127.0.0.1:64342",
		);
	});

	test("removes endpoint suffixes with trailing slash", () => {
		expect(parseBaseUrl("http://127.0.0.1:64342/stream/")).toBe(
			"http://127.0.0.1:64342",
		);
		expect(parseBaseUrl("http://127.0.0.1:64342/sse/")).toBe(
			"http://127.0.0.1:64342",
		);
	});

	test("keeps bare base URLs unchanged except a trailing slash", () => {
		expect(parseBaseUrl("http://127.0.0.1:64342")).toBe(
			"http://127.0.0.1:64342",
		);
		expect(parseBaseUrl("http://127.0.0.1:64342/")).toBe(
			"http://127.0.0.1:64342",
		);
	});
});

describe("createTransport", () => {
	test("explicit http transport returns only Streamable HTTP", () => {
		const transport = createTransport("http://127.0.0.1:64342/sse", "http");
		expect(Array.isArray(transport)).toBe(false);
		expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
	});

	test("explicit sse transport returns only SSE", () => {
		const transport = createTransport("http://127.0.0.1:64342/stream", "sse");
		expect(Array.isArray(transport)).toBe(false);
		expect(transport).toBeInstanceOf(SSEClientTransport);
	});

	test("auto prefers Streamable HTTP for stream or bare endpoints, then falls back to SSE", () => {
		const streamCandidates = createTransport(
			"http://127.0.0.1:64342/stream",
			"auto",
		);
		expect(streamCandidates).toBeArrayOfSize(2);
		expect(streamCandidates[0]).toBeInstanceOf(StreamableHTTPClientTransport);
		expect(streamCandidates[1]).toBeInstanceOf(SSEClientTransport);

		const bareCandidates = createTransport("http://127.0.0.1:64342", "auto");
		expect(bareCandidates).toBeArrayOfSize(2);
		expect(bareCandidates[0]).toBeInstanceOf(StreamableHTTPClientTransport);
		expect(bareCandidates[1]).toBeInstanceOf(SSEClientTransport);
	});

	test("auto prefers SSE for sse endpoints, then falls back to Streamable HTTP", () => {
		const candidates = createTransport("http://127.0.0.1:64342/sse", "auto");
		expect(candidates).toBeArrayOfSize(2);
		expect(candidates[0]).toBeInstanceOf(SSEClientTransport);
		expect(candidates[1]).toBeInstanceOf(StreamableHTTPClientTransport);
	});

	test("auto recognizes sse endpoints with trailing slash", () => {
		const candidates = createTransport("http://127.0.0.1:64342/sse/", "auto");
		expect(candidates).toBeArrayOfSize(2);
		expect(candidates[0]).toBeInstanceOf(SSEClientTransport);
		expect(candidates[1]).toBeInstanceOf(StreamableHTTPClientTransport);
	});
});
