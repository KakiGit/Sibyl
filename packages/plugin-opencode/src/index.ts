import { createOpenCodePlugin } from "./adapter.js";
import type { SibylPluginOptions } from "@sibyl/plugin-core";

export default async function(input: unknown, options?: SibylPluginOptions) {
  return createOpenCodePlugin(input, options);
}

export { createOpenCodePlugin, getToolDescriptions } from "./adapter.js";
export type { SibylPluginOptions } from "@sibyl/plugin-core";