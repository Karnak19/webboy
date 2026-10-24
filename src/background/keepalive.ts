import { resumeIfNeeded } from "./agent";

const ALARM = "webboy-heartbeat";

export function startHeartbeat(): void {
  // période minimale MV3 : 30 s — garde le service worker éveillé pendant une mission
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
}

export function stopHeartbeat(): void {
  void chrome.alarms.clear(ALARM);
}

export function initKeepalive(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== ALARM) return;
    void resumeIfNeeded();
  });
  chrome.runtime.onStartup.addListener(() => void resumeIfNeeded());
  chrome.runtime.onInstalled.addListener(() => void resumeIfNeeded());
}
