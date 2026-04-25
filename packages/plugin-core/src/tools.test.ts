import { describe, test, expect } from "bun:test";
import { createTools, getToolDescriptions } from "../src/tools.js";

describe("createTools", () => {
  test("creates all three tools", () => {
    const options = { serverUrl: "http://localhost:3000" };
    const tools = createTools(options);
    expect(tools.memory_recall).toBeDefined();
    expect(tools.memory_list).toBeDefined();
    expect(tools.memory_query).toBeDefined();
  });

  test("tools have descriptions", () => {
    const options = { serverUrl: "http://localhost:3000" };
    const tools = createTools(options);
    expect(tools.memory_recall.description).toContain("Search Wiki Pages");
    expect(tools.memory_list.description).toContain("List all Wiki Pages");
    expect(tools.memory_query.description).toContain("Query Wiki Pages");
  });

  test("tools have args defined", () => {
    const options = { serverUrl: "http://localhost:3000" };
    const tools = createTools(options);
    expect(tools.memory_recall.args.query).toBeDefined();
    expect(tools.memory_list.args.type).toBeDefined();
    expect(tools.memory_query.args.question).toBeDefined();
  });
});

describe("getToolDescriptions", () => {
  test("returns descriptions for all tools", () => {
    const result = getToolDescriptions();
    expect(result).toContain("memory_recall");
    expect(result).toContain("memory_list");
    expect(result).toContain("memory_query");
  });
});