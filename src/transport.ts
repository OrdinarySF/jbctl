import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { TransportType } from "./config.ts";

export function parseBaseUrl(endpoint: string): string {
	return endpoint.replace(/\/(stream|sse)$/, "");
}

export function createTransport(
	endpoint: string,
	transport: TransportType,
): Transport | Transport[] {
	const baseUrl = parseBaseUrl(endpoint);

	if (transport === "http") {
		return new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`));
	}

	if (transport === "sse") {
		return new SSEClientTransport(new URL(`${baseUrl}/sse`));
	}

	// auto: infer preferred order from URL suffix, fallback to the other
	const prefersSSE = endpoint.endsWith("/sse");
	const sse = new SSEClientTransport(new URL(`${baseUrl}/sse`));
	const http = new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`));
	return prefersSSE ? [sse, http] : [http, sse];
}
