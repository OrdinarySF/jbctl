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

	// auto: use the transport matching the URL suffix, fallback to the other
	if (endpoint.endsWith("/sse")) {
		return new SSEClientTransport(new URL(`${baseUrl}/sse`));
	}
	return new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`));
}
