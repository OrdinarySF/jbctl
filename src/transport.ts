import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { TransportType } from "./config.ts";
import { CliError } from "./errors.ts";

export async function createTransport(
  endpoint: string,
  transport: TransportType,
): Promise<Transport> {
  const baseUrl = endpoint.replace(/\/(stream|sse)$/, "");

  if (transport === "http") {
    return new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`));
  }

  if (transport === "sse") {
    return new SSEClientTransport(new URL(`${baseUrl}/sse`));
  }

  // auto: try Streamable HTTP first, fall back to SSE
  try {
    const t = new StreamableHTTPClientTransport(new URL(`${baseUrl}/stream`));
    return t;
  } catch {
    try {
      return new SSEClientTransport(new URL(`${baseUrl}/sse`));
    } catch (e: any) {
      throw new CliError("CONNECTION_ERROR", `Failed to connect to ${baseUrl}`, {
        tried: ["Streamable HTTP", "SSE"],
        cause: e.message,
      });
    }
  }
}
