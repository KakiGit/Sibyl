export interface SibylPluginOptions {
  serverUrl?: string;
  apiKey?: string;
  autoSave?: boolean;
  autoSaveThreshold?: number;
}

export interface ApiOptions {
  serverUrl: string;
  apiKey?: string;
}

export interface SessionData {
  sessionId: string;
  rawResourceId: string | null;
  messageMetadata: Map<string, { messageId: string; role: string; timestamp: number }>;
  messageParts: Map<string, { text: string; timestamp: number }[]>;
  lastSyncVersion: number;
  createdAt: number;
  historyLoaded: boolean;
  historyChecked: boolean;
}

export interface MessageInfo {
  messageId: string;
  role: string;
  timestamp: number;
}

export interface MessagePart {
  text: string;
  timestamp: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface HookInputBase {
  conversation_id: string;
  generation_id: string;
  model: string;
  hook_event_name: string;
  workspace_roots: string[];
  user_email?: string;
  transcript_path?: string;
}

export interface SessionStartInput extends HookInputBase {
  session_id: string;
  is_background_agent: boolean;
  composer_mode?: string;
}

export interface SessionEndInput extends HookInputBase {
  session_id: string;
  reason: string;
  duration_ms: number;
  is_background_agent: boolean;
}

export interface HookOutput {
  env?: Record<string, string>;
  additional_context?: string;
}