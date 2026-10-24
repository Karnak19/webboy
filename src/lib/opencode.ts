import type { ApiMsg, ApiToolCall, ToolDef } from "./types";

const BASE = "https://opencode.ai/inference/go/openai/v1";
const MODELS_URL = "https://opencode.ai/inference/go/v1/models";
const UA = "webboy/0.1 (helium side panel)";

/**
 * L'endpoint Go expose plusieurs protocoles selon les modèles ; Webboy ne parle
 * que l'OpenAI-compatible. Ces modèles sont confirmés compatibles par la doc.
 */
export const OPENAI_COMPATIBLE_MODELS = [
  "glm-5.3-flash",
  "glm-5.3",
  "glm-5.2",
  "kimi-k3.1-pro",
  "kimi-k3",
  "kimi-k2.7-code",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "longcat-2.0",
  "longcat-2.5-preview-free",
  "mimo-v2.6-flash",
  "mimo-v2.6-pro",
  "minimax-m3.1-flash",
  "step-5-preview",
  "hy4-preview",
  "hy3",
  "beam-free",
];

export interface ChatResult {
  content: string;
  toolCalls: { id: string; name: string; argsJson: string }[];
}

interface StreamOptions {
  apiKey: string;
  model: string;
  sessionId: string;
  messages: ApiMsg[];
  tools?: ToolDef[];
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export async function chatStream(opts: StreamOptions): Promise<ChatResult> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      "User-Agent": UA,
      "x-opencode-session": opts.sessionId,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenCode Go HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    // certains fournisseurs répondent en JSON même en mode stream
    const json = await res.json();
    return pickTurn(json.choices?.[0]?.message ?? {}, opts.onDelta);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let delta: any;
      try {
        delta = JSON.parse(payload);
      } catch {
        continue;
      }
      const d = delta.choices?.[0]?.delta;
      if (!d) continue;
      if (typeof d.content === "string" && d.content) {
        content += d.content;
        opts.onDelta?.(d.content);
      }
      for (const tc of d.tool_calls ?? []) {
        const index: number = tc.index ?? 0;
        const acc = toolAcc.get(index) ?? { id: "", name: "", args: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
        toolAcc.set(index, acc);
      }
    }
  }

  const toolCalls = [...toolAcc.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, tc]) => tc.name)
    .map(([, tc]) => ({ id: tc.id, name: tc.name, argsJson: tc.args || "{}" }));
  return { content, toolCalls };
}

function pickTurn(
  message: { content?: string; tool_calls?: ApiToolCall[] },
  onDelta?: (t: string) => void,
): ChatResult {
  const content = message.content ?? "";
  if (content) onDelta?.(content);
  return {
    content,
    toolCalls: (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      argsJson: tc.function.arguments || "{}",
    })),
  };
}

export async function listModels(apiKey: string): Promise<string[]> {
  const headers: Record<string, string> = { "User-Agent": UA };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(MODELS_URL, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: any = await res.json();
  const raw: any[] = json.data ?? json.models ?? [];
  const ids = raw.map((m) => m.id ?? m.model ?? m.name).filter(Boolean);
  if (!ids.length) return OPENAI_COMPATIBLE_MODELS;
  // on ne propose que ce qu'on sait servir en OpenAI-compatible
  const usable = ids.filter((id: string) =>
    OPENAI_COMPATIBLE_MODELS.includes(id),
  );
  return usable.length ? usable : OPENAI_COMPATIBLE_MODELS;
}
