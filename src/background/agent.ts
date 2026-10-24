import { emit } from "./bus";
import { closeGroupTabs, openInGroup } from "./tabs";
import { chatStream } from "../lib/opencode";
import { SYSTEM_PROMPT } from "../lib/prompt";
import {
  appendActivity,
  appendChat,
  clearActivities,
  getSettings,
  pushHistory,
  setState,
} from "../lib/storage";
import type {
  Activity,
  ApiMsg,
  ChatMessage,
  ResultCard,
  TaskState,
} from "../lib/types";
import { TOOLS } from "../tools";
import { toolSearch } from "../tools/search";
import { toolReadPage } from "../tools/read_page";

const MAX_ITERS = 40;

export interface RunState {
  taskId: string;
  status: TaskState["status"];
  camera: boolean;
  model: string;
  messages: ApiMsg[];
  finalTabIds: number[];
  winnerTabId?: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

let current: RunState | null = null;
let abort: AbortController | null = null;
let loopAlive = false;
let notificationTag = "";

export function getRun(): RunState | null {
  return current;
}

function mkId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function toTaskState(run: RunState | null): TaskState {
  if (!run) return { status: "idle", camera: false, model: "" };
  return {
    status: run.status,
    camera: run.camera,
    model: run.model,
    error: run.error,
    startedAt: run.startedAt,
  };
}

async function broadcastState(): Promise<void> {
  await setState(toTaskState(current));
  emit({ type: "state", state: toTaskState(current) });
}

async function activity(
  a: Omit<Activity, "id" | "at">,
): Promise<void> {
  const full: Activity = { ...a, id: mkId(), at: now() };
  await appendActivity(full);
  emit({ type: "activity", activity: full });
}

async function pushMessage(message: ChatMessage): Promise<void> {
  await appendChat(message);
  emit({ type: "message", message });
}

// --- cycle de vie ---

/**
 * Un message du patron : nouvelle mission s'il n'y en a pas, sinon on continue
 * la conversation en gardant tout le contexte — même après un finish, pour
 * qu'un « tu peux le faire » relance la mission au lieu de repartir de zéro.
 */
export async function sendMessage(text: string): Promise<void> {
  if (current?.status === "running") {
    throw new Error("Une mission est déjà en cours.");
  }
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("Pas de clé API OpenCode Go — règle les settings.");

  if (!current) {
    // première mission : contexte tout neuf
    await closeGroupTabs([]);
    await clearActivities();
    current = {
      taskId: mkId(),
      status: "running",
      camera: settings.cameraDefault,
      model: settings.model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      finalTabIds: [],
      startedAt: now(),
      updatedAt: now(),
    };
  } else {
    // suite de la conversation : le contexte précédent reste en mémoire
    current.status = "running";
    current.updatedAt = now();
  }
  current.messages.push({ role: "user", content: text });
  await pushMessage({ id: mkId(), role: "user", kind: "text", content: text, at: now() });
  await broadcastState();
  void runLoop();
}

export async function stopMission(): Promise<void> {
  abort?.abort();
  if (current) {
    current.status = "idle";
    current.updatedAt = now();
    await activity({ kind: "stop", label: "mission interrompue" });
    await broadcastState();
  }
}

export async function resetAll(): Promise<void> {
  abort?.abort();
  await closeGroupTabs([]);
  await clearActivities();
  current = null;
  await setState(toTaskState(null));
  emit({ type: "state", state: toTaskState(null) });
}

/** Réveil du service worker : reprend une mission interrompue par sa mort. */
export async function resumeIfNeeded(): Promise<void> {
  if (loopAlive) return;
  if (current?.status === "running") {
    await runLoop({ resume: true });
  }
}

// --- le loop ---

async function runLoop(opts: { resume?: boolean } = {}): Promise<void> {
  if (loopAlive || !current) return;
  loopAlive = true;
  abort = new AbortController();

  try {
    if (opts.resume) await recoverPendingTools();

    let iter = 0;
    while (current && current.status === "running" && iter++ < MAX_ITERS) {
      const settings = await getSettings();
      const turn = await chatStream({
        apiKey: settings.apiKey,
        model: current.model,
        sessionId: current.taskId,
        messages: current.messages,
        tools: TOOLS,
        onDelta: (text) => emit({ type: "delta", text }),
        signal: abort.signal,
      });

      const assistantMsg: ApiMsg = { role: "assistant", content: turn.content || "" };
      if (turn.toolCalls.length) {
        assistantMsg.tool_calls = turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.argsJson },
        }));
      }
      current.messages.push(assistantMsg);
      current.updatedAt = now();

      if (turn.content) {
        await pushMessage({
          id: mkId(),
          role: "assistant",
          kind: "text",
          content: turn.content,
          at: now(),
        });
      }

      if (!turn.toolCalls.length) {
        // texte seul : question de clarification ou bavardage → on attend le patron
        current.status = "waiting";
        current.updatedAt = now();
        await broadcastState();
        break;
      }

      const finishCall = turn.toolCalls.find((tc) => tc.name === "finish");
      if (finishCall) {
        await executeFinish(finishCall.argsJson);
        break;
      }

      for (const tc of turn.toolCalls) {
        const result = await safeExecTool(tc.name, tc.argsJson);
        current.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: result,
        });
        current.updatedAt = now();
      }
    }

    if (current && current.status === "running" && iter >= MAX_ITERS) {
      current.status = "error";
      current.error = "Trop d'étapes sans terminer la mission.";
      await activity({ kind: "error", label: "interrompu : trop d'étapes" });
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    if (current) {
      if (aborted) {
        current.status = "idle";
        await activity({ kind: "stop", label: "mission interrompue" });
      } else {
        current.status = "error";
        current.error = e instanceof Error ? e.message : String(e);
        await activity({ kind: "error", label: `erreur : ${current.error}` });
      }
    }
  } finally {
    loopAlive = false;
    abort = null;
    await broadcastState();
  }
}

async function safeExecTool(name: string, argsJson: string): Promise<string> {
  if (!current) return "ERREUR interne : plus de mission en cours.";
  try {
    const args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
    if (name === "search") {
      return await toolSearch(String(args.query ?? ""), current.camera, activity);
    }
    if (name === "read_page") {
      return await toolReadPage(String(args.url ?? ""), current.camera, activity);
    }
    return `ERREUR : outil inconnu « ${name} ».`;
  } catch (e) {
    return `ERREUR pendant l'exécution de ${name} : ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Après une mort du service worker, le dernier tour peut être inachevé :
 * assistant avec tool_calls mais sans les réponses d'outils. On rejoue ces
 * outils (les effets de bord — onglets — peuvent se dupliquer, acceptable).
 */
async function recoverPendingTools(): Promise<void> {
  if (!current) return;
  const last = current.messages.at(-1);
  if (!last || last.role !== "assistant" || !last.tool_calls?.length) return;
  const answered = new Set(
    current.messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
  );
  const pending = last.tool_calls.filter(
    (tc) => tc.function.name !== "finish" && !answered.has(tc.id),
  );
  for (const tc of pending) {
    const result = await safeExecTool(tc.function.name, tc.function.arguments);
    current.messages.push({
      role: "tool",
      tool_call_id: tc.id,
      name: tc.function.name,
      content: result,
    });
  }
}

// --- finish ---

async function executeFinish(argsJson: string): Promise<void> {
  if (!current) return;
  let card: ResultCard;
  try {
    const args = JSON.parse(argsJson || "{}");
    const links = (Array.isArray(args.links) ? args.links : []).slice(0, 5) as ResultCard["links"];
    card = { reportMd: String(args.report_md ?? ""), links };
  } catch {
    card = { reportMd: "Le webboy n'a pas su formater son rapport.", links: [] };
  }

  await activity({ kind: "finish", label: "mission terminée — ouverture des liens" });

  const seenUrls = new Set<string>();
  for (const link of card.links) {
    if (!link.url.startsWith("http") || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    const isFirst = current.finalTabIds.length === 0;
    // le gagnant passe devant, mais seulement si le patron n'a pas repris la main
    const tab = await openInGroup(link.url, { active: isFirst && current.camera });
    current.finalTabIds.push(tab.id!);
    if (isFirst && current.camera) current.winnerTabId = tab.id;
  }

  current.messages.push({
    role: "tool",
    tool_call_id: "finish",
    name: "finish",
    content: "Mission terminée, rapport livré.",
  });
  current.status = "done";
  current.updatedAt = now();

  const firstUser = current.messages.find((m) => m.role === "user");
  await pushHistory({
    taskId: current.taskId,
    task: firstUser?.content ?? "mission",
    at: now(),
    result: card,
  });
  await pushMessage({ id: mkId(), role: "assistant", kind: "card", card, at: now() });
  await notifyDone(card);
}

async function notifyDone(card: ResultCard): Promise<void> {
  const settings = await getSettings();
  if (!settings.notifyOnDone) return;
  const winner = card.links[0];
  notificationTag = current?.taskId ?? "";
  await chrome.notifications.create(notificationTag, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "🧢 Webboy a fini sa mission",
    message: winner ? `${winner.label} — ${winner.why}` : "Le rapport est prêt dans le panneau.",
    priority: 2,
  });
}

/** Clic sur la notif : focus sur l'onglet gagnant. */
export async function focusWinner(): Promise<void> {
  const run = current;
  if (!run?.winnerTabId) return;
  try {
    const tab = await chrome.tabs.get(run.winnerTabId);
    await chrome.tabs.update(tab.id!, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    /* onglet fermé entre-temps */
  }
}
