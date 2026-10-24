export interface Settings {
  apiKey: string;
  model: string;
  cameraDefault: boolean;
  notifyOnDone: boolean;
}

export type ActivityKind =
  | "search"
  | "read"
  | "open"
  | "finish"
  | "eye"
  | "stop"
  | "error";

export interface Activity {
  id: string;
  kind: ActivityKind;
  label: string;
  url?: string;
  at: number;
}

export interface FinalLink {
  url: string;
  label: string;
  why: string;
}

export interface ResultCard {
  reportMd: string;
  links: FinalLink[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  kind?: "text" | "card";
  content?: string;
  card?: ResultCard;
  at: number;
}

export type TaskStatus = "idle" | "running" | "waiting" | "done" | "error";

export interface TaskState {
  status: TaskStatus;
  camera: boolean;
  model: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface HistoryEntry {
  taskId: string;
  task: string;
  at: number;
  result: ResultCard;
}

// --- messages pour l'API (format OpenAI) ---

export interface ApiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ApiMsg {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

// --- communication panel <-> service worker ---

export type RpcRequest =
  | { id: string; type: "getBoot" }
  | { id: string; type: "saveSettings"; settings: Settings }
  | { id: string; type: "listModels"; apiKey?: string }
  | { id: string; type: "send"; text: string }
  | { id: string; type: "stop" }
  | { id: string; type: "reset" }
  | { id: string; type: "getHistory" };

export type RpcResponse =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: string };

export type PushEvent =
  | { type: "delta"; text: string }
  | { type: "message"; message: ChatMessage }
  | { type: "activity"; activity: Activity }
  | { type: "state"; state: TaskState };

export interface Boot {
  settings: Settings;
  state: TaskState;
  chat: ChatMessage[];
  activities: Activity[];
}
