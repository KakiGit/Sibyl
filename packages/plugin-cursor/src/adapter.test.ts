import { describe, test, expect } from "bun:test";
import { createCursorPlugin, getToolDescriptions } from "../src/adapter.js";

describe("createCursorPlugin", () => {
  test("creates plugin with tools", () => {
    const plugin = createCursorPlugin({});
    expect(plugin.tools).toBeDefined();
    expect(plugin.tools.memory_recall).toBeDefined();
    expect(plugin.tools.memory_list).toBeDefined();
    expect(plugin.tools.memory_query).toBeDefined();
  });

  test("creates plugin with session manager", () => {
    const plugin = createCursorPlugin({});
    expect(plugin.sessionManager).toBeDefined();
  });

  test("creates plugin with API options", () => {
    const plugin = createCursorPlugin({ serverUrl: "http://custom:4000" });
    expect(plugin.apiOptions.serverUrl).toBe("http://custom:4000");
  });

  test("creates plugin with getToolDescriptions", () => {
    const plugin = createCursorPlugin({});
    expect(plugin.getToolDescriptions).toBeDefined();
    expect(typeof plugin.getToolDescriptions).toBe("function");
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