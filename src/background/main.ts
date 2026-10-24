import { emit, initBus } from "./bus";
import { initKeepalive } from "./keepalive";
import {
  focusWinner,
  getRun,
  resetAll,
  sendMessage,
  stopMission,
} from "./agent";
import { tabInGroup } from "./tabs";
import {
  appendActivity,
  getActivities,
  getChat,
  getHistory,
  getSettings,
  saveSettings,
  setState,
} from "../lib/storage";
import { listModels } from "../lib/opencode";
import type { Boot, RpcRequest } from "../lib/types";

// clic sur l'icône → ouvre le side panel
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function handleRpc(req: RpcRequest): Promise<unknown> {
  switch (req.type) {
    case "getBoot": {
      const run = getRun();
      const boot: Boot = {
        settings: await getSettings(),
        state: {
          status: run?.status ?? "idle",
          camera: run?.camera ?? false,
          model: run?.model ?? "",
        },
        chat: await getChat(),
        activities: await getActivities(),
      };
      return boot;
    }
    case "saveSettings":
      await saveSettings(req.settings);
      return null;
    case "listModels":
      return await listModels(req.apiKey ?? (await getSettings()).apiKey);
    case "send":
      await sendMessage(req.text);
      return null;
    case "stop":
      await stopMission();
      return null;
    case "reset":
      await resetAll();
      return null;
    case "getHistory":
      return await getHistory();
  }
}

initBus(handleRpc);
initKeepalive();

// le patron reprend la main : on quitte le mode caméra pour le reste de la mission
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    const run = getRun();
    if (!run || run.status !== "running" || !run.camera) return;
    if (await tabInGroup(tabId)) return;
    run.camera = false;
    const state = {
      status: run.status,
      camera: run.camera,
      model: run.model,
      error: run.error,
      startedAt: run.startedAt,
    };
    await setState(state);
    const a = {
      id: crypto.randomUUID(),
      kind: "eye" as const,
      label: "reprise de la main — mode vitrine",
      at: Date.now(),
    };
    await appendActivity(a);
    emit({ type: "activity", activity: a });
    emit({ type: "state", state });
  })();
});

chrome.notifications.onClicked.addListener(() => {
  void focusWinner();
});
