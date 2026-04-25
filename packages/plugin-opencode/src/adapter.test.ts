import { describe, test, expect } from "bun:test";
import { createOpenCodePlugin, getToolDescriptions } from "../src/adapter.js";

describe("createOpenCodePlugin", () => {
  test("creates plugin with tools", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.tool).toBeDefined();
    expect(plugin.tool.memory_recall).toBeDefined();
    expect(plugin.tool.memory_list).toBeDefined();
    expect(plugin.tool.memory_query).toBeDefined();
  });

  test("creates plugin with event handler", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.event).toBeDefined();
    expect(typeof plugin.event).toBe("function");
  });

  test("creates plugin with getToolDescriptions", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.getToolDescriptions).toBeDefined();
    expect(typeof plugin.getToolDescriptions).toBe("function");
  });

  test("uses custom server URL from options", () => {
    const plugin = createOpenCodePlugin({}, { serverUrl: "http://custom:4000" });
    expect(plugin).toBeDefined();
  });

  test("event handler returns early when autoSave is false", async () => {
    const plugin = createOpenCodePlugin({}, { autoSave: false });
    const result = await plugin.event({ type: "session.created", properties: { sessionID: "test" } });
    expect(result).toBeUndefined();
  });
});

describe("getToolDescriptions", () => {
  test("returns tool descriptions", () => {
    const result = getToolDescriptions();
    expect(result).toContain("memory_recall");
    expect(result).toContain("memory_list");
    expect(result).toContain("memory_query");
  });
});