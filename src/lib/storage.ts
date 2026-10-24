import type {
  Activity,
  ChatMessage,
  HistoryEntry,
  Settings,
  TaskState,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "glm-5.3-flash",
  cameraDefault: true,
  notifyOnDone: true,
};

const K_SETTINGS = "webboy:settings";
const K_CHAT = "webboy:chat";
const K_ACTIVITIES = "webboy:activities";
const K_HISTORY = "webboy:history";
const K_STATE = "webboy:state";

// --- settings (local) ---

export async function getSettings(): Promise<Settings> {
  const row = await chrome.storage.local.get(K_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(row[K_SETTINGS] ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [K_SETTINGS]: settings });
}

// --- chat + activités (local : survivent au redémarrage du navigateur) ---

export async function getChat(): Promise<ChatMessage[]> {
  const row = await chrome.storage.local.get(K_CHAT);
  return row[K_CHAT] ?? [];
}

export async function appendChat(message: ChatMessage): Promise<void> {
  const chat = await getChat();
  chat.push(message);
  await chrome.storage.local.set({ [K_CHAT]: chat.slice(-200) });
}

export async function setChat(chat: ChatMessage[]): Promise<void> {
  await chrome.storage.local.set({ [K_CHAT]: chat.slice(-200) });
}

export async function getActivities(): Promise<Activity[]> {
  const row = await chrome.storage.local.get(K_ACTIVITIES);
  return row[K_ACTIVITIES] ?? [];
}

export async function appendActivity(activity: Activity): Promise<void> {
  const activities = await getActivities();
  activities.push(activity);
  await chrome.storage.local.set({ [K_ACTIVITIES]: activities.slice(-100) });
}

export async function clearActivities(): Promise<void> {
  await chrome.storage.local.set({ [K_ACTIVITIES]: [] });
}

// --- historique des missions terminées (local) ---

export async function getHistory(): Promise<HistoryEntry[]> {
  const row = await chrome.storage.local.get(K_HISTORY);
  return row[K_HISTORY] ?? [];
}

export async function pushHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  await chrome.storage.local.set({ [K_HISTORY]: history.slice(0, 50) });
}

// --- état de la mission courante (session : vit avec le service worker) ---

export async function getState(): Promise<TaskState | null> {
  const row = await chrome.storage.session.get(K_STATE);
  return row[K_STATE] ?? null;
}

export async function setState(state: TaskState): Promise<void> {
  await chrome.storage.session.set({ [K_STATE]: state });
}
