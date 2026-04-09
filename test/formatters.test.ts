import { test, expect, describe } from "bun:test";
import { formatDoctor, formatTools, formatInspect, formatCallResult } from "../src/formatters/text.ts";
import { formatDoctorJson, formatToolsJson, formatInspectJson, formatCallResultJson } from "../src/formatters/json.ts";

const mockServerInfo = { name: "WebStorm MCP Server", version: "2026.1" };

const mockTools = [
  {
    name: "get_file_problems",
    description: "Analyzes the specified file for errors.",
    inputSchema: {
      type: "object" as const,
      properties: { projectPath: { type: "string" }, path: { type: "string" } },
    },
  },
  {
    name: "search_text",
    description: "Searches for text in files.",
    inputSchema: {
      type: "object" as const,
      properties: { projectPath: { type: "string" }, query: { type: "string" } },
    },
  },
];

const mockCallResult = {
  content: [{ type: "text", text: '{"modules":[{"name":"app","type":"WEB_MODULE"}]}' }],
  structuredContent: { modules: [{ name: "app", type: "WEB_MODULE" }] },
  isError: false,
};

const mockErrorResult = {
  content: [{ type: "text", text: "File not found: foo.ts" }],
  isError: true,
};

// ─── Text formatters ────────────────────────────────────

describe("text formatters", () => {
  test("formatDoctor", () => {
    const output = formatDoctor({
      serverInfo: mockServerInfo,
      transport: "http",
      endpoint: "http://127.0.0.1:64342/stream",
      projectPath: "/my/project",
      toolCount: 41,
    });
    expect(output).toContain("WebStorm MCP Server");
    expect(output).toContain("2026.1");
    expect(output).toContain("http");
    expect(output).toContain("/my/project");
    expect(output).toContain("41");
    expect(output).toContain("connected");
  });

  test("formatTools shows name and first line of description", () => {
    const output = formatTools(mockTools);
    expect(output).toContain("get_file_problems");
    expect(output).toContain("search_text");
    expect(output).toContain("Analyzes the specified file");
  });

  test("formatInspect shows name, description, and schema", () => {
    const output = formatInspect(mockTools[0]);
    expect(output).toContain("get_file_problems");
    expect(output).toContain("Analyzes");
    expect(output).toContain("projectPath");
    expect(output).toContain("Input Schema");
  });

  test("formatCallResult uses structuredContent", () => {
    const output = formatCallResult(mockCallResult);
    expect(output).toContain("modules");
    expect(output).toContain("WEB_MODULE");
  });

  test("formatCallResult shows error prefix for error results", () => {
    const output = formatCallResult(mockErrorResult);
    expect(output).toContain("Error:");
    expect(output).toContain("File not found");
  });
});

// ─── JSON formatters ────────────────────────────────────

describe("json formatters", () => {
  test("formatDoctorJson produces valid JSON with stable fields", () => {
    const raw = formatDoctorJson({
      serverInfo: mockServerInfo,
      transport: "http",
      endpoint: "http://127.0.0.1:64342/stream",
      projectPath: "/my/project",
      toolCount: 41,
    });
    const parsed = JSON.parse(raw);
    expect(parsed.server).toEqual({ name: "WebStorm MCP Server", version: "2026.1" });
    expect(parsed.transport).toBe("http");
    expect(parsed.endpoint).toBe("http://127.0.0.1:64342/stream");
    expect(parsed.projectPath).toBe("/my/project");
    expect(parsed.toolCount).toBe(41);
    expect(parsed.status).toBe("connected");
  });

  test("formatToolsJson produces array of {name, description}", () => {
    const raw = formatToolsJson(mockTools);
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("get_file_problems");
    expect(parsed[0].description).toBe("Analyzes the specified file for errors.");
    expect(parsed[1].name).toBe("search_text");
  });

  test("formatInspectJson includes full schema", () => {
    const raw = formatInspectJson(mockTools[0]);
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("get_file_problems");
    expect(parsed.inputSchema.properties.projectPath).toBeDefined();
  });

  test("formatCallResultJson prefers structuredContent", () => {
    const raw = formatCallResultJson(mockCallResult);
    const parsed = JSON.parse(raw);
    expect(parsed.modules).toBeDefined();
    expect(parsed.modules[0].name).toBe("app");
  });

  test("formatCallResultJson falls back to content when no structuredContent", () => {
    const raw = formatCallResultJson({
      content: [{ type: "text", text: "hello" }],
      isError: false,
    });
    const parsed = JSON.parse(raw);
    expect(parsed[0].type).toBe("text");
    expect(parsed[0].text).toBe("hello");
  });
});
