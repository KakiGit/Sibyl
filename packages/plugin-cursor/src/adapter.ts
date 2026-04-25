import { getServerUrl } from "@sibyl/shared";
import { ApiOptions, SibylPluginOptions, SessionManager, createTools, getToolDescriptions } from "@sibyl/plugin-core";

export function createCursorPlugin(options?: SibylPluginOptions) {
  const serverUrl = options?.serverUrl || getServerUrl();
  const apiKey = options?.apiKey || process.env.SIBYL_API_KEY;
  const autoSaveThreshold = options?.autoSaveThreshold ?? parseInt(process.env.SIBYL_AUTO_SAVE_THRESHOLD || "1", 10);

  const apiOptions: ApiOptions = { serverUrl, apiKey };
  const sessionManager = new SessionManager(apiOptions, autoSaveThreshold);

  const tools = createTools(apiOptions);

  return {
    tools,
    sessionManager,
    apiOptions,
    getToolDescriptions,
  };
}

export { getToolDescriptions } from "@sibyl/plugin-core";