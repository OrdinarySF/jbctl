import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { TransportType } from "./config.ts";

export function parseBaseUrl(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		url.hash = "";
		url.search = "";
		url.pathname = url.pathname.replace(/\/+$/, "");
		url.pathname = url.pathname.replace(/\/(stream|sse)$/, "") || "/";
		return url.toString().replace(/\/$/, "");
	} catch {
		return endpoint
			.replace(/[?#].*$/, "")
			.replace(/\/+$/, "")
			.replace(/\/(stream|sse)$/, "");
	}
}

function endpointPrefersSse(endpoint: string): boolean {
	return endpoint.replace(/[?#].*$/, "").replace(/\/+$/, "").endsWith("/sse");
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

	// auto: try the transport matching the URL suffix first, then fall back.
	if (endpointPrefersSse(endpoint)) {
		return [
			new SSEClientTransport(new URL(`${baseUrl}/sse`)),
			new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`)),
		];
	}
	return [
		new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`)),
		new SSEClientTransport(new URL(`${baseUrl}/sse`)),
	];
}
